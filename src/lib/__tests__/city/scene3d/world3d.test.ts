/**
 * world3d — shared-universe FULL SKYLINE rendering (2026-09-30 ruling):
 * marker derivation on the FIXED world base ring (integer global-tile
 * anchors, viewer excluded, reach-bounded), the per-city skyline builder
 * (deterministic, capped, windowless minis on the satellite cluster walk),
 * and the ring signature that gates churn rebuilds.
 */

import { describe, expect, it } from "vitest";
import {
  UNIVERSE_MARKER_TILE_REACH,
  UNIVERSE_MINI_SCALE,
  appendUniverseCity,
  buildSatelliteCluster,
  buildStreetsGeometry,
  buildUniverseRingGeometry,
  deriveUniverseMarkers,
  universeRingSignature,
  universeSkylineCapFor,
  type UniverseMarker,
} from "@/components/city/world/scene3d/world3d";
import {
  UNIVERSE_CITY_CAP,
  UNIVERSE_RING_STEP,
  UNIVERSE_SKYLINE_LIMIT,
  WORLD_BASE_RING,
  universeRingForRank,
  universeRingRadius,
  type UniverseCity,
  type UniversePayload,
} from "@/lib/city/universe";
import { hqGlobalTile } from "@/lib/city/rings";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import { TILE_STEP } from "@/lib/city/scene/camera3d";
import { satelliteAnchor } from "@/lib/city/satellites";
import { MeshBuilder } from "@/components/city/world/scene3d/building3d";

function makePayload(n: number, skylineLen = UNIVERSE_SKYLINE_LIMIT): UniversePayload {
  const cities: UniverseCity[] = Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    username: `city_${i + 1}`,
    profession: i % 2 === 0 ? "Zero-Day" : null,
    count: 24,
    skyline: Array.from({ length: skylineLen }, (_, j) => [1 + (j % 14), j % 6]),
  }));
  return { epoch: "test", generatedAt: "test", cities };
}

describe("deriveUniverseMarkers — one shared universe", () => {
  it("excludes the viewer, keeps the count, and resolves their rank", () => {
    const { markers, count, viewerRank } = deriveUniverseMarkers(
      makePayload(30),
      "city_7",
      []
    );
    expect(count).toBe(30);
    expect(viewerRank).toBe(7);
    expect(markers).toHaveLength(29);
    expect(markers.find((m) => m.username === "city_7")).toBeUndefined();
  });

  it("anchors are INTEGER global tiles (no lossy px round-trip)", () => {
    const { markers } = deriveUniverseMarkers(makePayload(30), "city_1", []);
    for (const m of markers) {
      expect(Number.isInteger(m.gxWorld)).toBe(true);
      expect(Number.isInteger(m.gyWorld)).toBe(true);
    }
  });

  it("the constellation is congruent: two viewers differ by one translation", () => {
    const a = deriveUniverseMarkers(makePayload(40), "city_2", []).markers;
    const b = deriveUniverseMarkers(makePayload(40), "city_33", []).markers;
    const byNameA = new Map(a.map((m) => [m.username, m]));
    let dx: number | null = null;
    let dy: number | null = null;
    for (const m of b) {
      const other = byNameA.get(m.username);
      if (!other) continue; // each viewer's OWN city is absent from their map
      if (dx === null) {
        dx = other.gxWorld - m.gxWorld;
        dy = other.gyWorld - m.gyWorld;
      } else {
        expect(other.gxWorld - m.gxWorld).toBe(dx);
        expect(other.gyWorld - m.gyWorld).toBe(dy);
      }
    }
    expect(dx).not.toBeNull();
  });

  it("marks stake cities and passes skylines through", () => {
    const { markers } = deriveUniverseMarkers(
      makePayload(10),
      "city_1",
      ["city_5"]
    );
    const stake = markers.find((m) => m.username === "city_5")!;
    expect(stake.stake).toBe(true);
    expect(stake.skyline).toHaveLength(UNIVERSE_SKYLINE_LIMIT);
    expect(markers.find((m) => m.username === "city_6")!.stake).toBe(false);
  });

  it("bounds the world to the ground plate reach (viewer-relative)", () => {
    const { markers } = deriveUniverseMarkers(makePayload(UNIVERSE_CITY_CAP), "city_1", []);
    expect(markers.length).toBeGreaterThan(0);
    const hq = hqGlobalTile();
    for (const m of markers) {
      expect(Math.abs(m.gxWorld - hq.x)).toBeLessThanOrEqual(UNIVERSE_MARKER_TILE_REACH);
      expect(Math.abs(m.gyWorld - hq.y)).toBeLessThanOrEqual(UNIVERSE_MARKER_TILE_REACH);
    }
  });
});

