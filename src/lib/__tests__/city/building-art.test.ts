import { describe, it, expect } from "vitest";
import {
  buildingArt,
  monumentArt,
  ART_FAMILIES,
  type ArtSpec,
  type ArtShape,
} from "@/lib/city/building-art";

/** Every numeric coordinate/size in the spec must be a finite number. */
function shapeNumbers(s: ArtShape): number[] {
  switch (s.kind) {
    case "poly":
      return s.pts.flatMap(([x, y]) => [x, y]);
    case "rect":
      return [s.x, s.y, s.w, s.h, s.rx ?? 0, s.strokeW ?? 0, s.opacity ?? 1];
    case "ellipse":
      return [s.cx, s.cy, s.rx, s.ry, s.strokeW ?? 0, s.opacity ?? 1];
    case "circle":
      return [s.cx, s.cy, s.r, s.strokeW ?? 0, s.opacity ?? 1];
    case "line":
      return [s.x1, s.y1, s.x2, s.y2, s.strokeW, s.opacity ?? 1];
    case "path":
      return [s.strokeW ?? 0, s.opacity ?? 1];
  }
}

function expectFiniteSpec(spec: ArtSpec) {
  expect(Number.isFinite(spec.w)).toBe(true);
  expect(Number.isFinite(spec.h)).toBe(true);
  expect(spec.w).toBeGreaterThan(0);
  expect(spec.h).toBeGreaterThan(0);
  expect(spec.shapes.length).toBeGreaterThan(0);
  for (const s of spec.shapes) {
    for (const n of shapeNumbers(s)) {
      expect(Number.isFinite(n)).toBe(true);
    }
  }
}

const FAMILY_INPUTS: Array<string | null | undefined> = [
  ...ART_FAMILIES,
  null,
  undefined,
  "NotAProfession",
];

describe("buildingArt determinism", () => {
  it("equal inputs deep-equal (pure function)", () => {
    for (const family of FAMILY_INPUTS) {
      for (const tier of [1, 5, 8, 14]) {
        expect(buildingArt({ tier, family, seed: 42 })).toEqual(
          buildingArt({ tier, family, seed: 42 })
        );
      }
    }
  });

  it("different seeds produce different shapes (seeded window dots)", () => {
    const a = buildingArt({ tier: 5, family: "Cache Keeper", seed: 1 });
    const b = buildingArt({ tier: 5, family: "Cache Keeper", seed: 2 });
    expect(JSON.stringify(a.shapes)).not.toBe(JSON.stringify(b.shapes));
  });

  it("same seed across families differs", () => {
    const a = buildingArt({ tier: 5, family: "Zero-Day", seed: 7 });
    const b = buildingArt({ tier: 5, family: "Overclocker", seed: 7 });
    expect(JSON.stringify(a.shapes)).not.toBe(JSON.stringify(b.shapes));
    // ...and pairwise across every distinct geometry family key.
    for (let i = 0; i < ART_FAMILIES.length; i++) {
      for (let j = i + 1; j < ART_FAMILIES.length; j++) {
        const sa = buildingArt({ tier: 6, family: ART_FAMILIES[i], seed: 9 });
        const sb = buildingArt({ tier: 6, family: ART_FAMILIES[j], seed: 9 });
        expect(JSON.stringify(sa.shapes)).not.toBe(JSON.stringify(sb.shapes));
      }
    }
  });

  it("null / undefined / unknown professions all resolve to Unassigned", () => {
    const base = buildingArt({ tier: 3, family: "Unassigned", seed: 5 });
    expect(buildingArt({ tier: 3, family: null, seed: 5 })).toEqual(base);
    expect(buildingArt({ tier: 3, family: undefined, seed: 5 })).toEqual(base);
    expect(buildingArt({ tier: 3, family: "NotAProfession", seed: 5 })).toEqual(base);
  });
});

describe("buildingArt coverage (every family × every tier)", () => {
  it("emits finite specs with positive bounds", () => {
    for (const family of FAMILY_INPUTS) {
      for (let tier = 1; tier <= 14; tier++) {
        expectFiniteSpec(buildingArt({ tier, family, seed: tier * 100 }));
      }
    }
  });

  it("height strictly increases within league boundaries", () => {
    for (const family of FAMILY_INPUTS) {
      const h1 = buildingArt({ tier: 1, family, seed: 1 }).h;
      const h2 = buildingArt({ tier: 2, family, seed: 1 }).h;
      expect(h2).toBeGreaterThan(h1);
      const h8 = buildingArt({ tier: 8, family, seed: 1 }).h;
      const h14 = buildingArt({ tier: 14, family, seed: 1 }).h;
      expect(h14).toBeGreaterThan(h8);
    }
  });

  it("grand (tier 8) shapes differ from civic (tier 7)", () => {
    for (const family of FAMILY_INPUTS) {
      const civic = buildingArt({ tier: 7, family, seed: 3 });
      const grand = buildingArt({ tier: 8, family, seed: 3 });
      expect(JSON.stringify(grand.shapes)).not.toBe(JSON.stringify(civic.shapes));
      expect(grand.h).toBeGreaterThan(civic.h);
    }
  });

  it("civic art carries exactly one pulse beacon; monuments carry none", () => {
    const spec = buildingArt({ tier: 4, family: "Bot Herder", seed: 11 });
    const pulses = spec.shapes.filter(
      (s) => ("pulse" in s && s.pulse) as boolean
    );
    expect(pulses.length).toBe(1);
    expect(pulses[0].kind).toBe("circle");
    for (let i = 0; i <= 5; i++) {
      expect(
        monumentArt(i).shapes.filter((s) => ("pulse" in s && s.pulse) as boolean)
          .length
      ).toBe(0);
    }
  });
});

describe("monumentArt", () => {
  it("indexes 0..5 are finite", () => {
    for (let i = 0; i <= 5; i++) {
      const spec = monumentArt(i);
      expectFiniteSpec(spec);
      expect(spec.w).toBe(150);
      expect(spec.h).toBe(210);
    }
  });

  it("indexes 0..5 are pairwise distinct", () => {
    const jsons = [0, 1, 2, 3, 4, 5].map((i) => JSON.stringify(monumentArt(i)));
    for (let i = 0; i < jsons.length; i++) {
      for (let j = i + 1; j < jsons.length; j++) {
        expect(jsons[i]).not.toBe(jsons[j]);
      }
    }
  });
});
