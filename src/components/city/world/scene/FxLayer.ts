/**
 * Mainframe City — one-shot FX layer (client-only Pixi).
 *
 * Effects, all driven by the pure diff module + placement mutations:
 *   construct — expanding ring + rising flash at a NEW building (hire)
 *   loss      — red glitch/implosion at the last tile of a REMOVED building
 *   lostSignal— static "LOST SIGNAL" foundation marker held ~10s on the
 *               vacated tile afterwards (Phase C §"Loss and restoration");
 *               deliberately NOT collapsed by reduced-motion — it is an
 *               informational state, not movement. The glitch that precedes
 *               it does collapse.
 *   tierUp    — upgrade presentation (RTS plan §"Upgrade presentation"):
 *               holographic next-silhouette outline → rising layer
 *               crossfade → brief value+tier flash label (i18n via the
 *               label strings the shell passes into the scene)
 *   spawnRing — one-shot ~2s highlight ring on a JUST-PLACED building
 *               (fires only after the layout POST succeeded — the server has
 *               confirmed; buildings still appear only via the refetched
 *               projection)
 *
 * Reduced motion (motion.ts policy): animation durations collapse to 0, so
 * each ANIMATED effect renders exactly ONE terminal frame and finishes — a
 * state swap, not an animation (RTS plan §D1). The layer reports activity so
 * the scene can stop its render loop when idle (render-on-demand).
 */

import { Container, Graphics, Text } from "pixi.js";
import { animationProgress, easeOutCubic, type MotionPolicy } from "@/lib/city/scene/motion";
import { COLOR_HARDLOCK, drawFamilyWireframe, drawIsoBox, familyTopHeight } from "./art";
import type { BuildingTier } from "@/lib/city/types";

interface OneShot {
  root: Container;
  startedAt: number;
  durationMs: number;
  draw: (p: number) => void;
  /** Static markers (lost-signal) never keep the render loop alive. */
  idle?: boolean;
  /** Timer-backed removal for the long-lived lost-signal markers. */
  timer?: ReturnType<typeof setTimeout>;
  onExpire?: () => void;
}

export interface TierUpFx {
  profession: string | null;
  fromTier: BuildingTier;
  toTier: BuildingTier;
  /** Pre-localized "T{tier} · {value}¢" string (shell resolves i18n). */
  label: string;
}

/** How long the lost-signal foundation stays on the tile (~10s, Phase C). */
export const LOST_SIGNAL_MS = 10_000;
/** Just-placed spawn marker duration (Phase C polish d). */
export const SPAWN_RING_MS = 2_000;
/** Sector-unlock celebration duration (Phase D). */
export const SECTOR_UNLOCK_MS = 600;

export class FxLayer extends Container {
  private policy: MotionPolicy;
  private readonly shots: OneShot[] = [];

  constructor(policy: MotionPolicy) {
    super();
    this.policy = policy;
  }

  setPolicy(policy: MotionPolicy): void {
    this.policy = policy;
  }

  private play(
    durationMs: number,
    build: () => { root: Container; draw: (p: number) => void }
  ): void {
    const { root, draw } = build();
    this.addChild(root);
    this.shots.push({
      root,
      startedAt: performance.now(),
      durationMs: this.policy.reduced ? 0 : durationMs,
      draw,
    });
  }

  /** Construct FX: cyan ring expanding + bar rising from the tile. */
  playConstruct(x: number, y: number): void {
    this.play(this.policy.constructMs, () => {
      const g = new Graphics();
      const root = new Container();
      root.addChild(g);
      root.position.set(x, y);
      return {
        root,
        draw: (p) => {
          g.clear();
          const eased = easeOutCubic(p);
          g.ellipse(0, 0, 8 + 46 * eased, 4 + 23 * eased).stroke({
            width: 2.5,
            color: 0x22d3ee,
            alpha: 1 - p,
          });
          g.rect(-3, -60 * eased, 6, 60 * eased).fill({
            color: 0x9be8ff,
            alpha: 0.5 * (1 - p),
          });
        },
      };
    });
  }