describe("appendUniverseCity / buildUniverseRingGeometry — skylines", () => {
  const marker = (over: Partial<UniverseMarker>): UniverseMarker => {
    const { markers } = deriveUniverseMarkers(makePayload(2), "city_1", []);
    return { ...markers[0], ...over };
  };

  it("builds exactly perCityCap minis (device tiers bound the world)", () => {
    for (const cap of [6, 12, UNIVERSE_SKYLINE_LIMIT]) {
      const b = new MeshBuilder();
      const m = marker({});
      const built = appendUniverseCity(b, m, cap);
      expect(built).toBe(Math.min(m.skyline!.length, cap));
      // Geometry exists and is non-trivial (relay + minis).
      expect(b.toGeometry().attributes.position.count).toBeGreaterThan(24);
    }
  });

  it("is deterministic per (username, skyline, cap)", () => {
    const m = marker({});
    const a = buildUniverseRingGeometry([m], UNIVERSE_SKYLINE_LIMIT);
    const b = buildUniverseRingGeometry([m], UNIVERSE_SKYLINE_LIMIT);
    expect([...a.geometry.attributes.position.array]).toEqual([
      ...b.geometry.attributes.position.array,
    ]);
    expect([...a.geometry.attributes.color.array]).toEqual([
      ...b.geometry.attributes.color.array,
    ]);
  });

  it("a city with no skyline renders relay-only (0 minis, valid geometry)", () => {
    const b = new MeshBuilder();
    const built = appendUniverseCity(b, marker({ skyline: null, count: 0 }), 24);
    expect(built).toBe(0);
    expect(b.toGeometry().attributes.position.count).toBeGreaterThan(0);
  });

  it("UNIVERSE_MINI_SCALE keeps step-8 neighbours from touching", () => {
    // A 7-tile airy cluster at 0.55 spans ~3.9 tiles of radius; two cities
    // one ring stride (8) apart keep ≥ 0.2 tiles of skirt.
    expect(2 * 7 * UNIVERSE_MINI_SCALE).toBeLessThan(8);
  });
});

describe("universeRingSignature — churn gating", () => {
  it("is stable for identical rings and sensitive to content changes", () => {
    const m = deriveUniverseMarkers(makePayload(3), "city_1", []).markers;
    const sig = universeRingSignature(m, UNIVERSE_SKYLINE_LIMIT);
    expect(universeRingSignature([...m], UNIVERSE_SKYLINE_LIMIT)).toBe(sig);
    expect(
      universeRingSignature(
        [{ ...m[0], rank: m[0].rank + 1 }],
        UNIVERSE_SKYLINE_LIMIT
      )
    ).not.toBe(sig);
    expect(
      universeRingSignature([{ ...m[0], stake: true }], UNIVERSE_SKYLINE_LIMIT)
    ).not.toBe(sig);
    expect(
      universeRingSignature(
        [{ ...m[0], skyline: m[0].skyline!.slice(0, 10) }],
        UNIVERSE_SKYLINE_LIMIT
      )
    ).not.toBe(sig);
    // Tuples beyond the device cap cannot change pixels → same signature.
    const trimmed = m.map((x, i) =>
      i === 0 ? { ...x, skyline: x.skyline!.slice(0, 6) } : x
    );
    expect(universeRingSignature(trimmed, 6)).toBe(
      universeRingSignature(m.map((x) => ({ ...x, skyline: x.skyline!.slice(0, 6) })), 6)
    );
  });
});

