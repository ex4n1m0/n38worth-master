/**
 * Mainframe City — camera rig (client-only; DOM Pointer Events + wheel).
 *
 * Input surface per RTS plan §D1 deliverable 2:
 *   - single-pointer drag pan (setPointerCapture)
 *   - wheel zoom AT THE CURSOR (world point under the cursor is preserved)
 *   - two-pointer pinch (zoom at the midpoint + mid-point pan)
 *   - WASD / arrow-key pan, +/- zoom steps, R reset-to-HQ
 *   - tap (press < 500 ms, < 10 px movement) → selection/picking callback
 *
 * FREE CAMERA (2026-09-28): pan and zoom-out are unbounded — the rig never
 * clamps position against world bounds (the pure camera module owns the
 * only remaining clamp, the zoom ceiling).
 *
 * Direct manipulations (drag/pinch/wheel) apply 1:1 with no easing;
 * programmatic moves (reset, focus, HUD buttons) glide via the motion
 * policy and SNAP under prefers-reduced-motion. All math delegates to the
 * pure camera module — this class only owns listeners and lifecycle.
 *
 * `touch-action: none` is set on the canvas by CityScene so pointer events
 * are never stolen by native scrolling.
 */

import {
  approachCamera,
  clampCamera,
  clampZoom,
  panBy,
  screenToWorld,
  zoomAt,
  type CameraState,
  type Viewport,
} from "@/lib/city/scene/camera";
import { easeOutCubic } from "@/lib/city/scene/motion";

const KEY_PAN_SPEED = 520; // screen px per second
const ZOOM_STEP = 0.2;
const TAP_MAX_MS = 500;
const TAP_MAX_DIST = 10;
const SETTLE_DEBOUNCE_MS = 180;

export interface CameraRigOptions {
  /** Element receiving pointer + keyboard events (the canvas host). */
  element: HTMLElement;
  getViewport: () => Viewport;
  /** Home framing (HQ anchor) for Reset — required (free camera has no
   *  world-bounds fallback to center on). */
  getHomeCamera: () => CameraState;
  /** Push a camera into the world container transform. */
  applyCamera: (camera: CameraState) => void;
  /** Ask the scene for a render (dirty flag pattern). */
  requestRender: () => void;
  /** Fired once when the camera stops moving (HUD sector label source). */
  onSettled: (camera: CameraState) => void;
  /** Short press on the canvas — picking/selection/ghost move. */
  onTap: (worldX: number, worldY: number) => void;
  /** Reduced-motion resolver (policy decides snap vs glide). */
  isReduced: () => boolean;
}

interface PointerRecord {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  startAt: number;
  moved: boolean;
}

export class CameraRig {
  private readonly opts: CameraRigOptions;
  private camera: CameraState;
  private target: CameraState;
  private animStart = 0;
  private animating = false;
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, PointerRecord>();
  private pinchDist = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private settled = true;
  private disposed = false;

  constructor(opts: CameraRigOptions, initial: CameraState) {
    this.opts = opts;
    this.camera = { ...initial };
    this.target = { ...initial };
    this.bind();
  }

  get state(): CameraState {
    return { ...this.camera };
  }

  // ── lifecycle ─────────────────────────────────────────────────────────

  private bind(): void {
    const el = this.opts.element;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointercancel", this.onPointerUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
    el.addEventListener("keydown", this.onKeyDown);
    el.addEventListener("keyup", this.onKeyUp);
    // Stop the browser's native touch gestures on the canvas host.
    el.style.touchAction = "none";
  }

  destroy(): void {
    this.disposed = true;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    const el = this.opts.element;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointercancel", this.onPointerUp);
    el.removeEventListener("wheel", this.onWheel);
    el.removeEventListener("keydown", this.onKeyDown);
    el.removeEventListener("keyup", this.onKeyUp);
  }

  // ── immediate (direct manipulation) ───────────────────────────────────

  private setImmediate(next: CameraState): void {
    this.camera = next;
    this.target = { ...next };
    this.animating = false;
    this.opts.applyCamera(this.camera);
    this.markInteraction();
  }

