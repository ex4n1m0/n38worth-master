/**
 * Mainframe City — data paths / roads (client-only Pixi).
 *
 * VISUAL ONLY (RTS plan §"Roads required for economic validity" is BANNED in
 * the MVP): thin isometric grid paths connect every placed building to the
 * HQ core. They carry NO economic meaning — no validity, no bonuses, no
 * simulation; they exist so the city reads as one connected machine.
 *
 * Rendering rules:
 * - drawn BENEATH the buildings layer (ground-level reading, no overlap mess)
 * - each path is two iso-axis-aligned segments (building → shared corner →
 *   HQ) so lines follow the tile grid instead of cutting across it
 * - every endpoint gets a visible NODE DOT (connector port at each building
 *   base + a filled port ring at the HQ) — arcs must visibly TERMINATE
 * - one Graphics for all paths (≤ ~200 detailed buildings — bounded)
 * - fades at district LOD, nearly invisible at world LOD
 * - fully static — nothing animates, so reduced-motion needs no branch
 */

import { Container, Graphics } from "pixi.js";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import type { Lod } from "@/lib/city/scene/lod";
import { TILE_H, globalTile, tileToScreen } from "@/lib/city/scene/iso";
import { tileRefKey, type TileRef } from "@/lib/city/placement";

/** Asphalt street tone (normal-city direction, 2026-09-28 v2) — reads as a
 *  road at day, a dim street at night; the Root Sequence still tints it. */
const PATH_COLOR = 0x70747c;
const PATH_ALPHA: Record<Lod, number> = { close: 0.75, district: 0.45, world: 0.15 };
const PATH_WIDTH: Record<Lod, number> = { close: 3, district: 2, world: 1.5 };
/** HQ ground diamond half-height (HqSprite pedestal) — where its port sits. */
const HQ_PAD_HALF_H = TILE_H * 0.75;
/** Building-base port offset: just past the platform diamond's south vertex. */
const PORT_DY = TILE_H / 2 - 2;

/** Linear hex blend (Root Sequence tint — the "data paths transform" beat). */
function blendHex(a: number, b: number, t: number): number {
  const ar = a >> 16 & 0xff, ag = a >> 8 & 0xff, ab = a & 0xff;
  const br = b >> 16 & 0xff, bg = b >> 8 & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** HQ tile in the same TileRef shape the scene passes in. */
export interface PathTarget {
  tile: TileRef;
}

export class PathLayer extends Container {
  private readonly gfx = new Graphics();
  private drawnKey = "";
  /** Root Sequence tint (phase color + 0..1 mix); null = untinted. */
  private rootColor: number | null = null;
  private rootMix = 0;

  constructor() {
    super();
    this.addChild(this.gfx);
  }

  /**
   * Root Sequence tint (Phase E): blends the path color toward the phase
   * color as the countdown advances. Purely visual — the mix value comes
   * from the mirrored countdown state, never from client-side game logic.
   */
  setRootMix(color: number | null, mix: number): void {
    const clamped = Math.max(0, Math.min(1, mix));
    if (color === this.rootColor && clamped === this.rootMix) return;
    this.rootColor = color;
    this.rootMix = clamped;
    this.drawnKey = ""; // force redraw with the new tint
    this.sync(this.lastTiles, this.lastHq, this.lastLod);
  }

  private lastTiles: readonly TileRef[] = [];
  private lastHq: TileRef = { sector: "s0", x: 0, y: 0 };
  private lastLod: Lod = "district";

  /**
   * Redraw the path network. `buildingTiles` are the rendered buildings'
   * tiles (persisted + visual auto-tiles); `hqTile` anchors everything.
   * Redraw is skipped when the tile set + LOD are unchanged.
   */
  sync(buildingTiles: readonly TileRef[], hqTile: TileRef, lod: Lod): void {
    this.lastTiles = buildingTiles;
    this.lastHq = hqTile;
    this.lastLod = lod;
    const key = `${lod}#${buildingTiles.map(tileRefKey).join(",")}#${tileRefKey(hqTile)}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;

    const g = this.gfx;
    g.clear();
    const alpha = PATH_ALPHA[lod];
    const width = PATH_WIDTH[lod];
    if (alpha <= 0.01) return;
    const color = this.rootColor === null
      ? PATH_COLOR
      : blendHex(PATH_COLOR, this.rootColor, this.rootMix);
    const nodeAlpha = Math.min(1, alpha + 0.2);

    const hqGlobal = globalTile(
      Number(hqTile.sector.replace(/^s/, "")) || 0,
      hqTile.x,
      hqTile.y,
      GRID_SIZE
    );
    const hqPoint = tileToScreen(hqGlobal.x, hqGlobal.y);

    for (const tile of buildingTiles) {
      const t = globalTile(
        Number(tile.sector.replace(/^s/, "")) || 0,
        tile.x,
        tile.y,
        GRID_SIZE
      );
      const from = tileToScreen(t.x, t.y);
      // Iso-axis L-path: walk y first, then x (deterministic corner).
      const corner = tileToScreen(t.x, hqGlobal.y);
      g.moveTo(from.x, from.y - 2).lineTo(corner.x, corner.y - 2).stroke({
        width,
        color,
        alpha,
      });
      g.moveTo(corner.x, corner.y - 2).lineTo(hqPoint.x, hqPoint.y - 2).stroke({
        width,
        color,
        alpha,
      });
      // Connector PORT at the building base — the path visibly TERMINATES
      // here instead of fading under the platform (placed just outside the
      // platform's south vertex so the building never covers it).
      g.ellipse(from.x, from.y + PORT_DY, 5, 2.5)
        .fill({ color, alpha: nodeAlpha });
    }

    // Junction node at the HQ — where every path lands (a filled port ring
    // just outside the HQ pedestal's south vertex, so it stays visible).
    const hqPortY = hqPoint.y + HQ_PAD_HALF_H - 4;
    g.ellipse(hqPoint.x, hqPortY, 12, 6)
      .fill({ color, alpha: alpha * 0.45 });
    g.ellipse(hqPoint.x, hqPortY, 12, 6)
      .stroke({ width, color, alpha: Math.min(1, alpha + 0.15) });
  }
}
