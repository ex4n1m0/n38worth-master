/**
 * Kenney City Kit pipeline (2026-09-30 "assets online" pivot) — the pure
 * prefab mapping contracts: deterministic per card, the value tier climbs
 * the architecture ladder (suburban → commercial → skyscrapers), street
 * axes map to road tiles, and every referenced GLB actually ships in
 * public/city-assets.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  COMMERCIAL_BUILDINGS,
  INDUSTRIAL_BUILDINGS,
  SKYSCRAPERS,
  SUBURBAN_BUILDINGS,
  kitManifest,
  pickBuildingPrefab,
  roadPrefabFor,
  roadTileFor,
} from "@/components/city/world/scene3d/assets3d";
import type { BuildingTier } from "@/lib/city/types";

describe("pickBuildingPrefab — the architecture ladder", () => {
  it("is deterministic per (profession, tier, seed)", () => {
    for (const profession of ["Zero-Day", "Bot Herder", null]) {
      for (const tier of [1, 5, 9] as BuildingTier[]) {
        const a = pickBuildingPrefab(profession, tier, 4242);
        const b = pickBuildingPrefab(profession, tier, 4242);
        expect(a).toEqual(b);
      }
    }
  });

  it("tiers climb: 1-3 suburban, 4-7 commercial+industrial, 8-14 skyscrapers", () => {
    const mid = [...COMMERCIAL_BUILDINGS, ...INDUSTRIAL_BUILDINGS];
    for (let seed = 1; seed <= 60; seed++) {
      const t2 = pickBuildingPrefab("Zero-Day", 2 as BuildingTier, seed);
      expect(SUBURBAN_BUILDINGS).toContain(t2.name);
      expect(t2.kit).toBe("suburban");
      const t4 = pickBuildingPrefab("Zero-Day", 4 as BuildingTier, seed);
      expect(mid).toContain(t4.name);
      expect(["commercial", "industrial"]).toContain(t4.kit);
      const t6 = pickBuildingPrefab("Zero-Day", 6 as BuildingTier, seed);
      expect(mid).toContain(t6.name);
      const t12 = pickBuildingPrefab("Zero-Day", 12 as BuildingTier, seed);
      expect(SKYSCRAPERS).toContain(t12.name);
      expect(t12.kit).toBe("commercial");
    }
  });

  it("mid league mixes BOTH pools (industrial variety is reachable)", () => {
    const kits = new Set(
      Array.from({ length: 120 }, (_, i) =>
        pickBuildingPrefab(null, 5 as BuildingTier, i + 1)
      ).map((p) => p.kit)
    );
    expect(kits.has("commercial")).toBe(true);
    expect(kits.has("industrial")).toBe(true);
    expect(new Set(INDUSTRIAL_BUILDINGS).size).toBe(20);
  });

  it("spreads seeds across variants (a city of one house would read dead)", () => {
    const names = new Set(
      Array.from({ length: 80 }, (_, i) => pickBuildingPrefab(null, 2 as BuildingTier, i + 1).name)
    );
    expect(names.size).toBeGreaterThan(5);
  });
});

describe("roadPrefabFor — street tile mapping", () => {
  it("intersections, dead-ends and straights", () => {
    expect(roadPrefabFor("cross")).toBe("road-crossroad");
    expect(roadPrefabFor("stub")).toBe("road-end");
    expect(roadPrefabFor("x")).toBe("road-straight");
    expect(roadPrefabFor("y")).toBe("road-straight");
  });
});

describe("roadTileFor — Kenney 3D Road Tiles mapping", () => {
  it("travel axes orient the straight; cross is symmetric (2026-09-30)", () => {
    expect(roadTileFor("x")).toEqual({ kind: "straight", yaw: 0 });
    expect(roadTileFor("y")).toEqual({ kind: "straight", yaw: Math.PI / 2 });
    expect(roadTileFor("cross")).toEqual({ kind: "cross", yaw: 0 });
    expect(roadTileFor("stub").kind).toBe("straight");
  });
});

describe("kit manifest — every prefab ships in public/city-assets", () => {
  it("all GLBs + colormap textures exist on disk", () => {
    const root = join(process.cwd(), "public", "city-assets");
    for (const [kit, names] of Object.entries(kitManifest())) {
      for (const name of names) {
        expect(existsSync(join(root, kit, `${name}.glb`))).toBe(true);
      }
      expect(existsSync(join(root, kit, "Textures", "colormap.png"))).toBe(true);
    }
  });

  it("road tiles (multi-primitive .gltf) ship in public/city-assets/roadtiles", () => {
    const root = join(process.cwd(), "public", "city-assets", "roadtiles");
    for (const name of ["roadTile_142", "roadTile_043", "roadTile_025"]) {
      expect(existsSync(join(root, `${name}.gltf`))).toBe(true);
    }
  });
});
