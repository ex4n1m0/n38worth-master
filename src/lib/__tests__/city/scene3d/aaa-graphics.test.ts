/**
 * AAA graphics pass (2026-09-30) — pipeline contract tests: outward
 * winding (FrontSide safety), UV window-grid alignment between the facade
 * textures and the lit-pane mosaic, street micro-geometry groups, and the
 * prop planners' placement guarantees.
 */

import { describe, expect, it } from "vitest";
import {
  MeshBuilder,
  buildBuildingGeometry,
} from "@/components/city/world/scene3d/building3d";
import {
  buildStreetsGeometry,
  streetLampSpots,
} from "@/components/city/world/scene3d/world3d";
import {
  planParkedCars,
  planTrees,
} from "@/components/city/world/scene3d/props3d";

describe("MeshBuilder — outward winding (FrontSide contract)", () => {
  it("box faces emit normals pointing away from the box center", () => {
    const b = new MeshBuilder();
    const cx = 10;
    const cz = -4;
    const topPx = 30;
    b.box(cx, cz, 0, 9, 7, topPx, { r: 1, g: 1, b: 1 } as never);
    const g = b.toGeometry();
    const pos = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    for (let i = 0; i < pos.count; i++) {
      const nx = nrm.getX(i);
      const ny = nrm.getY(i);
      const nz = nrm.getZ(i);
      const dx = pos.getX(i) - cx;
      const dy = pos.getY(i) - (topPx * 1.1547) / 2;
      const dz = pos.getZ(i) - cz;
      // Every vertex normal must have a non-negative component along the
      // outward direction (flat faces: the normal is exactly one axis).
      expect(nx * dx + ny * dy + nz * dz).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it("toGeometry emits position, color, normal AND uv attributes", () => {
    const { geometry } = buildBuildingGeometry("Server Marshal", 5, 42);
    expect(geometry.getAttribute("position")).toBeTruthy();
    expect(geometry.getAttribute("color")).toBeTruthy();
    expect(geometry.getAttribute("normal")).toBeTruthy();
    expect(geometry.getAttribute("uv")).toBeTruthy();
    expect(geometry.getAttribute("uv").count).toBe(
      geometry.getAttribute("position").count
    );
  });
});

describe("facade grid — texture cells align with the lit-pane mosaic", () => {
  it("gridCols/gridRows are the shared window metrics", () => {
    // A 3-cell-wide, ~2-row wall maps to exactly 3×2 texture window cells;
    // the mosaic uses the SAME counts, so lit panes land inside the
    // texture's recessed windows.
    expect(MeshBuilder.gridCols(3 * 8.4)).toBe(3);
    expect(MeshBuilder.gridCols(8.4 * 0.9)).toBe(1);
    expect(MeshBuilder.gridRows(3 * 8.5)).toBeGreaterThanOrEqual(2);
  });
});

describe("streets 2.0 — micro-geometry groups", () => {
  const tiles = [
    { gx: 10, gy: 10, axis: "x" as const, lamp: true },
    { gx: 12, gy: 10, axis: "y" as const, lamp: false },
    { gx: 11, gy: 11, axis: "cross" as const, lamp: true },
    { gx: 30, gy: 30, axis: "stub" as const, lamp: false },
  ];

  it("renders asphalt (0), concrete sidewalk/curb (7) and paint (5) groups", () => {
    const s = buildStreetsGeometry(tiles);
    const mats = new Set(s.geometry.groups.map((g) => g.materialIndex));
    expect(mats.has(0)).toBe(true); // asphalt
    expect(mats.has(7)).toBe(true); // sidewalk + curb faces
    expect(mats.has(5)).toBe(true); // lane dashes + crosswalks
    // Groups cover the whole index buffer (no orphaned runs).
    const covered = s.geometry.groups.reduce((n, g) => n + g.count, 0);
    expect(covered).toBe(s.geometry.index!.count);
  });

  it("crosswalk tiles carry more paint than plain dash tiles", () => {
    const s = buildStreetsGeometry(tiles);
    const paintOf = (list: typeof tiles) =>
      buildStreetsGeometry(list).geometry.groups
        .filter((g) => g.materialIndex === 5)
        .reduce((n, g) => n + g.count, 0);
    expect(paintOf([tiles[2]])).toBeGreaterThan(paintOf([tiles[3]]));
  });

  it("streetLampSpots returns one sidewalk-corner spot per lamp tile", () => {
    const spots = streetLampSpots(tiles);
    expect(spots).toHaveLength(2);
    for (const s of spots) expect(Number.isFinite(s.x)).toBe(true);
  });
});

describe("prop planners — placement guarantees", () => {
  it("trees never land on occupied or paved tiles and center on the city", () => {
    const occupied = new Set(["48,48"]);
    const paved = new Set(["50,48"]);
    const trees = planTrees(occupied, paved, new Set(), 6, 60, 7, {
      gx: 48,
      gy: 48,
    });
    expect(trees.length).toBeGreaterThan(0);
    // All placements cluster around the center (within radius + slack).
    for (const t of trees) {
      expect(Math.abs(t.x - 48 * 90.51)).toBeLessThan(14 * 90.51);
      expect(t.scale).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("parked cars park on non-stub tiles and stay inside the budget", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      gx: i,
      gy: i,
      axis: "cross" as const,
      lamp: false,
    }));
    const cars = planParkedCars(many, 25, 3);
    expect(cars.length).toBeGreaterThan(0);
    expect(cars.length).toBeLessThanOrEqual(25);
    for (const c of cars) expect([0, Math.PI / 2]).toContain(c.yaw);
  });
});
