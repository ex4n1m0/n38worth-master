/**
 * Mainframe City — country ROADS (client-only Pixi).
 *
 * Paving from the home HQ to each satellite cluster and each live universe
 * mini city (2026-09-28 user request): L-shaped tile-space paths (one
 * diagonal avenue, one diagonal street) drawn as asphalt bands with a soft
 * edge and a dashed centerline, day + night variants crossfaded by the
 * scene's daylight clock.
 *
 * PURE DECORATION: roads carry no gameplay — no cost, no routing, no effect
 * on placement (AGENTS.md "no roads economy"; this is the visual-only
 * allowance from the 2026-09-28 user ruling). Anchors arrive from the
 * satellite + universe layers; nothing is computed here.
 */

import { Container, Graphics } from "pixi.js";
import { screenToTile, tileToScreen, type Point } from "@/lib/city/scene/iso";
import { drawDashedLine } from "./art";

/** Asphalt band width (world px) — reads as a two-lane country road. */
const ROAD_W = 7;
/** Soft dark shoulder under the band. */
const ROAD_EDGE_W = 10;

export interface RoadAnchor {
  x: number;
  y: number;
  /** Tiles of clearance before the destination pad (default 8). */
  inset?: number;
}

/**
 * Tile-space L path from `hq` toward `target`, both ends inset so the road
 * starts outside the core plaza and stops at the destination pad's rim
 * (the pad covers its own ground). Alternate the corner order per index so
 * parallel roads don't all bend the same way. Null when too close to draw.
 */
function roadPath(
  hq: Point,
  target: Point,
  insetFrom: number,
  insetTo: number,
  cornerSwap: boolean
): Array<[number, number]> | null {
  const a = screenToTile(hq.x, hq.y);
  const b = screenToTile(target.x, target.y);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len <= insetFrom + insetTo + 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  const ax = a.x + ux * insetFrom;
  const ay = a.y + uy * insetFrom;
  const bx = b.x - ux * insetTo;
  const by = b.y - uy * insetTo;
  // Corner: reach the target's row first, then its column (or the mirror).
  const corner = cornerSwap ? { x: ax, y: by } : { x: bx, y: ay };
  const p0 = tileToScreen(ax, ay);
  const p1 = tileToScreen(corner.x, corner.y);
  const p2 = tileToScreen(bx, by);
  return [
    [p0.x, p0.y],
    [p1.x, p1.y],
    [p2.x, p2.y],
  ];
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

  /** Redraw both variants: HQ → every anchor (per-anchor pad inset in tiles). */
  sync(hq: Point, anchors: readonly RoadAnchor[]): void {
    const styles = {
      day: { edge: 0x8f8878, surface: 0xa8a294, line: 0x8b8577 },
      night: { edge: 0x20272f, surface: 0x39424e, line: 0x46505e },
    } as const;
    for (const [g, variant] of [
      [this.night, "night"],
      [this.day, "day"],
    ] as const) {
      const s = styles[variant];
      g.clear();
      anchors.forEach((anchor, i) => {
        const path = roadPath(hq, anchor, 3.5, anchor.inset ?? 8, i % 2 === 1);
        if (!path) return;
        // Shoulder → asphalt → dashed centerline.
        for (let k = 0; k < 2; k++) {
          g.moveTo(path[k][0], path[k][1])
            .lineTo(path[k + 1][0], path[k + 1][1])
            .stroke({ width: ROAD_EDGE_W, color: s.edge, alpha: 0.85 });
          g.moveTo(path[k][0], path[k][1])
            .lineTo(path[k + 1][0], path[k + 1][1])
            .stroke({ width: ROAD_W, color: s.surface, alpha: 1 });
          drawDashedLine(
            g,
            path[k][0],
            path[k][1],
            path[k + 1][0],
            path[k + 1][1],
            12,
            14,
            { width: 1, color: s.line, alpha: 0.6 }
          );
        }
      });
    }
  }
}