  /** Loss FX: red glitch shards + implosion ring at the vacated tile. */
  playLoss(x: number, y: number): void {
    this.play(this.policy.lossMs, () => {
      const g = new Graphics();
      const root = new Container();
      root.addChild(g);
      root.position.set(x, y);
      return {
        root,
        draw: (p) => {
          g.clear();
          const eased = easeOutCubic(p);
          g.ellipse(0, 0, 44 * (1 - eased) + 6, 22 * (1 - eased) + 3).stroke({
            width: 3,
            color: 0xef4444,
            alpha: 1 - p,
          });
          // Glitch shards: horizontal red dashes tearing upward, deterministic.
          for (let i = 0; i < 4; i++) {
            const t = Math.max(0, p * 1.6 - i * 0.12);
            if (t >= 1) continue;
            const w = 26 - i * 5;
            const yy = -10 - i * 14 - t * 26;
            g.rect(-w / 2 + (i % 2 === 0 ? 4 : -4), yy, w, 3).fill({
              color: 0xef4444,
              alpha: (1 - t) * 0.85,
            });
          }
        },
      };
    });
  }

  /**
   * Lost-signal foundation: dim hatched diamond + "SIGNAL LOST" chip held on
   * the tile for LOST_SIGNAL_MS. Static by design (works identically under
   * reduced motion); purely visual — server data stays authoritative.
   */
  playLostSignal(x: number, y: number, label: string, onExpire: () => void): void {
    const g = new Graphics();
    // Hatched foundation: dashed diamond border + cross-brace.
    g.ellipse(0, 0, 34, 17).stroke({ width: 1.5, color: 0xef4444, alpha: 0.5 });
    g.moveTo(-22, -11).lineTo(22, 11).stroke({ width: 1, color: 0xef4444, alpha: 0.3 });
    g.moveTo(22, -11).lineTo(-22, 11).stroke({ width: 1, color: 0xef4444, alpha: 0.3 });

    const text = new Text({
      text: label,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 10,
        fontWeight: "bold",
        letterSpacing: 1,
        fill: 0xfca5a5,
        stroke: { color: 0x05070d, width: 3 },
      },
    });
    text.anchor.set(0.5);
    text.position.set(0, -14);

    const root = new Container();
    root.addChild(g, text);
    root.position.set(x, y);
    this.addChild(root);

