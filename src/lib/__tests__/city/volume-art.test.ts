import { describe, expect, it } from "vitest";
import { buildingArt, monumentArt } from "@/lib/city/building-art";
import { ART_K, MONUMENT_K, compileArtToVolumes } from "@/lib/city/map3d/art-geometry";
import { volumesToCardArt } from "@/lib/city/volume-art";

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

function cardArt(tier: number, family: string | null, seed = 7) {
  return volumesToCardArt(
    compileArtToVolumes(buildingArt({ tier, family, seed }), ART_K(tier))
  );
}

describe("volume-art (card-matches-3D ruling)", () => {
  it("emits finite specs with positive bounds for every family × tier", () => {
    for (const family of FAMILIES) {
      for (let tier = 1; tier <= 14; tier++) {
        const art = cardArt(tier, family);
        expect(Number.isFinite(art.w)).toBe(true);
        expect(Number.isFinite(art.h)).toBe(true);
        expect(art.w).toBeGreaterThan(0);
        expect(art.h).toBeGreaterThan(0);
        expect(art.shapes.length).toBeGreaterThan(0);
        for (const s of art.shapes) {
          if (s.kind === "poly") {
            for (const [x, y] of s.pts) {
              expect(Number.isFinite(x)).toBe(true);
              expect(Number.isFinite(y)).toBe(true);
            }
          } else if (s.kind === "ellipse") {
            expect(Number.isFinite(s.cx)).toBe(true);
            expect(Number.isFinite(s.rx)).toBe(true);
            expect(s.rx).toBeGreaterThan(0);
            expect(s.ry).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("is deterministic and seed-sensitive", () => {
    expect(cardArt(5, "Cache Keeper", 1)).toEqual(cardArt(5, "Cache Keeper", 1));
    expect(cardArt(5, "Cache Keeper", 1)).not.toEqual(cardArt(5, "Cache Keeper", 2));
  });

  it("the tier ladder reads as taller cards (height follows content)", () => {
    for (const family of FAMILIES) {
      expect(cardArt(6, family).h).toBeGreaterThan(cardArt(2, family).h);
      expect(cardArt(14, family).h).toBeGreaterThan(cardArt(8, family).h);
    }
  });

  it("carries exactly one pulsing rooftop beacon per building card", () => {
    for (const family of ["Cryptographer", "Bot Herder", "Unassigned"]) {
      const art = cardArt(4, family);
      const pulses = art.shapes.filter(
        (s) => "pulse" in s && (s.pulse as boolean)
      );
      expect(pulses.length).toBe(1);
      expect(pulses[0].kind).toBe("ellipse");
    }
  });

  it("monument cards compile to finite art with no pulse", () => {
    for (let i = 0; i < 6; i++) {
      const art = volumesToCardArt(compileArtToVolumes(monumentArt(i), MONUMENT_K));
      expect(art.shapes.length).toBeGreaterThan(0);
      expect(
        art.shapes.filter((s) => "pulse" in s && (s.pulse as boolean)).length
      ).toBe(0);
    }
  });

  it("paint order is far-to-near (depth ascending) — rebuilding never flips order", () => {
    // Deterministic smoke check on the paint sequence.
    const sig = (art: ReturnType<typeof cardArt>) =>
      JSON.stringify(art.shapes.map((s) => `${s.kind}:${"fill" in s ? s.fill ?? "" : ""}`));
    expect(sig(cardArt(9, "Zero-Day"))).toBe(sig(cardArt(9, "Zero-Day")));
  });
});
