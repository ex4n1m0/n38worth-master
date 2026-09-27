/**
 * Mainframe City — Root Sequence world transformation (client-only Pixi,
 * Phase E).
 *
 * Renders the AUTHORITATIVE countdown as city visuals (root-sequence.ts
 * derives the state; this layer never reads the countdown itself):
 * - BEAMS from the six landmark ring tips into the HQ core spire, phase-
 *   colored (stir cyan → surge violet → brink crimson). While the sequence
 *   is active the COUNTDOWN is the authority: all six positions beam
 *   regardless of the (possibly stale) owned flags (game-systems M2).
 * - a ground VEIL over the macro grid that deepens as the sequence nears
 *   completion (the "gradually transform terrain" beat);
 * - a growing light core at the HQ tip (the skyline tell).
 *
 * Phase legibility (image-analyst gate): stir/surge/brink differ by MORE
 * than chip text — phase COLOR (cyan/violet/crimson) + width multipliers +
 * core size make each band visibly distinct on the canvas. Beams render
 * ADDITIVELY with bright tip nodes at every monument: at district zoom a
 * plain 3px 0.5-alpha stroke is illegible over the skyline (Phase E v3
 * gate: surge read as "one beam" when all six were drawn), so luminosity
 * carries the effect, not stroke weight alone.
 *
 * Motion policy (render-on-demand): all art is STATIC per state; a bounded
 * ignition sweep (bright pulses traveling the beams) runs for two cycles
 * whenever the state key advances — at 2% progress quantization that is ≤ a
 * few seconds of animation per minute, then the ticker goes idle again.
 * Under prefers-reduced-motion the sweep never runs (static state swaps
 * only), matching how FxLayer/DistrictLinks treat reduced motion.
 *
 * Abort: the shell pushes `{active:false}` the moment the mirrored payload
 * says the countdown stopped (stolen goddess, reassigned, won) — beams, veil
 * and core clear immediately. Nothing lingers client-side.
 */

import { Container, Graphics } from "pixi.js";
import type { Lod } from "@/lib/city/scene/lod";
import type { MotionPolicy } from "@/lib/city/scene/motion";
import { easeOutCubic } from "@/lib/city/scene/motion";
import type {
  RootSequencePhase,
  RootSequenceVisualState,
} from "@/lib/city/root-sequence";

/** Beam anchor (world point) — landmark tip or HQ spire tip. */
export interface RootAnchor {
  x: number;
  y: number;
}

/** Phase signature colors (shared with the path tint in CityScene). */
export const ROOT_PHASE_COLORS: Record<string, number> = {
  stir: 0x38bdf8,
  surge: 0xa78bfa,
  brink: 0xf43f5e,
};

const BEAM_ALPHA: Record<Lod, number> = { close: 0.95, district: 0.8, world: 0.6 };
/** Phase legibility multipliers — stir thin/faint, brink thick/bright. */
const PHASE_WIDTH: Record<string, number> = { stir: 0.7, surge: 1, brink: 1.4 };
const PHASE_ALPHA: Record<string, number> = { stir: 0.75, surge: 1, brink: 1.15 };
const SWEEP_MS = 1_600;
const SWEEP_CYCLES = 2;

export class RootSequenceLayer {
  /** Ground veil — the shell mounts it BENEATH paths/buildings. */
  readonly ground = new Container();
  /** Beams + HQ core — mounted ABOVE the aggregate skyline. */
  readonly beams = new Container();

  private readonly veil = new Graphics();
  private readonly beamLines = new Graphics();
  private readonly beamPulses = new Graphics();
  private readonly core = new Graphics();
  private policy: MotionPolicy;
  private lastLod: Lod = "district";

  private anchors: readonly RootAnchor[] = [];
  private hq: RootAnchor = { x: 0, y: 0 };
  /** Macro-grid veil extents (world px), supplied by the scene. */
  private veilBounds = { cx: 0, cy: 0, rx: 1, ry: 1 };
  private drawnKey = "";
  private sweepStart = 0;
  private sweeping = false;
  private active = false;
  private progress = 0;
  private phase: RootSequencePhase = "stir";
  private phaseColor = ROOT_PHASE_COLORS.stir;

  constructor(policy: MotionPolicy) {
    this.policy = policy;
    this.ground.addChild(this.veil);
    this.beams.addChild(this.beamLines, this.beamPulses, this.core);
    this.beamPulses.visible = false;
    // Additive: energy FX must read LUMINOUS over the dark skyline — plain
    // alpha strokes vanish at district/world zoom (Phase E v3 gate).
    this.beamLines.blendMode = "add";
    this.beamPulses.blendMode = "add";
    this.core.blendMode = "add";
  }

  setPolicy(policy: MotionPolicy): void {
    this.policy = policy;
    if (policy.reduced) this.stopSweep();
  }

  /** Veil extents from the sector macro-grid bounds (world rectangle). */
  setVeilBounds(cx: number, cy: number, rx: number, ry: number): void {
    this.veilBounds = { cx, cy, rx, ry };
    this.drawnKey = ""; // force redraw with the new extents
    this.drawVeil();
    this.drawBeams(this.lastLod);
  }

