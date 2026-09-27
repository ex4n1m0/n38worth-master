/**
 * Mainframe City — profession district data links (client-only Pixi).
 *
 * Phase C §"Profession architecture": when professions are owned, one
 * REPRESENTATIVE building per profession (highest-value detailed card —
 * picked by the pure districtRepresentatives helper) gets connected by
 * luminous data links; when ALL SIX are present (district complete —
 * districtsFromFamilies, which mirrors the existing combo state without
 * forking it) a district-core glow washes over the linked set.
 *
 * RENDER-ONLY: the anchor set + completion flag arrive from the projection;
 * combo eligibility/sale/payout stay in the existing combo module.
 *
 * Animation policy (render-on-demand, RTS plan §D1): links are drawn STATIC;
 * a bounded pulse sweep (a bright dot traveling each link) runs for a few
 * cycles whenever the anchor set changes, then the layer goes idle again —
 * no permanent RAF. Under prefers-reduced-motion the sweep never runs.
 */

import { Container, Graphics } from "pixi.js";
import type { Lod } from "@/lib/city/scene/lod";
import type { MotionPolicy } from "@/lib/city/scene/motion";
import { easeOutCubic } from "@/lib/city/scene/motion";
import { professionColor } from "./art";

export interface LinkAnchor {
  /** DB profession name (roster order is the caller's responsibility). */
  profession: string;
  x: number;
  y: number;
}

const LINK_COLOR = 0x22d3ee;
const COMPLETE_COLOR = 0xfde68a;
const LINK_ALPHA: Record<Lod, number> = { close: 0.9, district: 0.5, world: 0.25 };
/** One pulse traversal per link + settle; repeated this many times per sync. */
const SWEEP_MS = 1_400;
const SWEEP_CYCLES = 3;

export class DistrictLinks extends Container {
  private policy: MotionPolicy;
  private lod: Lod = "district";
  private readonly lines = new Graphics();
  private readonly pulses = new Graphics();
  private segments: ReadonlyArray<{ x1: number; y1: number; x2: number; y2: number }> = [];
  private anchorList: readonly LinkAnchor[] = [];
  private complete = false;
  private anchorsHash = "";
  private sweepStart = 0;
  private sweeping = false;

  constructor(policy: MotionPolicy) {
    super();
    this.policy = policy;
    this.addChild(this.lines, this.pulses);
    this.pulses.visible = false;
  }

  setPolicy(policy: MotionPolicy): void {
    this.policy = policy;
    if (policy.reduced) this.stopSweep();
  }

  setLod(lod: Lod): void {
    if (lod === this.lod) return;
    this.lod = lod;
    this.redrawLines();
  }

  /**
   * New anchor set (world points of the representative buildings, roster
   * order) + completion flag. Anchors link into a ring; completion adds the
   * district-core glow. Triggers a pulse sweep when the set changed.
   */
  sync(anchors: readonly LinkAnchor[], complete: boolean): void {
    const hash = `${complete ? 1 : 0}|${anchors.map((a) => `${a.profession}:${Math.round(a.x)},${Math.round(a.y)}`).join(";")}`;
    if (hash === this.anchorsHash) return;
    const changed = this.anchorsHash !== "";
    this.anchorsHash = hash;
    this.complete = complete;
    this.anchorList = anchors;

    this.segments = anchors.map((a, i) => {
      const b = anchors[(i + 1) % anchors.length];
      return { x1: a.x, y1: a.y - 6, x2: b.x, y2: b.y - 6 };
    });
    this.redrawLines();

    if (changed && anchors.length > 1 && !this.policy.reduced) {
      this.sweepStart = performance.now();
      this.sweeping = true;
      this.pulses.visible = true;
    }
  }

  private stopSweep(): void {
    this.sweeping = false;
    this.pulses.visible = false;
    this.pulses.clear();
  }

  private redrawLines(): void {
    const g = this.lines;
    g.clear();
    if (this.segments.length < 2) return;
    const alpha = LINK_ALPHA[this.lod];
    const accent = this.complete ? COMPLETE_COLOR : LINK_COLOR;

    for (const s of this.segments) {
      // Glow underlay + bright core line = luminous without shaders.
      g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({
        width: 6,
        color: accent,
        alpha: alpha * 0.16,
      });
      g.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2).stroke({
        width: 1.8,
        color: accent,
        alpha: alpha * 0.9,
      });
    }

    // Anchor nodes tinted by their family accent.
    for (const a of this.anchorList) {
      const color = professionColor(a.profession);
      g.circle(a.x, a.y - 6, 3.5).fill({ color: accent, alpha });
      g.circle(a.x, a.y - 6, 6).stroke({ width: 1.5, color, alpha: alpha * 0.8 });
    }

    if (this.complete) {
      // District-core glow: soft ellipse over the linked set's centroid.
      let cx = 0;
      let cy = 0;
      for (const a of this.anchorList) {
        cx += a.x;
        cy += a.y - 6;
      }
      cx /= this.anchorList.length;
      cy /= this.anchorList.length;
      let radius = 30;
      for (const a of this.anchorList) {
        radius = Math.max(radius, Math.hypot(a.x - cx, a.y - 6 - cy) + 34);
      }
      g.ellipse(cx, cy, radius, radius * 0.5).fill({
        color: COMPLETE_COLOR,
        alpha: 0.05 * (alpha / 0.9),
      });
      g.ellipse(cx, cy, radius, radius * 0.5).stroke({
        width: 1.5,
        color: COMPLETE_COLOR,
        alpha: alpha * 0.5,
      });
    }
  }

  /**
   * Advance the pulse sweep. Returns true while sweeping (the scene keeps
   * its render loop alive only then — render-on-demand stays intact).
   */
  update(now: number): boolean {
    if (!this.sweeping || this.policy.reduced) {
      if (this.sweeping) this.stopSweep();
      return false;
    }
    const elapsed = now - this.sweepStart;
    const total = SWEEP_MS * SWEEP_CYCLES;
    if (elapsed >= total) {
      this.stopSweep();
      return false;
    }
    const g = this.pulses;
    g.clear();
    const cyclePos = (elapsed % SWEEP_MS) / SWEEP_MS;
    const eased = easeOutCubic(cyclePos);
    for (const s of this.segments) {
      const px = s.x1 + (s.x2 - s.x1) * eased;
      const py = s.y1 + (s.y2 - s.y1) * eased;
      g.circle(px, py, 3).fill({
        color: this.complete ? COMPLETE_COLOR : LINK_COLOR,
        alpha: 0.95,
      });
      g.circle(px, py, 6).fill({
        color: this.complete ? COMPLETE_COLOR : LINK_COLOR,
        alpha: 0.25,
      });
    }
    return true;
  }
}
