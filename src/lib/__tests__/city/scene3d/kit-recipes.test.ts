/**
 * Shared kit recipes + staged asset extras (2026-09-30 catalog rewrite):
 * the HQ core / Founder monument constants live in assets3d and are consumed
 * by BOTH the 3D scene and the Buildings Catalog — these tests pin them to
 * shipped prefabs so the two can never drift. Also pins the extra Kenney
 * prop/detail GLBs staged into public/city-assets (downloaded from the full
 * CC0 packs; wiring TBD — see CITY_WORLD_MAP_REVIEW.md).
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  HQ_KIT_PREFAB,
  MONUMENT_KIT_PREFABS,
  MONUMENT_TINT,
  COMMERCIAL_BUILDINGS,
  SKYSCRAPERS,
  hqStageScale,
  kitManifest,
  monumentStageScale,
} from "@/components/city/world/scene3d/assets3d";

const KIT_ROOT = join(process.cwd(), "public", "city-assets");

describe("HQ kit recipe", () => {
  it("references a shipped commercial prefab", () => {
    const name = HQ_KIT_PREFAB.split("/")[1];
    expect(HQ_KIT_PREFAB.startsWith("commercial/")).toBe(true);
    expect([...COMMERCIAL_BUILDINGS, ...SKYSCRAPERS]).toContain(name);
    expect(kitManifest().commercial).toContain(name);
  });

  it("stage scales are pinned (scene ↔ catalog lockstep)", () => {
    expect(hqStageScale(1)).toBe(1.3);
    expect(hqStageScale(2)).toBe(1.55);
    expect(hqStageScale(3)).toBe(1.9);
    expect(hqStageScale(99)).toBe(1.9);
  });
});

describe("Founder monument kit roster", () => {
  it("has six distinct shipped prefabs (Founder order)", () => {
    expect(MONUMENT_KIT_PREFABS).toHaveLength(6);
    expect(new Set(MONUMENT_KIT_PREFABS).size).toBe(6);
    for (const key of MONUMENT_KIT_PREFABS) {
      expect(key.startsWith("commercial/")).toBe(true);
      expect(kitManifest().commercial).toContain(key.split("/")[1]);
    }
  });

  it("stage scales + tint strengths are pinned", () => {
    expect(monumentStageScale(1)).toBe(1.6);
    expect(monumentStageScale(2)).toBe(2.0);
    expect(monumentStageScale(3)).toBe(2.5);
    expect(MONUMENT_TINT).toBe(0.55);
  });
});

describe("staged Kenney extras (full CC0 packs, 2026-09-30)", () => {
  const extras = {
    commercial: [
      "detail-awning",
      "detail-awning-wide",
      "detail-overhang",
      "detail-overhang-wide",
      "detail-parasol-a",
      "detail-parasol-b",
      "low-detail-building-a",
      "low-detail-building-wide-b",
    ],
    suburban: [
      "planter",
      "path-short",
      "path-long",
      "path-stones-short",
      "path-stones-messy",
      "fence-low",
      "driveway-short",
    ],
    roads: [
      "traffic-light",
      "traffic-light-hanging",
      "road-sign-stop",
      "road-sign-street",
      "road-sign-warning",
      "electricity-pole",
      "electricity-pole-single",
      "dumpster",
      "construction-cone",
      "construction-barrier",
      "construction-fence",
    ],
  } as const;

  it("every staged prop file exists on disk", () => {
    for (const [kit, names] of Object.entries(extras)) {
      for (const name of names) {
        expect(existsSync(join(KIT_ROOT, kit, `${name}.glb`)), `${kit}/${name}`).toBe(true);
      }
    }
  });
});
