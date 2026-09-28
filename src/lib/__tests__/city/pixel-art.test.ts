import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { CITY_PIXEL_SHEETS, CITY_PIXEL_VARIANTS } from "@/components/city/world/scene/city-pixel-art.generated";
import { pixelVariantOf } from "@/lib/city/scene/pixel-variant";

const FAMILIES = [
  "Cryptographer",
  "Zero-Day",
  "Overclocker",
  "Cache Keeper",
  "Server Marshal",
  "Bot Herder",
  "Unassigned",
];

describe("CITY_PIXEL_SHEETS manifest (gen-city-pixel-art output)", () => {
  it("covers all 7 families × 7 sheet slots (game tiers 8–14) with sane geometry", () => {
    for (const family of FAMILIES) {
      const tiers = CITY_PIXEL_SHEETS[family];
      expect(tiers, family).toBeDefined();
      expect(tiers!.length).toBe(7);
      for (const meta of tiers!) {
        expect(meta, family).not.toBeNull();
        expect(meta!.frameW).toBeGreaterThanOrEqual(100);
        expect(meta!.frameH).toBeGreaterThan(meta!.artHeight);
        // Ground-contact anchor inside the frame, in the lower third.
        expect(meta!.anchorX).toBeGreaterThan(0);
        expect(meta!.anchorY).toBeGreaterThan(meta!.frameH * 0.5);
        expect(meta!.anchorY).toBeLessThan(meta!.frameH);
      }
    }
  });

  it("art height grows monotonically with tier (the no-label tier ladder)", () => {
    for (const family of FAMILIES) {
      const heights = CITY_PIXEL_SHEETS[family]!.map((m) => m!.artHeight);
      for (let i = 1; i < heights.length; i++) {
        expect(heights[i], `${family} t${i + 1}`).toBeGreaterThan(heights[i - 1]);
      }
    }
  });

  it("every manifest URL points at a generated PNG in public/", () => {
    const publicDir = path.join(process.cwd(), "public");
    for (const family of FAMILIES) {
      for (const meta of CITY_PIXEL_SHEETS[family]!) {
        const file = path.join(publicDir, meta!.url.replace(/^\//, ""));
        expect(fs.existsSync(file), file).toBe(true);
      }
    }
  });
});

describe("pixelVariantOf (deterministic per cardId)", () => {
  it("is stable across calls and within range", () => {
    for (let cardId = -5; cardId < 200; cardId++) {
      const a = pixelVariantOf(cardId);
      const b = pixelVariantOf(cardId);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(CITY_PIXEL_VARIANTS);
    }
  });

  it("spreads across all variants (no dead rows in the sheets)", () => {
    const seen = new Set<number>();
    for (let cardId = 1; cardId <= 300; cardId++) seen.add(pixelVariantOf(cardId));
    expect(seen.size).toBe(CITY_PIXEL_VARIANTS);
  });

  it("neighbouring cardIds do not all collapse to one variant", () => {
    const run = [1, 2, 3, 4, 5, 6, 7, 8].map(pixelVariantOf);
    expect(new Set(run).size).toBeGreaterThan(1);
  });
});