  private markInteraction(): void {
    this.settled = false;
    this.opts.requestRender();
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => this.checkSettled(), SETTLE_DEBOUNCE_MS);
  }

  private checkSettled(): void {
    if (this.disposed || this.settled) return;
    if (this.keys.size > 0 || this.pointers.size > 0 || this.animating) return;
    this.settled = true;
    this.opts.onSettled(this.camera);
  }

  // ── programmatic (glide or snap) ──────────────────────────────────────

  animateTo(next: CameraState): void {
    if (this.opts.isReduced()) {
      this.setImmediate(clampCamera(next));
      return;
    }
    this.target = clampCamera(next);
    this.animStart = performance.now();
    this.animating = true;
    this.markInteraction();
  }

  /**
   * HUD +/- step. Additive above zoom 1, MULTIPLICATIVE below it — a flat
   * −0.2 would slam straight to the sub-pixel floor once the city is small
   * on screen, while ×0.8 keeps stepping down through the infinite zoom-out
   * at a constant perceived rate.
   */
  zoomBy(delta: number): void {
    const base = this.camera.zoom;
    const next =
      delta < 0 && base <= 1
        ? base * (1 + delta) // e.g. −0.2 → ×0.8
        : base + delta;
    this.animateTo({ ...this.camera, zoom: clampZoom(next) });
  }

  /**
   * Reset glides HOME — the HQ anchor (city core + landmark ring), never a
   * content fit: multi-sector cities spread over the whole macro grid, so a
   * content fit centers on the empty gap between sector clusters.
   */
  reset(): void {
    this.animateTo(this.opts.getHomeCamera());
  }

  focusWorldPoint(x: number, y: number): void {
    this.animateTo({ x, y, zoom: Math.max(1.2, this.camera.zoom) });
  }

  /**
   * Viewport changed (resize) — re-apply the camera transform (free camera:
   * nothing to re-clamp) and keep any in-flight glide target alive.
   */
  onResize(): void {
    this.camera = clampCamera(this.camera);
    this.target = clampCamera(this.target);
    this.opts.applyCamera(this.camera);
    this.markInteraction();
  }

  // ── frame update ──────────────────────────────────────────────────────

  /** Advance keyboard pan + glide animation. True while active. */
  update(): boolean {
    if (this.disposed) return false;
    let busy = false;

    if (this.keys.size > 0) {
      let dx = 0;
      let dy = 0;
      if (this.keys.has("a") || this.keys.has("ArrowLeft")) dx -= 1;
      if (this.keys.has("d") || this.keys.has("ArrowRight")) dx += 1;
      if (this.keys.has("w") || this.keys.has("ArrowUp")) dy -= 1;
      if (this.keys.has("s") || this.keys.has("ArrowDown")) dy += 1;
      if (dx !== 0 || dy !== 0) {
        const dt = 1 / 60;
        this.camera = clampCamera(
          panBy(this.camera, dx * KEY_PAN_SPEED * dt, dy * KEY_PAN_SPEED * dt)
        );
        this.target = { ...this.camera };
        this.opts.applyCamera(this.camera);
        busy = true;
      }
    }

    if (this.animating) {
      const cameraMs = 260;
      const t = easeOutCubic(Math.min(1, (performance.now() - this.animStart) / cameraMs));
      const step = approachCamera(this.camera, this.target, t, false);
      this.camera = step.camera;
      this.opts.applyCamera(this.camera);
      if (step.done) {
        this.animating = false;
        this.markInteraction();
      } else {
        busy = true;
      }
    }

    if (busy) this.opts.requestRender();
    else this.checkSettled();
    return busy;
  }

  // ── pointer events ────────────────────────────────────────────────────

  /**
   * HUD buttons/status overlays live INSIDE the canvas host, so their pointer
   * events bubble down here — without this guard every HUD tap would also act
   * as a canvas tap (selection/picking/ghost-move) at the button's position.
   */
  private isHudEvent(e: Event): boolean {
    const target = e.target as Element | null;
    return !!target?.closest?.("[data-city-hud]");
  }

  private localPoint(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const rect = this.opts.element.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.disposed || this.isHudEvent(e)) return;
    const p = this.localPoint(e);
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      x: p.x,
      y: p.y,
      startX: p.x,
      startY: p.y,
      startAt: performance.now(),
      moved: false,
    });
    try {
      this.opts.element.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    this.markInteraction();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.disposed) return;
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    const p = this.localPoint(e);
    const dx = p.x - rec.x;
    const dy = p.y - rec.y;
    rec.x = p.x;
    rec.y = p.y;
    if (Math.hypot(p.x - rec.startX, p.y - rec.startY) > TAP_MAX_DIST) rec.moved = true;

    if (this.pointers.size === 1) {
      this.setImmediate(clampCamera(panBy(this.camera, dx, dy)));
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0 && dist > 0) {
        const factor = dist / this.pinchDist;
        this.setImmediate(
          zoomAt(this.camera, this.opts.getViewport(), mid.x, mid.y, this.camera.zoom * factor)
        );
      }
      this.pinchDist = dist;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.disposed) return;
    const rec = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.pinchDist = 0;
    if (!rec) return;
    try {
      this.opts.element.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const quick = performance.now() - rec.startAt < TAP_MAX_MS;
    if (!rec.moved && quick && this.pointers.size === 0) {
      const world = screenToWorld(this.camera, this.opts.getViewport(), rec.x, rec.y);
      this.opts.onTap(world.x, world.y);
    }
    this.markInteraction();
  };

  // ── wheel + keys ──────────────────────────────────────────────────────

  private onWheel = (e: WheelEvent): void => {
    if (this.disposed || this.isHudEvent(e)) return;
    e.preventDefault();
    const p = this.localPoint(e);
    const factor = Math.exp(-e.deltaY * 0.0016);
    this.setImmediate(
      zoomAt(this.camera, this.opts.getViewport(), p.x, p.y, this.camera.zoom * factor)
    );
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.disposed) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest?.("input, textarea, select, [contenteditable=true]")) return;
    const key = e.key;
    const panKeys = ["w", "a", "s", "d", "W", "A", "S", "D", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (panKeys.includes(key)) {
      e.preventDefault();
      this.keys.add(key);
      this.markInteraction();
      return;
    }
    if (key === "+" || key === "=") {
      e.preventDefault();
      this.zoomBy(ZOOM_STEP);
      return;
    }
    if (key === "-" || key === "_") {
      e.preventDefault();
      this.zoomBy(-ZOOM_STEP);
      return;
    }
    if (key === "r" || key === "R") {
      e.preventDefault();
      this.reset();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key);
    this.markInteraction();
  };
}
