/**
 * Mainframe City — STREET GRID renderer (client-only Pixi).
 *
 * Paves the tiles lib/city/streets.ts derives: asphalt diamond + sidewalk
 * rim + lane dashes on the travel axis, streetlamps at intersections (warm
 * glows baked into the NIGHT variant so the day/night crossfade lights
 * them by itself — zero runtime cost, render-on-demand friendly).
 *
 * ONE shared painter for every scale: the home city passes global-tile
 * streets, satellite/universe mini cities pass anchor-relative streets —
 * only the tile→screen mapper differs. Redrawn once per projection sync;
 * PURE DECORATION (no gameplay).
 */

import { Container, Graphics } from "pixi.js";
import type { StreetTile } from "@/lib/city/streets";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

/** Authored day/night pairs (no global day matrix — AGENTS rule). */
const PALETTE = {
  day: {
    sidewalk: 0xb0aca2,
    sidewalkEdge: 0x8f8b80,
    asphalt: 0x7d838d,
    lane: 0xd9b658,
    lampHead: 0x5b6470,
  },
  night: {
    sidewalk: 0x383e48,
    sidewalkEdge: 0x2c323b,
    asphalt: 0x222932,
    lane: 0x8a7a3d,
    lampHead: 0xffd9a0,
  },
} as const;

/** Tile footprint inset (fraction) — asphalt inside the sidewalk rim. */
const ASPHALT_INSET = 0.64;
/** Lane-dash reach along the travel axis (fraction of the tile step). */
const DASH_REACH = 0.3;

/**
 * Paint `streets` into `g` (cleared first) using `toScreen` for tile→px.
 * Shared by the home layer and the mini cities; static per sync.
 */
export function drawStreetTiles(
  g: Graphics,
  streets: readonly StreetTile[],
  variant: "day" | "night",
  toScreen: (gx: number, gy: number) => { x: number; y: number }
): void {
  const s = PALETTE[variant];
  const night = variant === "night";
  g.clear();
  for (const t of streets) {
    const c = toScreen(t.gx, t.gy);
    // Sidewalk tile diamond.
    const hw = TILE_W / 2;
    const hh = TILE_H / 2;
    g.poly([c.x, c.y - hh, c.x + hw, c.y, c.x, c.y + hh, c.x - hw, c.y]).fill({
      color: s.sidewalk,
      alpha: 1,
    });
    // Asphalt inset.
    const aw = hw * ASPHALT_INSET;
    const ah = hh * ASPHALT_INSET;
    g.poly([c.x, c.y - ah, c.x + aw, c.y, c.x, c.y + ah, c.x - aw, c.y]).fill({
      color: s.asphalt,
      alpha: 1,
    });
    // Sidewalk edge seam (front two edges only — the back edges hide under
    // the neighboring tile's sidewalk anyway).
    g.moveTo(c.x - hw, c.y).lineTo(c.x, c.y + hh).lineTo(c.x + hw, c.y).stroke({
      width: 1,
      color: s.sidewalkEdge,
      alpha: 0.9,
    });
    // Lane dashes along the travel axis (screen diagonals in tile space).
    const dash = (ax: number, ay: number, reach: number) => {
      g.moveTo(c.x - ax * reach, c.y - ay * reach)
        .lineTo(c.x + ax * reach, c.y + ay * reach)
        .stroke({ width: 1.5, color: s.lane, alpha: 0.75 });
    };
    if (t.axis === "x") dash(TILE_W / 2, TILE_H / 2, DASH_REACH);
    else if (t.axis === "y") dash(-TILE_W / 2, TILE_H / 2, DASH_REACH);
    else if (t.axis === "stub") dash(TILE_W / 2, TILE_H / 2, DASH_REACH * 0.5);
    // "cross" — intersection: plain asphalt, no dash.
    // Streetlamp at the front-right corner of the tile.
    if (t.lamp) {
      const lx = c.x + hw * 0.42;
      const ly = c.y + hh * 0.42;
      if (night) {
        g.circle(lx, ly, 6).fill({ color: 0xffd9a0, alpha: 0.16 });
        g.circle(lx, ly, 2.6).fill({ color: 0xffd9a0, alpha: 0.5 });
      }
      g.circle(lx, ly, 1.2).fill({ color: s.lampHead, alpha: night ? 0.95 : 0.8 });
    }
  }
}

/** Home-city street layer: day/night pair crossfaded by daylight. */
export class StreetsLayer extends Container {
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

  /** Redraw both variants from freshly derived street tiles. */
  sync(streets: readonly StreetTile[]): void {
    drawStreetTiles(this.night, streets, "night", (gx, gy) => ({
      x: ((gx - gy) * TILE_W) / 2,
      y: ((gx + gy) * TILE_H) / 2,
    }));
    drawStreetTiles(this.day, streets, "day", (gx, gy) => ({
      x: ((gx - gy) * TILE_W) / 2,
      y: ((gx + gy) * TILE_H) / 2,
    }));
  }
}
