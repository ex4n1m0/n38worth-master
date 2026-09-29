/**
 * building3d — procedural geometry contract (pure three.js geometry, no
 * GPU): deterministic per (family, tier, seed) builds, and the two
 * window-channel groups exist on every civic building so the shared
 * channel materials can animate the city-wide lit-pane mosaic.
 */

import { describe, expect, it } from "vitest";
import {
  buildBuildingGeometry,
  buildHqGeometry,
  buildMonumentGeometry,
  familyTopHeightPx,
  GRAND_MIN_TIER,
} from "@/components/city/world/scene3d/building3d";
import { PROFESSIONS } from "@/lib/professions";
import { UNASSIGNED_FAMILY, type BuildingTier } from "@/lib/city/types";

const FAMILIES = [...PROFESSIONS.map((p) => p.name), UNASSIGNED_FAMILY];
const TIERS = [1, 4, 7, 8, 11, 14] as const satisfies readonly BuildingTier[];

describe("building3d — determinism", () => {
  it("same inputs produce byte-identical geometry", () => {
    for (const family of FAMILIES) {
      for (const tier of TIERS) {
        const a = buildBuildingGeometry(family, tier, 1234);
        const b = buildBuildingGeometry(family, tier, 1234);
        expect([...a.geometry.attributes.position.array]).toEqual([
          ...b.geometry.attributes.position.array,
        ]);
        expect([...a.geometry.attributes.color.array]).toEqual([
          ...b.geometry.attributes.color.array,
        ]);
        expect([...(a.geometry.index?.array ?? [])]).toEqual([
          ...(b.geometry.index?.array ?? []),
        ]);
      }
    }
  });

  it("different seeds produce different window mosaics", () => {
    const a = buildBuildingGeometry("Server Marshal", 5, 1);
    const b = buildBuildingGeometry("Server Marshal", 5, 2);
    expect(a.geometry.attributes.color.array).not.toEqual(
      b.geometry.attributes.color.array
    );
  });
});

describe("building3d — window channel groups (the night light identity)", () => {
  it("every family×tier carries both window channel groups", () => {
    for (const family of FAMILIES) {
      for (const tier of ([1, 5, 9, 14] as const satisfies readonly BuildingTier[])) {
        const { geometry } = buildBuildingGeometry(family, tier, 42);
        const materials = geometry.groups.map((g) => g.materialIndex);
        expect(materials).toContain(1);
        expect(materials).toContain(2);
        // Groups are contiguous, ordered, and cover the whole index buffer.
        const indexCount = geometry.index?.count ?? 0;
        const covered = geometry.groups.reduce((n, g) => n + g.count, 0);
        expect(covered).toBe(indexCount);
      }
    }
  });

  it("window pane count grows with the tier (taller bodies, more rows)", () => {
    const panesAt = (tier: BuildingTier) => {
      const { geometry } = buildBuildingGeometry("Server Marshal", tier, 7);
      return geometry.groups
        .filter((g) => g.materialIndex === 1 || g.materialIndex === 2)
        .reduce((n, g) => n + g.count / 6, 0); // 2 tris per pane quad
    };
    expect(panesAt(6)).toBeGreaterThan(panesAt(2));
    expect(panesAt(12)).toBeGreaterThan(panesAt(8));
  });
});

describe("building3d — hero fixtures", () => {
  it("HQ and all six monuments build with windows and grow by stage", () => {
    const hq1 = buildHqGeometry(1);
    const hq3 = buildHqGeometry(3);
    expect(hq3.topPx).toBeGreaterThan(hq1.topPx);
    expect(hq1.geometry.groups.some((g) => g.materialIndex === 1)).toBe(true);
    for (let i = 0; i < 6; i++) {
      const m = buildMonumentGeometry(i, 2, true);
      expect(m.geometry.attributes.position.count).toBeGreaterThan(24);
    }
  });

  it("height ladder matches the 2D manifest formula", () => {
    expect(familyTopHeightPx("Server Marshal", 1)).toBe(44);
    expect(familyTopHeightPx("Server Marshal", 7)).toBe(44 + 6 * 15);
    expect(familyTopHeightPx("Zero-Day", 14)).toBe(134 + 6 * 16);
    expect(familyTopHeightPx(null, GRAND_MIN_TIER)).toBe(118);
  });
});

describe("building3d — perf budget (informational)", () => {
  it("200 procedural buildings build in well under a sync budget", () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) {
      buildBuildingGeometry(
        PROFESSIONS[i % PROFESSIONS.length].name,
        ((i % 14) + 1) as BuildingTier,
        i + 1
      );
    }
    const ms = performance.now() - t0;
    // Generous ceiling: 200 full-window buildings must stay interactive.
    expect(ms).toBeLessThan(2000);
  });
});