  /**
   * New state (already change-detected upstream by rootSequenceKey — an
   * identical call is still free). `anchors` are the OWNED landmark tips in
   * roster order; `hq` is the HQ spire tip.
   */
  sync(
    state: RootSequenceVisualState,
    anchors: readonly RootAnchor[],
    hq: RootAnchor,
    lod: Lod
  ): void {
    const active = state.active;
    const key = active
      ? `on:${state.phase}:${Math.floor(state.progress * 50)}:${lod}:${anchors.length}`
      : `off:${lod}`;
    this.anchors = anchors;
    this.hq = hq;
    this.active = active;
    if (active) {
      this.progress = state.progress;
      this.phase = state.phase;
      this.phaseColor = ROOT_PHASE_COLORS[state.phase] ?? ROOT_PHASE_COLORS.stir;
    }
    const changed = this.redrawIfNeeded(key, lod);
    if (changed && active && anchors.length > 0 && !this.policy.reduced) {
      // Rising edge or advancing state → a short ignition sweep.
      this.sweepStart = performance.now();
      this.sweeping = true;
      this.beamPulses.visible = true;
    }
    if (!active) this.stopSweep();
  }

  private stopSweep(): void {
    this.sweeping = false;
    this.beamPulses.visible = false;
    this.beamPulses.clear();
  }

  private redrawIfNeeded(key: string, lod: Lod): boolean {
    this.lastLod = lod;
    if (key === this.drawnKey) return false;
    this.drawnKey = key;
    this.drawVeil();
    this.drawBeams(lod);
    return true;
  }

  private drawVeil(): void {
    const g = this.veil;
    g.clear();
    if (!this.active) return;
    const { cx, cy, rx, ry } = this.veilBounds;
    const alpha = 0.03 + 0.1 * this.progress;
    // Two stacked soft diamonds approximate a radial wash without shaders.
    g.poly([cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy]).fill({
      color: this.phaseColor,
      alpha: alpha * 0.6,
    });
    const k = 0.72;
    g.poly([cx, cy - ry * k, cx + rx * k, cy, cx, cy + ry * k, cx - rx * k, cy]).fill({
      color: this.phaseColor,
      alpha,
    });
  }

  private drawBeams(lod: Lod): void {
    const g = this.beamLines;
    g.clear();
    const core = this.core;
    core.clear();
    if (!this.active) return;
    const phaseW = PHASE_WIDTH[this.phase] ?? 1;
    const phaseA = PHASE_ALPHA[this.phase] ?? 1;
    // High alpha/width floors: even the earliest stir beat must show six
    // clearly legible beams — progress then INTENSIFIES, never hides, them.
    const alpha = Math.min(1, BEAM_ALPHA[lod] * (0.85 + 0.15 * this.progress) * phaseA);
    const width = (2.6 + 2.4 * this.progress) * phaseW;
    for (const a of this.anchors) {
      // Glow underlay + bright core = luminous without shaders.
      g.moveTo(a.x, a.y).lineTo(this.hq.x, this.hq.y).stroke({
        width: width * 3.4,
        color: this.phaseColor,
        alpha: alpha * 0.18,
      });
      g.moveTo(a.x, a.y).lineTo(this.hq.x, this.hq.y).stroke({
        width,
        color: this.phaseColor,
        alpha,
      });
      // Tip ignition node — every monument origin stays visible even when
      // the beam itself is thin (world zoom, stir band).
      const tipR = (1.6 + 1.6 * this.progress) * phaseW;
      g.circle(a.x, a.y, tipR * 2.4).fill({
        color: this.phaseColor,
        alpha: alpha * 0.45,
      });
      g.circle(a.x, a.y, tipR).fill({ color: 0xffffff, alpha: Math.min(1, alpha * 1.2) });
    }
    // HQ light core — the skyline tell, growing with progress + phase.
    const r = (5 + 13 * this.progress) * (0.8 + 0.2 * phaseW);
    core.circle(this.hq.x, this.hq.y, r).fill({
      color: 0xffffff,
      alpha: 0.12 + 0.22 * this.progress,
    });
    core.circle(this.hq.x, this.hq.y, r * 0.45).fill({
      color: this.phaseColor,
      alpha: 0.35 + 0.4 * this.progress,
    });
  }

  /** Advance the ignition sweep; true while animating (keeps RAF alive). */
  update(now: number): boolean {
    if (!this.sweeping || !this.active) {
      if (this.sweeping) this.stopSweep();
      return false;
    }
    if (this.policy.reduced) {
      this.stopSweep();
      return false;
    }
    const elapsed = now - this.sweepStart;
    const total = SWEEP_MS * SWEEP_CYCLES;
    if (elapsed >= total) {
      this.stopSweep();
      return false;
    }
    const g = this.beamPulses;
    g.clear();
    const cyclePos = (elapsed % SWEEP_MS) / SWEEP_MS;
    const eased = easeOutCubic(cyclePos);
    for (const a of this.anchors) {
      const px = a.x + (this.hq.x - a.x) * eased;
      const py = a.y + (this.hq.y - a.y) * eased;
      g.circle(px, py, 3).fill({ color: 0xffffff, alpha: 0.95 });
      g.circle(px, py, 6).fill({ color: this.phaseColor, alpha: 0.3 });
    }
    return true;
  }
}
