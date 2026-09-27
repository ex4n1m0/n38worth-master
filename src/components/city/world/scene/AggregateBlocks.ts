/**
 * Mainframe City — aggregate skyline blocks (client-only Pixi).
 *
 * Buildings beyond the detailed-display limit (family.aggregated) render as
 * a bounded cluster of low skyline slabs continuing the VALUE-ORBIT beyond
 * the outermost detailed ring — density at a glance without materialising
 * thousands of sprites. Block count is capped per LOD (lod.ts budget);
 * heights vary deterministically from the family total (hash, not economy
 * math).
 *
 * Phase D:
 * - LOD-swap CROSSFADE — the per-LOD block budget changes wholesale between
 *   bands, so a swap rebuilds the set; instead of snapping, the outgoing set
 *   fades out while the incoming set fades in (lodFadeMs; instant under
 *   reduced motion). update() reports activity so the scene's render-on-
 *   demand ticker returns to idle when the fade ends.
 * - Viewport CULLING (applyCull) — slabs far off-screen are hidden; the
 *   pass runs on camera-settle / sync only, never per frame.
 */

import { Container, Graphics } from "pixi.js";
import { UNASSIGNED_FAMILY, type CityFamily } from "@/lib/city/types";
import { aggregateBlockBudget, type Lod } from "@/lib/city/scene/lod";
import { clamp01, easeOutCubic } from "@/lib/city/scene/motion";
import { pointVisible, type CullRect } from "@/lib/city/scene/culling";
import { tileRefKey } from "@/lib/city/placement";
import { hqGlobalTile, orbitOrder } from "@/lib/city/rings";
import { worldPointOfTile } from "./IsoWorld";
import { drawIsoBox, professionMass, professionNeon, shade } from "./art";

/** Deterministic small hash for per-family visual variation. */
function hash32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Slab art extents (culling margin): bodies are short, platforms half a tile. */
const SLAB_UP_MARGIN = 40;

export class AggregateBlocks extends Container {
  private drawnKey = "";
  /** Active block set (fades IN on a crossfade). */
  private current: Container | null = null;
  /** Previous block set fading OUT during a crossfade. */
  private outgoing: Container | null = null;
  private fadeStart = 0;
  private fadeMs = 0;

  /**
   * Rebuild the skyline when families, sector count, or LOD budget change.
   * Slabs continue the building VALUE-ORBIT outward from `startRing` (the
   * outermost detailed-building ring) — the cheap sprawl physically sits at
   * the rim, same ranking rule as the buildings themselves. `isFree` reports
   * tiles the buildings/HQ/landmarks already own; the walk skips them.
   * `fadeMs` > 0 crossfades the swap (LOD-budget changes); 0 swaps
   * instantly (data-only changes).
   */
  sync(
    families: readonly CityFamily[],
    sectorCount: number,
    startRing: number,
    isFree: (key: string) => boolean,
    lod: Lod,
    fadeMs = 0
  ): void {
    const budget = aggregateBlockBudget(lod);
    const key = `${families.map((f) => `${f.profession}:${f.aggregated}`).join("|")}#${sectorCount}#${startRing}#${budget}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    const next = this.buildBlocks(families, sectorCount, startRing, isFree, budget);
    if (fadeMs > 0 && this.current && this.current.children.length > 0) {
      // Crossfade: keep the old set visible while the new one fades in.
      this.outgoing?.destroy({ children: true });
      this.outgoing = this.current;
      this.outgoing.alpha = 1;
      next.alpha = 0;
      this.fadeStart = performance.now();
      this.fadeMs = fadeMs;
    } else {
      // Instant swap (first build, data change, or reduced motion).
      this.outgoing?.destroy({ children: true });
      this.outgoing = null;
      this.fadeMs = 0;
      next.alpha = 1;
    }
    this.current = next;
    this.addChild(next);
  }

  private buildBlocks(
    families: readonly CityFamily[],
    sectorCount: number,
    startRing: number,
    isFree: (key: string) => boolean,
    budget: number
  ): Container {
    const root = new Container();
    // One shared orbit stream (clockwise rings outward): the biggest family
    // takes the innermost slab tiles, the next family continues after it —
    // density reads as a single graded rim instead of per-district clusters.
    const orbit = orbitOrder(hqGlobalTile(), startRing, sectorCount, undefined, (t) =>
      isFree(tileRefKey(t))
    );
    let cursor = 0;

    for (const family of families) {
      if (family.aggregated <= 0) continue;
      const blocks = Math.max(1, Math.min(budget, Math.ceil(family.aggregated / 25)));
      const profession = family.profession === UNASSIGNED_FAMILY ? null : family.profession;
      const mass = professionMass(profession);
      const neon = professionNeon(profession);
      const seed = hash32(family.profession);

      let placedBlocks = 0;
      while (placedBlocks < blocks && cursor < orbit.length) {
        const tile = orbit[cursor++];
        const slab = new Graphics();
        const variant = (seed >>> (placedBlocks * 3)) & 3;
        const h = 10 + variant * 6;
        drawIsoBox(slab, 0, 0, 16 + variant * 3, 8 + variant * 1.5, h, mass, 1, neon);
        // Tiny lit windows (deterministic per slab): the distant-skyline
        // density cue — sparse bright dots on dark mass, bloom feed.
        const dots = 2 + variant;
        for (let d = 0; d < dots; d++) {
          const r = (seed >>> (placedBlocks * 7 + d * 5)) & 15;
          const dy = 3 + (r % Math.max(3, h - 4));
          const dx = ((r >>> 2) % 14) - 7;
          slab.rect(dx, -dy, 2, 2).fill({
            color: d % 3 === 0 ? 0xffb547 : shade(neon, 1.3),
            alpha: 0.9,
          });
        }
        const p = worldPointOfTile({ sector: tile.sector, x: tile.x, y: tile.y });
        slab.position.set(p.x, p.y);
        root.addChild(slab);
        placedBlocks += 1;
      }
    }
    return root;
  }

  /**
   * Reduced-motion policy swap mid-fade: snap to the terminal state (the
   * incoming set fully opaque, the outgoing set gone).
   */
  cancelFade(): void {
    if (!this.outgoing) return;
    this.outgoing.destroy({ children: true });
    this.outgoing = null;
    this.fadeMs = 0;
    if (this.current) this.current.alpha = 1;
  }

  /**
   * Advance the crossfade. Returns true while fading (the scene keeps its
   * render loop alive only then — render-on-demand stays intact).
   */
  update(now: number): boolean {
    if (this.fadeMs <= 0 || !this.outgoing || !this.current) return false;
    const p = clamp01((now - this.fadeStart) / this.fadeMs);
    const eased = easeOutCubic(p);
    this.current.alpha = eased;
    this.outgoing.alpha = 1 - eased;
    if (p >= 1) {
      this.outgoing.destroy({ children: true });
      this.outgoing = null;
      this.fadeMs = 0;
      this.current.alpha = 1;
      return false;
    }
    return true;
  }

  /** Viewport culling pass (camera-settle / sync only). Covers BOTH the
   *  active and the outgoing (crossfading) sets. */
  applyCull(rect: CullRect): void {
    for (const set of this.children) {
      for (const slab of set.children) {
        slab.visible = pointVisible(rect, slab.x, slab.y, SLAB_UP_MARGIN, 24);
      }
    }
  }
}
