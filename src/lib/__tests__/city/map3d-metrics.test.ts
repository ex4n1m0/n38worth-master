import { describe, expect, it } from "vitest";
import {
  familyJitter,
  familyPalette3D,
  GRAND_MIN_TIER_3D,
  tierHeightCells,
  tierWidthCells,
} from "@/lib/city/map3d/metrics";

describe("map3d metrics", () => {
  it("grows tower height monotonically with tier, grand league clearly taller", () => {
    for (let t = 2; t <= 14; t++) {
      expect(tierHeightCells(t)).toBeGreaterThan(tierHeightCells(t - 1));
    }
    expect(tierHeightCells(1)).toBeCloseTo(0.38, 10);
    expect(tierHeightCells(14)).toBeCloseTo(0.38 + 1.95, 10);
    expect(tierHeightCells(GRAND_MIN_TIER_3D)).toBeGreaterThan(tierHeightCells(7));
    // Clamped, never NaN.
    expect(tierHeightCells(0)).toBeCloseTo(tierHeightCells(1), 10);
    expect(tierHeightCells(99)).toBeCloseTo(tierHeightCells(14), 10);
    expect(Number.isFinite(tierHeightCells(7))).toBe(true);
  });

  it("footprint width grows with tier and stays inside a cell", () => {
    expect(tierWidthCells(1)).toBeGreaterThan(0);
    expect(tierWidthCells(14)).toBeLessThanOrEqual(1.2 + 1e-9);
    expect(tierWidthCells(14)).toBeGreaterThan(tierWidthCells(1));
  });

  it("maps family indices to the card palettes, 6 = no-trade fallback", () => {
    const f0 = familyPalette3D(0);
    expect(f0.mass).toMatch(/^#[0-9a-f]{6}$/i);
    expect(f0.neon).toMatch(/^#[0-9a-f]{6}$/i);
    expect(familyPalette3D(6)).toEqual(familyPalette3D(99));
    // All six families resolve to distinct mass colors.
    const masses = new Set([0, 1, 2, 3, 4, 5].map((f) => familyPalette3D(f).mass));
    expect(masses.size).toBe(6);
  });

  it("jitters deterministically within ±4%", () => {
    expect(familyJitter(42)).toBeCloseTo(familyJitter(42), 12);
    expect(familyJitter(1)).not.toBe(familyJitter(2));
    for (let i = 0; i < 50; i++) {
      const j = familyJitter(i);
      expect(j).toBeGreaterThanOrEqual(0.96);
      expect(j).toBeLessThanOrEqual(1.04);
    }
  });
});
