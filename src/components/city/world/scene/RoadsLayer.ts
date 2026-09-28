/**
 * Mainframe City — country ROADS (client-only Pixi).
 *
 * Ownership connectors ONLY (2026-09-28 user ruling): one straight road per
 * SATELLITE cluster, along the same corridor the core→core pulse comets
 * travel (cluster ↔ HQ). Roads to arbitrary universe cities were removed —
 * they read as random lines across the map and crossed the city.
 *
 * Each road is clipped to the countryside GAP: it starts where the corridor
 * exits the city's UNLOCKED sector union (slab-method exit, +margin) and
 * ends at the cluster pad's rim — so paving can never run over a building
 * tile, and corridors whose pad hugs the city rim simply draw nothing.
 *
 * PURE DECORATION: roads carry no gameplay — no cost, no routing, no effect
 * on placement (AGENTS.md "no roads economy"; visual-only allowance).
 */

import { Container, Graphics } from "pixi.js";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import {
  SECTOR_GAP_TILES,
  SECTOR_MACRO,
  screenToTile,
  tileToScreen,
  type Point,
} from "@/lib/city/scene/iso";
import { drawDashedLine } from "./art";

/** Asphalt band width (world px) — reads as a two-lane country road. */
const ROAD_W = 7;
/** Soft dark shoulder under the band. */
const ROAD_EDGE_W = 10;
/** Clear tiles past the unlocked rim before paving starts. */
const RIM_MARGIN_TILES = 1.5;
/**
 * Road stops this many tiles short of the cluster anchor: the pad skirt
 * (cluster radius 5 + 1.5) + a shoulder, so asphalt meets the pad's rim.
 */
const PAD_INSET_TILES = 7;
/** Minimum paveable gap (tiles) — anything shorter is not a road. */
const MIN_ROAD_TILES = 2;

interface TileBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Tile-space squares of the first `sectorCount` (live) sector pads. */
function sectorSquares(sectorCount: number): TileBox[] {
  const stride = GRID_SIZE + SECTOR_GAP_TILES;
  const count = Math.max(1, Math.min(SECTOR_MACRO.length, sectorCount));
  const boxes: TileBox[] = [];
  for (let s = 0; s < count; s++) {
    const m = SECTOR_MACRO[s];
    boxes.push({
      x0: m.x * stride,
      x1: m.x * stride + GRID_SIZE,
      y0: m.y * stride,
      y1: m.y * stride + GRID_SIZE,
    });
  }
  return boxes;
}

/**
 * Ray c + t·d (t in 0..1) exit point from the union of `boxes` — the t where
 * the corridor leaves the city's LIVE ground for good. Slab intersection per
 * box; the union exit is the farthest box the ray passes through.
 */
function unionExitT(
  c: { x: number; y: number },
  d: { x: number; y: number },
  boxes: readonly TileBox[]
): number {
  let exit = 0;
  for (const b of boxes) {
    let tMin = 0;
    let tMax = Infinity;
    let inside = true;
    for (const axis of [
      { p: c.x, dd: d.x, lo: b.x0, hi: b.x1 },
      { p: c.y, dd: d.y, lo: b.y0, hi: b.y1 },
    ] as const) {
      if (axis.dd === 0) {
        if (axis.p < axis.lo || axis.p > axis.hi) {
          inside = false;
          break;
        }
        continue;
      }
      let t1 = (axis.lo - axis.p) / axis.dd;
      let t2 = (axis.hi - axis.p) / axis.dd;
      if (t1 > t2) {
        const swap = t1;
        t1 = t2;
        t2 = swap;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
    }
    if (inside && tMin <= tMax) {
      exit = Math.max(exit, Math.min(tMax, 1));
    }
  }
  return exit;
}

export class RoadsLayer extends Container {
  private readonly night = new Graphics();
  private readonly day = new Graphics();

  constructor() {
    super();
    this.addChild(this.night, this.day);
    this.day.alpha = 0;
  }

  setDaylight(daylight: number): void {
    this.day.alpha = daylight;
  }

  /** Redraw both variants: one rim→pad road per satellite cluster. */
  sync(hq: Point, clusters: readonly Point[], sectorCount: number): void {
    const styles = {
      day: { edge: 0x8f8878, surface: 0xa8a294, line: 0x8b8577 },
      night: { edge: 0x20272f, surface: 0x39424e, line: 0x46505e },
    } as const;
    const c = screenToTile(hq.x, hq.y);
    const boxes = sectorSquares(sectorCount);
    for (const [g, variant] of [
      [this.night, "night"],
      [this.day, "day"],
    ] as const) {
      const s = styles[variant];
      g.clear();
      for (const cluster of clusters) {
        const a = screenToTile(cluster.x, cluster.y);
        const d = { x: a.x - c.x, y: a.y - c.y };
        const len = Math.hypot(d.x, d.y);
        if (len <= PAD_INSET_TILES + MIN_ROAD_TILES) continue;
        const tStart =
          unionExitT(c, d, boxes) + RIM_MARGIN_TILES / len;
        const tEnd = 1 - PAD_INSET_TILES / len;
        if ((tEnd - tStart) * len < MIN_ROAD_TILES) continue;
        const p0 = tileToScreen(c.x + d.x * tStart, c.y + d.y * tStart);
        const p1 = tileToScreen(c.x + d.x * tEnd, c.y + d.y * tEnd);
        // Shoulder → asphalt → dashed centerline, one straight band.
        g.moveTo(p0.x, p0.y)
          .lineTo(p1.x, p1.y)
          .stroke({ width: ROAD_EDGE_W, color: s.edge, alpha: 0.85 });
        g.moveTo(p0.x, p0.y)
          .lineTo(p1.x, p1.y)
          .stroke({ width: ROAD_W, color: s.surface, alpha: 1 });
        drawDashedLine(g, p0.x, p0.y, p1.x, p1.y, 12, 14, {
          width: 1,
          color: s.line,
          alpha: 0.6,
        });
      }
    }
  }
}