    const shot: OneShot = {
      root,
      startedAt: performance.now(),
      durationMs: LOST_SIGNAL_MS,
      draw: () => {
        /* static marker — nothing to animate */
      },
      idle: true,
      onExpire,
    };
    shot.timer = setTimeout(() => this.finishShot(shot), LOST_SIGNAL_MS);
    this.shots.push(shot);
  }

  /**
   * Tier-up FX — the full upgrade presentation:
   *   0.00–0.35  holographic outline of the NEXT silhouette flickers in
   *   0.25–0.70  the new layer rises / crossfades into place (family color)
   *   0.55–1.00  value+tier flash label fades out; golden ring expands
   */
  playTierUp(x: number, y: number, topY: number, fx: TierUpFx): void {
    this.play(this.policy.tierUpMs, () => {
      const holo = new Graphics();
      const rise = new Graphics();
      const ring = new Graphics();
      const label = new Text({
        text: fx.label,
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize: 13,
          fontWeight: "bold",
          fill: 0xfde68a,
          stroke: { color: 0x05070d, width: 3 },
        },
      });
      label.anchor.set(0.5);
      label.alpha = 0;
      const root = new Container();
      root.addChild(holo, rise, ring, label);
      root.position.set(x, y);

      const newHeight = familyTopHeight(fx.profession, fx.toTier);
      const oldHeight = familyTopHeight(fx.profession, fx.fromTier);

      return {
        root,
        draw: (p) => {
          // Phase 1 — holographic next-silhouette preview (with flicker).
          holo.clear();
          if (p < 0.7) {
            const flicker = 0.85 + 0.15 * Math.sin(p * 40);
            const holoAlpha = Math.min(1, p / 0.25) * flicker * (1 - p / 0.7);
            drawFamilyWireframe(holo, fx.profession, fx.toTier, Math.max(0, holoAlpha));
          }
          // Phase 2 — the new structural layer rises into place.
          rise.clear();
          if (p > 0.25) {
            const t = easeOutCubic((p - 0.25) / 0.45);
            const grown = oldHeight + (newHeight - oldHeight) * t;
            drawIsoBox(rise, 0, 0, 26, 13, grown, 0xfbbf24, 0.22 * t);
          }
          // Phase 3 — flash label + expanding ring.
          ring.clear();
          const eased = easeOutCubic(p);
          ring.ellipse(0, 0, 10 + 34 * eased, 5 + 17 * eased).stroke({
            width: 3,
            color: 0xfbbf24,
            alpha: 1 - p,
          });
          const labelPhase = p < 0.55 ? 0 : (p - 0.55) / 0.45;
          label.alpha = p < 0.55 ? 0 : 1 - easeOutCubic(labelPhase);
          label.y = topY - 18 - easeOutCubic(labelPhase) * 10;
        },
      };
    });
  }

  /** Landmark ignition (goddess acquired): single white/gold bloom. */
  playLandmark(x: number, y: number): void {
    this.play(520, () => {
      const g = new Graphics();
      const root = new Container();
      root.addChild(g);
      root.position.set(x, y);
      return {
        root,
        draw: (p) => {
          g.clear();
          const eased = easeOutCubic(p);
          g.ellipse(0, 0, 6 + 30 * eased, 3 + 15 * eased).stroke({
            width: 2,
            color: COLOR_HARDLOCK,
            alpha: 1 - p,
          });
        },
      };
    });
  }

  /**
   * Sector unlock (mission completed → sectorsUnlocked grew): a subtle
   * one-shot expanding ring on the newly opened pad (~600ms). Purely visual
   * — the pad itself appears via the projection, never optimistically.
   * SKIPPED ENTIRELY under reduced motion (not even a terminal frame).
   */
  playSectorUnlock(x: number, y: number): void {
    if (this.policy.reduced) return;
    this.play(SECTOR_UNLOCK_MS, () => {
      const g = new Graphics();
      const root = new Container();
      root.addChild(g);
      root.position.set(x, y);
      return {
        root,
        draw: (p) => {
          g.clear();
          const eased = easeOutCubic(p);
          g.ellipse(0, 0, 12 + 120 * eased, 6 + 60 * eased).stroke({
            width: 2.5,
            color: 0x22d3ee,
            alpha: 1 - p,
          });
          g.ellipse(0, 0, 8 + 70 * eased, 4 + 35 * eased).stroke({
            width: 1.5,
            color: 0x9be8ff,
            alpha: 0.7 * (1 - p),
          });
        },
      };
    });
  }

  /** Just-placed spawn marker: one-shot green highlight ring (~2s). */
  playSpawnRing(x: number, y: number): void {
    this.play(SPAWN_RING_MS, () => {
      const g = new Graphics();
      const root = new Container();
      root.addChild(g);
      root.position.set(x, y);
      return {
        root,
        draw: (p) => {
          g.clear();
          const eased = easeOutCubic(p);
          const fade = p < 0.15 ? p / 0.15 : 1 - easeOutCubic((p - 0.15) / 0.85);
          g.ellipse(0, 0, 14 + 26 * eased, 7 + 13 * eased).stroke({
            width: 2.5,
            color: 0x4ade80,
            alpha: Math.max(0, fade),
          });
          g.ellipse(0, 0, 22, 11).stroke({
            width: 1.5,
            color: 0x4ade80,
            alpha: Math.max(0, fade) * 0.5,
          });
        },
      };
    });
  }

  private finishShot(shot: OneShot): void {
    const i = this.shots.indexOf(shot);
    if (i >= 0) this.shots.splice(i, 1);
    if (shot.timer) clearTimeout(shot.timer);
    this.removeChild(shot.root);
    shot.root.destroy({ children: true });
    shot.onExpire?.();
  }

  /**
   * Advance animations. Returns true while an ANIMATED shot is still active
   * (the scene keeps its render loop alive only then); static `idle` markers
   * never keep it alive — their expiry timer removes them.
   */
  update(now: number): boolean {
    if (this.shots.length === 0) return false;
    let busy = false;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      const p = animationProgress(now - shot.startedAt, shot.durationMs);
      shot.draw(p);
      if (p >= 1) this.finishShot(shot);
      else if (!shot.idle) busy = true;
    }
    return busy;
  }

  /** Drop everything (world rebuild / destroy). */
  clearShots(): void {
    for (const shot of this.shots) {
      if (shot.timer) clearTimeout(shot.timer);
      shot.root.destroy({ children: true });
      this.removeChild(shot.root);
    }
    this.shots.length = 0;
  }
}
