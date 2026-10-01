/**
 * World-map v2 (2026-10-01 "do all proposed modifications"): civic lot 3D
 * recipes, the world river's clearance contracts, and the water tile in
 * the shipped road-tiles manifest.
 */

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CIVIC_NEON,
  CIVIC_TINT,
  civicKitPrefab,
  civicTierScale,
} from "@/components/city/world/scene3d/civic3d";
import { kitManifest } from "@/components/city/world/scene3d/assets3d";
import { CIVIC_KINDS } from "@/lib/city/types";
import {
  deriveRiver,
  RIVER_OFFSET_TILES,
  RIVER_WIDTH_TILES,
  riverOffsetForCities,
} from "@/lib/city/river";
import { satelliteRingRadii, SATELLITE_CLUSTER_RADIUS } from "@/lib/city/satellites";
import {
  universeRingForRank,
  universeRingRadius,
  WORLD_BASE_RING,
} from "@/lib/city/universe";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import { SECTOR_MACRO } from "@/lib/city/scene/iso";

describe("civic 3D recipes", () => {
  it("picks four DISTINCT shipped mid-league prefabs (one per kind)", () => {
    const picks = CIVIC_KINDS.map((k) => civicKitPrefab(k));
    const keys = new Set(picks.map((p) => `${p.kit}/${p.name}`));
    expect(keys.size).toBe(4);
    for (const p of picks) {
      expect(["commercial", "industrial"]).toContain(p.kit);
      expect(kitManifest()[p.kit]).toContain(p.name);
    }
  });

  it("is deterministic per kind", () => {
    for (const k of CIVIC_KINDS) {
      expect(civicKitPrefab(k)).toEqual(civicKitPrefab(k));
    }
  });

  it("tier scales + tint strengths are pinned (monument-adjacent)", () => {
    expect(civicTierScale(1)).toBe(1.45);
    expect(civicTierScale(2)).toBe(1.7);
    expect(civicTierScale(3)).toBe(2.0);
    expect(CIVIC_TINT).toBe(0.85);
    expect(CIVIC_NEON.police).toBe("#60a5fa");
    expect(CIVIC_NEON.hospital).toBe("#f87171");
  });
});

describe("world river", () => {
  it("band clears the largest city's satellite zone (offset ≥ rim + 1)", () => {
    const { rx, ry } = satelliteRingRadii(SECTOR_MACRO.length, GRID_SIZE);
    const satelliteRim = Math.max(rx, ry) + SATELLITE_CLUSTER_RADIUS;
    expect(riverOffsetForCities(1)).toBeGreaterThan(satelliteRim);
    expect(riverOffsetForCities(0)).toBeGreaterThan(satelliteRim);
  });

  it("band sits in the always-empty gap past the last populated ring", () => {
    // Any city count: river offset is past that count's LAST ring (whose
    // cities span ±4) and before the NEXT ring's anchor radius. The next
    // ring is empty BY CONSTRUCTION — when it populates, the offset slides
    // out with it (riverOffsetForCities follows the same count).
    for (const count of [1, 25, 65, 66, 200, 500]) {
      const lastRing = universeRingForRank(Math.max(2, count), WORLD_BASE_RING);
      const lastRadius = universeRingRadius(lastRing, WORLD_BASE_RING);
      const offset = riverOffsetForCities(count);
      expect(offset).toBeGreaterThan(lastRadius + 4); // clear of last ring's cities
      expect(offset + RIVER_WIDTH_TILES - 1).toBeLessThan(
        universeRingRadius(lastRing + 1, WORLD_BASE_RING)
      ); // river never reaches the next ring's anchors
    }
  });

  it("is deterministic, bounded and exactly the band rectangle", () => {
    const tiles = deriveRiver();
    expect(tiles).toHaveLength((2 * 96 + 1) * RIVER_WIDTH_TILES);
    expect(tiles.every((t) => t.gy <= -RIVER_OFFSET_TILES)).toBe(true);
    expect(tiles.every((t) => t.gy >= -(RIVER_OFFSET_TILES + RIVER_WIDTH_TILES - 1))).toBe(true);
    expect(tiles.every((t) => Math.abs(t.gx) <= 96)).toBe(true);
    // Same output on re-derivation (pure function, no persistence).
    expect(deriveRiver()).toEqual(tiles);
  });
});

describe("water tile ships in the road-tiles folder", () => {
  it("roadTile_001.gltf exists (the river's water plate)", () => {
    expect(
      existsSync(join(process.cwd(), "public", "city-assets", "roadtiles", "roadTile_001.gltf"))
    ).toBe(true);
  });
});
