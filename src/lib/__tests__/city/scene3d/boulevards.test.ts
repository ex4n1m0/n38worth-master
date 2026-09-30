/**
 * Ring boulevards (2026-09-30 "make it look like a city" ruling) — the
 * continuous street loops that make the value-orbit layout read as a
 * planned city grid.
 */

import { describe, expect, it } from "vitest";
import {
  BOULEVARD_TILE_CAP,
  deriveBoulevards,
} from "@/lib/city/streets";

/** Buildings on Chebyshev ring 4 (checkerboard) around the center. */
function ringCity(center: { gx: number; gy: number }, r: number) {
  const tiles: Array<{ gx: number; gy: number }> = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (((center.gx + dx + center.gy + dy) & 1) === 0) continue;
      tiles.push({ gx: center.gx + dx, gy: center.gy + dy });
    }
  }
  return tiles;
}

describe("deriveBoulevards — continuous ring loops", () => {
  const c = { gx: 48, gy: 48 };

  it("paves the ring just OUTSIDE each occupied building ring, unbroken", () => {
    const buildings = ringCity(c, 4);
    const tiles = deriveBoulevards(buildings, c);
    // Every tile sits exactly on Chebyshev ring 5.
    for (const t of tiles) {
      expect(Math.max(Math.abs(t.gx - c.gx), Math.abs(t.gy - c.gy))).toBe(5);
    }
    // The full ring perimeter (8×5=40 tiles) is paved when unblocked.
    expect(tiles).toHaveLength(40);
  });

  it("corners are crosswalks, edges carry the travel axis, lamps are regular", () => {
    const tiles = deriveBoulevards(ringCity(c, 4), c);
    const corners = tiles.filter(
      (t) =>
        Math.abs(t.gx - c.gx) === 5 && Math.abs(t.gy - c.gy) === 5
    );
    expect(corners.length).toBe(4);
    for (const t of corners) expect(t.axis).toBe("cross");
    const xEdges = tiles.filter(
      (t) => Math.abs(t.gy - c.gy) === 5 && Math.abs(t.gx - c.gx) < 5
    );
    for (const t of xEdges) expect(t.axis).toBe("x");
    const lamps = tiles.filter((t) => t.lamp).length;
    expect(lamps).toBeGreaterThan(3);
  });

  it("respects blocked fixtures and locked sectors (boulevards stop there)", () => {
    const buildings = ringCity(c, 4);
    const blocked = deriveBoulevards(
      buildings,
      c,
      (gx) => gx > c.gx // everything to the east is reserved
    );
    for (const t of blocked) expect(t.gx).toBeLessThanOrEqual(c.gx);
    expect(blocked.length).toBeGreaterThan(0);

    const gated = deriveBoulevards(
      buildings,
      c,
      () => false,
      (gx, gy) => gy <= c.gy // only the northern half is unlocked
    );
    for (const t of gated) expect(t.gy).toBeLessThanOrEqual(c.gy);
  });

  it("never paves an occupied building tile and stays deterministic", () => {
    const buildings = ringCity(c, 4).concat(ringCity(c, 7));
    const tiles = deriveBoulevards(buildings, c);
    const occupied = new Set(buildings.map((b) => `${b.gx},${b.gy}`));
    for (const t of tiles) expect(occupied.has(`${t.gx},${t.gy}`)).toBe(false);
    expect(tiles).toEqual(deriveBoulevards(buildings, c));
    // Two rings occupied → boulevards at 5 AND 8.
    const rings = new Set(
      tiles.map((t) => Math.max(Math.abs(t.gx - c.gx), Math.abs(t.gy - c.gy)))
    );
    expect(rings.has(5)).toBe(true);
    expect(rings.has(8)).toBe(true);
  });

  it("is bounded by BOULEVARD_TILE_CAP", () => {
    const big: Array<{ gx: number; gy: number }> = [];
    for (const r of [4, 7, 10, 13, 16, 19, 22, 25, 28]) {
      big.push(...ringCity(c, r));
    }
    const tiles = deriveBoulevards(big, c);
    expect(tiles.length).toBeLessThanOrEqual(BOULEVARD_TILE_CAP);
  });
});
