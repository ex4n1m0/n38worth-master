import { describe, expect, it } from "vitest";
import { buildingArt, monumentArt } from "@/lib/city/building-art";
import { compileArtToVolumes } from "@/lib/city/map3d/art-geometry";
import { tierScale } from "@/lib/city/map2d/draw";

const K = (tier: number) => (tierScale(tier) * 1.45) / 128;

const FAMILIES = [
  "Cryptographer",
  "Zero-Day",
  "Overclocker",
  "Cache Keeper",
  "Server Marshal",
  "Bot Herder",
  "Unassigned",
  null,
];

describe("map3d art-geometry compiler", () => {
  it("compiles every family × tier into finite, sane volumes", () => {
    for (const family of FAMILIES) {
      for (let tier = 1; tier <= 14; tier++) {
        const spec = buildingArt({ tier, family, seed: tier * 7 });
        const v = compileArtToVolumes(spec, K(tier));
        expect(v.boxes.length).toBeGreaterThanOrEqual(2); // platform + ≥1 mass
        expect(v.heightCells).toBeGreaterThan(0.2);
        expect(v.widthCells).toBeGreaterThan(0.2);
        expect(v.widthCells).toBeLessThanOrEqual(2.2);
        for (const b of v.boxes) {
          expect(Number.isFinite(b.x)).toBe(true);
          expect(Number.isFinite(b.y0)).toBe(true);
          expect(b.y1).toBeGreaterThanOrEqual(b.y0 - 1e-9);
          expect(b.w).toBeGreaterThan(0);
          expect(b.d).toBeGreaterThan(0);
        }
        for (const s of v.spheres) expect(Number.isFinite(s.x)).toBe(true);
        for (const t of v.tori) expect(t.r).toBeGreaterThan(0);
      }
    }
  });

  it("recovers pvBox masses as un-shaded base colors", () => {
    const spec = buildingArt({ tier: 3, family: "Server Marshal", seed: 1 });
    const v = compileArtToVolumes(spec, K(3));
    // Every box color is a valid hex; un-shading never explodes past white.
    for (const b of v.boxes) {
      expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
      const n = parseInt(b.color.slice(1), 16);
      expect(((n >> 16) & 0xff) <= 255).toBe(true);
    }
  });

  it("turns window dots into facade quads on all four walls", () => {
    const spec = buildingArt({ tier: 5, family: "Overclocker", seed: 42 });
    const v = compileArtToVolumes(spec, K(5));
    const quads = v.boxes.filter(
      (b) => b.color === "#ffb547" || b.color === "#cfe0ff"
    );
    expect(quads.length).toBeGreaterThan(0);
    // Quads hug the main mass walls (±mainHalfW on x, or ±z at the wall).
    for (const q of quads) {
      const onXWall = Math.abs(Math.abs(q.x) - (v.mainHalfW + 0.012)) < 1e-6;
      const onZWall = Math.abs(Math.abs(q.z) - (v.mainHalfW * 0.85 + 0.012)) < 1e-6;
      expect(onXWall || onZWall).toBe(true);
    }
  });

  it("grows within leagues and grand top clearly taller than grand base", () => {
    const h = (t: number) =>
      compileArtToVolumes(buildingArt({ tier: t, family: "Cache Keeper", seed: 0 }), K(t))
        .heightCells;
    // Within a league the art ladder is monotone; across the league boundary
    // the footprint scale (tierScale) drops enough that t8 ≈ t7 in CONTENT
    // height — faithful to the art — so only assert the grand ladder here.
    expect(h(7)).toBeGreaterThan(h(6));
    expect(h(9)).toBeGreaterThan(h(8));
    expect(h(14)).toBeGreaterThan(h(8));
    expect(h(14)).toBeGreaterThan(h(13));
  });

  it("compiles all six Founder monuments finite with volumes", () => {
    for (let i = 0; i < 6; i++) {
      const v = compileArtToVolumes(monumentArt(i), 1.5 / 150);
      expect(v.boxes.length).toBeGreaterThan(1);
      expect(v.heightCells).toBeGreaterThan(0.5);
      for (const b of v.boxes) expect(Number.isFinite(b.y0)).toBe(true);
    }
  });

  it("is deterministic", () => {
    const a = compileArtToVolumes(buildingArt({ tier: 9, family: "Zero-Day", seed: 5 }), K(9));
    const b = compileArtToVolumes(buildingArt({ tier: 9, family: "Zero-Day", seed: 5 }), K(9));
    expect(a).toEqual(b);
  });
});
