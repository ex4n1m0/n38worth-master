import { describe, expect, it } from "vitest";
import {
  FIT_CONTENT_MAX_ZOOM,
  FIT_MARGIN,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  approachCamera,
  cameraPanBounds,
  clampCamera,
  clampZoom,
  fitCameraToBounds,
  panBy,
  resetCamera,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from "@/lib/city/scene/camera";

const WORLD = { minX: -2048, minY: -1024, maxX: 2048, maxY: 1024 };
const VIEW = { width: 800, height: 600 };

describe("camera zoom clamp", () => {
  it("clamps into [0.32, 2.5] and survives NaN", () => {
    expect(ZOOM_MIN).toBe(0.32);
    expect(ZOOM_MAX).toBe(2.5);
    expect(clampZoom(0.1)).toBe(0.32);
    expect(clampZoom(9)).toBe(2.5);
    expect(clampZoom(1.3)).toBe(1.3);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
  });
});

describe("camera pan bounds", () => {
  it("keeps the visible rect inside the world", () => {
    const b = cameraPanBounds(WORLD, VIEW, 1);
    expect(b.minX).toBe(WORLD.minX + VIEW.width / 2);
    expect(b.maxX).toBe(WORLD.maxX - VIEW.width / 2);
  });

  it("degenerates to the center when the viewport exceeds the world", () => {
    const tiny = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const b = cameraPanBounds(tiny, VIEW, 1);
    expect(b.minX).toBeGreaterThan(b.maxX); // caller collapses via clampCamera
    const cam = clampCamera({ x: 10_000, y: -10_000, zoom: 1 }, tiny, VIEW);
    expect(cam.x).toBe(50); // world center, not a bound
    expect(cam.y).toBe(50);
  });
});

describe("clampCamera", () => {
  it("clamps position and zoom together", () => {
    const cam = clampCamera({ x: 99_999, y: -99_999, zoom: 99 }, WORLD, VIEW);
    expect(cam.zoom).toBe(ZOOM_MAX);
    const b = cameraPanBounds(WORLD, VIEW, ZOOM_MAX);
    expect(cam.x).toBe(b.maxX);
    expect(cam.y).toBe(b.minY);
  });
});

describe("screen/world transforms", () => {
  it("round-trips screen → world → screen", () => {
    const cam = { x: 120, y: -40, zoom: 1.7 };
    const w = screenToWorld(cam, VIEW, 321, 111);
    const s = worldToScreen(cam, VIEW, w.x, w.y);
    expect(s.x).toBeCloseTo(321, 8);
    expect(s.y).toBeCloseTo(111, 8);
  });

  it("maps the camera center to the viewport center", () => {
    const cam = { x: 500, y: 300, zoom: 0.8 };
    const center = worldToScreen(cam, VIEW, cam.x, cam.y);
    expect(center).toEqual({ x: VIEW.width / 2, y: VIEW.height / 2 });
  });
});

describe("zoomAt (cursor-anchored zoom)", () => {
  it("keeps the world point under the cursor fixed", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const sx = 613;
    const sy = 217;
    const before = screenToWorld(cam, VIEW, sx, sy);
    const next = zoomAt(cam, WORLD, VIEW, sx, sy, 2.2);
    const after = screenToWorld(next, VIEW, sx, sy);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("clamps the resulting camera into the pan bounds", () => {
    const cam = { x: 0, y: 0, zoom: ZOOM_MIN };
    const next = zoomAt(cam, WORLD, VIEW, 0, 0, ZOOM_MAX);
    const b = cameraPanBounds(WORLD, VIEW, ZOOM_MAX);
    expect(next.x).toBeGreaterThanOrEqual(b.minX);
    expect(next.x).toBeLessThanOrEqual(b.maxX);
    expect(next.y).toBeGreaterThanOrEqual(b.minY);
    expect(next.y).toBeLessThanOrEqual(b.maxY);
    expect(next.zoom).toBe(ZOOM_MAX);
  });
});

describe("panBy", () => {
  it("moves the camera against the drag delta, scaled by zoom", () => {
    const cam = { x: 0, y: 0, zoom: 2 };
    // Huge world so the pan bounds don't clamp the result.
    const huge = { minX: -1e6, minY: -1e6, maxX: 1e6, maxY: 1e6 };
    const next = panBy(cam, huge, VIEW, 100, 50);
    expect(next.x).toBeCloseTo(-50, 8);
    expect(next.y).toBeCloseTo(-25, 8);
  });
});

describe("reset + approach", () => {
  it("resets to the HQ target at the default zoom", () => {
    expect(resetCamera({ x: 12, y: 34 })).toEqual({ x: 12, y: 34, zoom: ZOOM_DEFAULT });
  });

  it("lerps toward the target, snaps when done or reduced", () => {
    const cur = { x: 0, y: 0, zoom: 1 };
    const target = { x: 100, y: 100, zoom: 2 };
    const half = approachCamera(cur, target, 0.5, false);
    expect(half.camera.x).toBe(50);
    expect(half.done).toBe(false);
    const done = approachCamera(cur, target, 1, false);
    expect(done.camera).toEqual(target);
    expect(done.done).toBe(true);
    const snap = approachCamera(cur, target, 0.01, true);
    expect(snap.camera).toEqual(target);
    expect(snap.done).toBe(true);
  });
});

describe("fitCameraToBounds (initial/reset framing)", () => {
  // Asymmetric content (e.g. Boot + North sector unlocked): the bounds
  // center is NOT the HQ — the old HQ-anchored framing clipped one edge.
  const CONTENT = { minX: 128, minY: 1056, maxX: 4224, maxY: 4256 };
  const cx = (CONTENT.minX + CONTENT.maxX) / 2;
  const cy = (CONTENT.minY + CONTENT.maxY) / 2;

  it("centers the content bounding box in landscape AND portrait", () => {
    for (const view of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 }, // mobile portrait
    ]) {
      const cam = fitCameraToBounds(CONTENT, view);
      expect(cam.x).toBe(cx);
      expect(cam.y).toBe(cy);
      expect(cam.zoom).toBeGreaterThanOrEqual(ZOOM_MIN);
      expect(cam.zoom).toBeLessThanOrEqual(ZOOM_DEFAULT);
    }
  });

  it("fits content smaller than the viewport at the default zoom cap", () => {
    const small = { minX: 0, minY: 0, maxX: 400, maxY: 200 };
    const view = { width: 800, height: 600 };
    const cam = fitCameraToBounds(small, view);
    expect(cam.zoom).toBe(ZOOM_DEFAULT); // fit > 1 → capped at the default
    // Viewport exceeds the world → camera parks at the world center.
    expect(cam.x).toBe(200);
    expect(cam.y).toBe(100);
  });

  it("zooms out just enough to fit the tighter dimension (with margin)", () => {
    const wide = { minX: 0, minY: 0, maxX: 2000, maxY: 500 };
    const view = { width: 2000, height: 800 };
    const cam = fitCameraToBounds(wide, view);
    // Width is the binding constraint: 2000 * FIT_MARGIN / 2000 = 0.92.
    expect(cam.zoom).toBeCloseTo((view.width * FIT_MARGIN) / 2000, 8);
    expect(cam.x).toBe(1000);
    expect(cam.y).toBe(250);
  });

  it("never leaves the zoom band, even for a huge city in a narrow viewport", () => {
    const huge = { minX: -4096, minY: -2048, maxX: 4096, maxY: 2048 };
    const portrait = { width: 390, height: 844 };
    const cam = fitCameraToBounds(huge, portrait);
    expect(cam.zoom).toBe(ZOOM_MIN); // fit ≈ 0.09 → clamped to the band
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(0);
  });

  it("content-fit ceiling: compact content reaches the close-LOD band", () => {
    const compact = { minX: -300, minY: 100, maxX: 300, maxY: 400 };
    const view = { width: 1047, height: 539 };
    const cam = fitCameraToBounds(compact, view, FIT_CONTENT_MAX_ZOOM);
    // fit ≈ min(1047*.92/600, 539*.92/300) = 1.6 → capped at 1.4 (> 1.2 close LOD).
    expect(cam.zoom).toBe(FIT_CONTENT_MAX_ZOOM);
    expect(cam.x).toBe(0);
    expect(cam.y).toBe(250);
  });
});