describe("ground-coordinate z pinning (Vec3.z is the second ground axis)", () => {
  // Regression (found by the 2026-09-30 game-systems review): the older
  // world-layer builders passed tileToGround(...).y — ALWAYS 0, y is UP —
  // as the ground z coordinate, collapsing streets/satellites onto one
  // axis. tileToGround's ground plane lives in .x and .z, forever.
  it("satellite clusters sit on their anchor and SPAN z (not a sliver)", () => {
    const neighbor = {
      buildings: Array.from({ length: 12 }, (_, i) => ({
        cardId: 1000 + i,
        profession: "Zero-Day",
        tier: (1 + (i % 7)) as never,
      })),
    } as never as Parameters<typeof buildSatelliteCluster>[0];
    const built = buildSatelliteCluster(neighbor, 0, 9);
    built.geometry.computeBoundingBox();
    const bb = built.geometry.boundingBox!;
    const anchor = satelliteAnchor(0, GRID_SIZE, 9);
    const anchorZ = anchor.y * TILE_STEP;
    expect(bb.min.z).toBeLessThanOrEqual(anchorZ + 1);
    expect(bb.max.z).toBeGreaterThanOrEqual(anchorZ - 1);
    expect(bb.max.z - bb.min.z).toBeGreaterThan(100); // a cluster, not a line
  });

  it("streets span both ground axes", () => {
    const tiles = [
      { gx: 10, gy: 10, axis: "x" as const, lamp: true },
      { gx: 40, gy: 42, axis: "y" as const, lamp: false },
    ];
    const s = buildStreetsGeometry(tiles);
    s.geometry.computeBoundingBox();
    const bb = s.geometry.boundingBox!;
    expect(bb.max.z - bb.min.z).toBeGreaterThan(20 * TILE_STEP);
    expect(bb.max.x - bb.min.x).toBeGreaterThan(20 * TILE_STEP);
  });
});

describe("universeSkylineCapFor — device tiers", () => {
  it("full skylines on capable hardware, bounded below", () => {
    expect(universeSkylineCapFor(8)).toBe(UNIVERSE_SKYLINE_LIMIT);
    expect(universeSkylineCapFor(4)).toBe(12);
    expect(universeSkylineCapFor(2)).toBe(6);
  });
});

describe("full world build budget (bounded rendering)", () => {
  it(`builds all ${UNIVERSE_CITY_CAP} cities × ${UNIVERSE_SKYLINE_LIMIT} minis within a slice-pumpable budget`, () => {
    const { markers } = deriveUniverseMarkers(
      makePayload(UNIVERSE_CITY_CAP),
      "city_1",
      []
    );
    // Chunk by ring exactly like the scene's pump does.
    const rings = new Map<number, UniverseMarker[]>();
    for (const m of markers) {
      const ring = universeRingForRank(m.rank);
      const list = rings.get(ring);
      if (list) list.push(m);
      else rings.set(ring, [m]);
    }
    const start = performance.now();
    let minis = 0;
    for (const [, ringMarkers] of rings) {
      minis += buildUniverseRingGeometry(ringMarkers, UNIVERSE_SKYLINE_LIMIT).miniCount;
    }
    const ms = performance.now() - start;
    expect(minis).toBe((UNIVERSE_CITY_CAP - 1) * UNIVERSE_SKYLINE_LIMIT);
    // The pump slices at 24 ms, so anything within this budget completes in
    // well under a second of wall time without blocking input.
    expect(ms).toBeLessThan(8000);
  });

  it("WORLD_BASE_RING keeps every mapped city inside the ground plate", () => {
    let maxRadius = 0;
    for (let rank = 1; rank <= UNIVERSE_CITY_CAP; rank++) {
      maxRadius = Math.max(
        maxRadius,
        universeRingRadius(universeRingForRank(rank), WORLD_BASE_RING)
      );
    }
    // +8 rim for the outermost cluster skirt still clears the reach.
    expect(maxRadius + UNIVERSE_RING_STEP).toBeLessThanOrEqual(UNIVERSE_MARKER_TILE_REACH);
  });
});
