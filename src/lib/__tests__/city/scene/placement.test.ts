import { describe, expect, it } from "vitest";
import { GRID_SIZE, SECTOR_KEYS } from "@/lib/city/layout-schema";
import { PROFESSIONS } from "@/lib/professions";
import {
  familySector,
  ghostStartTile,
  previewPlacement,
  sectorKeyFor,
  stepGhostTile,
  tileFillOrder,
  tileRefKey,
  type TileRef,
} from "@/lib/city/placement";

describe("placement preview (PREVIEW-ONLY predicate)", () => {
  const occupied = new Set(["s0:5:5"]);
  const reserved = new Set(["s0:16:16"]);

  it("accepts a free, unlocked, in-bounds tile", () => {
    expect(
      previewPlacement({ tile: { sector: "s0", x: 4, y: 4 }, sectorCount: 1, occupied, reserved })
    ).toEqual({ valid: true, issue: null });
  });

  it("rejects out-of-bounds coordinates", () => {
    for (const tile of [
      { sector: "s0", x: GRID_SIZE, y: 0 },
      { sector: "s0", x: 0, y: -1 },
      { sector: "s0", x: 1.5, y: 0 },
    ]) {
      expect(previewPlacement({ tile, sectorCount: 9, occupied, reserved })).toEqual({
        valid: false,
        issue: "out-of-bounds",
      });
    }
  });

  it("rejects locked sectors using the payload's sector count", () => {
    expect(
      previewPlacement({ tile: { sector: "s2", x: 0, y: 0 }, sectorCount: 2, occupied, reserved })
    ).toEqual({ valid: false, issue: "sector-locked" });
    expect(
      previewPlacement({ tile: { sector: "s2", x: 0, y: 0 }, sectorCount: 3, occupied, reserved })
    ).toEqual({ valid: true, issue: null });
    expect(
      previewPlacement({ tile: { sector: "s99", x: 0, y: 0 }, sectorCount: 9, occupied, reserved })
    ).toEqual({ valid: false, issue: "sector-locked" });
  });

  it("rejects occupied and reserved tiles", () => {
    expect(
      previewPlacement({ tile: { sector: "s0", x: 5, y: 5 }, sectorCount: 1, occupied, reserved })
    ).toEqual({ valid: false, issue: "occupied" });
    expect(
      previewPlacement({ tile: { sector: "s0", x: 16, y: 16 }, sectorCount: 1, occupied, reserved })
    ).toEqual({ valid: false, issue: "reserved" });
  });
});

describe("ghost stepping", () => {
  it("clamps inside the grid and never changes sector", () => {
    const corner: TileRef = { sector: "s1", x: 0, y: GRID_SIZE - 1 };
    expect(stepGhostTile(corner, -3, 0)).toEqual({ sector: "s1", x: 0, y: 31 });
    expect(stepGhostTile(corner, 0, 5)).toEqual({ sector: "s1", x: 0, y: 31 });
    expect(stepGhostTile({ sector: "s1", x: 30, y: 30 }, 4, 4)).toEqual({
      sector: "s1",
      x: 31,
      y: 31,
    });
  });
});

describe("tile fill order (visual auto-arrangement)", () => {
  it("is deterministic and center-first", () => {
    const order = tileFillOrder(GRID_SIZE);
    expect(order).toHaveLength(GRID_SIZE * GRID_SIZE);
    // Center tie (15/16 × 15/16) resolves row-major → (15,15) first.
    expect(order[0]).toEqual({ x: 15, y: 15 });
    expect(order).toEqual(tileFillOrder(GRID_SIZE));
    const dist = (t: { x: number; y: number }) =>
      (t.x - 15.5) ** 2 + (t.y - 15.5) ** 2;
    for (let i = 1; i < order.length; i++) {
      expect(dist(order[i])).toBeGreaterThanOrEqual(dist(order[i - 1]) - 1e-9);
    }
  });

  it("gives ghostStartTile the first free tile in the family's sector", () => {
    const taken = (t: TileRef) => tileRefKey(t) !== "s0:15:15";
    const tile = ghostStartTile("Cryptographer", 1, taken);
    expect(tile.sector).toBe("s0");
    expect(tile).toEqual({ sector: "s0", x: 16, y: 15 });
    // Fully-booked grid degrades to the origin (server will reject with 409).
    expect(ghostStartTile(null, 1, () => false)).toEqual({ sector: "s0", x: 0, y: 0 });
  });
});

describe("family → sector mapping", () => {
  it("spreads the six professions across unlocked sectors, Boot for unknowns", () => {
    expect(familySector(null, 9)).toBe(0);
    expect(familySector("__unassigned__", 9)).toBe(0);
    expect(familySector("NotAProfession", 9)).toBe(0);
    // With all sectors open each profession gets its own district.
    PROFESSIONS.forEach((p, i) => expect(familySector(p.name, 9)).toBe(i === 0 ? 0 : i));
    // With one sector everything collapses into Boot.
    for (const p of PROFESSIONS) expect(familySector(p.name, 1)).toBe(0);
    // Two sectors: families fold by modulo (Cache Keeper is ordinal 3).
    expect(familySector("Cache Keeper", 2)).toBe(1);
  });

  it("sectorKeyFor maps indices to the schema whitelist", () => {
    expect(sectorKeyFor(0)).toBe(SECTOR_KEYS[0]);
    expect(sectorKeyFor(SECTOR_KEYS.length - 1)).toBe(SECTOR_KEYS[SECTOR_KEYS.length - 1]);
    expect(sectorKeyFor(SECTOR_KEYS.length)).toBeNull();
    expect(sectorKeyFor(-1)).toBeNull();
  });
});
