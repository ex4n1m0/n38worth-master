/**
 * Phase D budget bench (MAINFRAME_CITY_RTS_PLAN §D9) — projection+reconcile
 * compute. Pure vitest, no new deps, no DB, no network.
 *
 * What is measured (the §D9 "< 25 ms @5k" budget):
 *   makeCityFixture(n, 42)            — OUTSIDE the timed loop (fixture build)
 *   projectCity(profile, cards, FIXTURE_NOW, aggregates)
 *   mergePlacements(city, ~300 placements, version 1)
 *
 * Assertions are SANITY + a very loose regression tripwire (150 ms mean @5k,
 * ~50–75× the expected value) so the suite stays fast and non-flaky; the real
 * budget verdict is recorded from the console.log numbers in
 * .city-qa-d/PHASE_D_MEASUREMENTS.md. A second, informational block re-imports the
 * projection module with the dev-only CITY_DETAILED_LIMIT override to measure
 * compute at elevated limits (500/1000/2000/5000) — the data the §D1
 * DETAILED_LIMIT contract question needs on the SERVER-compute side (payload
 * and browser fps/heap/DOM are measured separately).
 */

import { describe, it, expect, afterAll, vi } from "vitest";
import { FIXTURE_NOW, makeCityFixture } from "@/lib/city/fixtures";
import { DEFAULT_DETAILED_LIMIT, projectCity } from "@/lib/city/projection";
import { mergePlacements } from "@/lib/city/layout-merge";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import type { CityPlacement, CityProjection } from "@/lib/city/types";

const SIZES = [20, 100, 500, 1000, 5000] as const;

/** ~300 deterministic, tile-unique placements (grid contract: s0..s8, 0..31). */
function samplePlacements(city: CityProjection, count: number): Map<number, CityPlacement> {
  const placements = new Map<number, CityPlacement>();
  const buildings = city.families.flatMap((f) => f.buildings);
  const take = Math.min(count, buildings.length);
  for (let i = 0; i < take; i++) {
    placements.set(buildings[i].cardId, {
      sector: `s${i % 9}`,
      x: Math.floor(i / 9) % 32,
      y: Math.floor(i / 288) % 32,
      rotation: i % 4,
      variant: (i + 1) % 4,
    });
  }
  return placements;
}

interface Sample {
  n: number;
  iterations: number;
  meanMs: number;
  maxMs: number;
  minMs: number;
}

/** Adaptive timing loop: warmup, then run until maxIters OR timeCapMs. */
function timeRun(fn: () => void, maxIters: number, timeCapMs: number): Omit<Sample, "n"> {
  fn();
  fn(); // warmup
  const times: number[] = [];
  const start = performance.now();
  for (let i = 0; i < maxIters; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
    if (times.length >= 5 && performance.now() - start > timeCapMs) break;
  }
  const total = times.reduce((a, b) => a + b, 0);
  return {
    iterations: times.length,
    meanMs: total / times.length,
    maxMs: Math.max(...times),
    minMs: Math.min(...times),
  };
}

describe("phase D bench — projection+reconcile compute (production default DETAILED_LIMIT=200)", () => {
  it("records the 20/100/500/1000/5000 compute curve and sanity-checks the projection", () => {
    expect(DEFAULT_DETAILED_LIMIT).toBe(200);
    const samples: Sample[] = [];

    for (const n of SIZES) {
      const { profile, ownedCards, aggregates } = makeCityFixture(n, 42);
      const goddessCards = ownedCards.filter((c) =>
        (GODDESS_USERNAMES as readonly string[]).includes(c.username)
      );
      const totalBuildings = n - goddessCards.length;
      // Placements derive from a first (untimed) projection so cardIds match.
      const base = projectCity(profile, ownedCards, FIXTURE_NOW, aggregates);
      const placements300 = samplePlacements(base, 300);
      const run = () =>
        mergePlacements(
          projectCity(profile, ownedCards, FIXTURE_NOW, aggregates),
          placements300,
          1
        );

      const timing = timeRun(run, n >= 1000 ? 25 : 40, 200);
      samples.push({ n, ...timing });

      // Sanity: the route/response contract pinned in §D1/§D9.
      const out = run();
      const expectedDetailed = Math.min(DEFAULT_DETAILED_LIMIT, totalBuildings);
      expect(out.detailedCount).toBe(expectedDetailed);
      expect(out.aggregatedCount).toBe(totalBuildings - expectedDetailed);
      expect(out.sectorInfo).toHaveLength(9);
      expect(out.landmarks).toHaveLength(6);
      expect(out.layoutVersion).toBe(1);
      const buildingSum = out.families.reduce((s, f) => s + f.buildings.length, 0);
      expect(buildingSum).toBe(expectedDetailed);
      const attached = out.families.reduce(
        (s, f) => s + f.buildings.filter((b) => b.placement !== null).length,
        0
      );
      expect(attached).toBe(placements300.size);
    }

    // eslint-disable-next-line no-console
    console.log(
      "[phase-d-bench] default DETAILED_LIMIT=200, projectCity+mergePlacements(300 placements, v1):\n" +
        samples
          .map(
            (s) =>
              `  n=${String(s.n).padStart(5)}  iters=${String(s.iterations).padStart(2)}  ` +
              `mean=${s.meanMs.toFixed(3)} ms  max=${s.maxMs.toFixed(3)} ms  min=${s.minMs.toFixed(3)} ms`
          )
          .join("\n")
    );

    // §D9 budget is < 25 ms @5k; tripwire only (expected ~1–3 ms on dev hw).
    const at5k = samples.find((s) => s.n === 5000);
    expect(at5k).toBeDefined();
    expect(at5k!.meanMs).toBeLessThan(150);
  });
});

describe("phase D bench — elevated DETAILED_LIMIT compute curve (informational, §D1 contract question)", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  for (const limit of [500, 1000, 2000, 5000]) {
    it(`measures @5000-card input with CITY_DETAILED_LIMIT=${limit}`, async () => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("CITY_DETAILED_LIMIT", String(limit));

      // Fresh module instance so DETAILED_LIMIT re-evaluates with the override.
      const projectionMod = await import("@/lib/city/projection");
      const fixtureMod = await import("@/lib/city/fixtures");
      const mergeMod = await import("@/lib/city/layout-merge");
      vi.resetModules();
      vi.unstubAllEnvs();

      expect(projectionMod.DETAILED_LIMIT).toBe(limit);

      const { profile, ownedCards, aggregates } = fixtureMod.makeCityFixture(5000, 42);
      const base = projectionMod.projectCity(profile, ownedCards, fixtureMod.FIXTURE_NOW, aggregates);
      const placements = samplePlacements(base, 300);
      const run = () =>
        mergeMod.mergePlacements(
          projectionMod.projectCity(profile, ownedCards, fixtureMod.FIXTURE_NOW, aggregates),
          placements,
          1
        );
      const timing = timeRun(run, limit >= 2000 ? 10 : 20, 150);
      const out = run();
      const totalBuildings = 5000 - 4; // seed 42 always yields 4 goddesses
      expect(out.detailedCount).toBe(Math.min(limit, totalBuildings));

      // eslint-disable-next-line no-console
      console.log(
        `[phase-d-bench] elevated limit=${String(limit).padStart(5)} @5k input: ` +
          `iters=${timing.iterations} mean=${timing.meanMs.toFixed(3)} ms max=${timing.maxMs.toFixed(3)} ms ` +
          `detailedCount=${out.detailedCount}`
      );
    });
  }
});
