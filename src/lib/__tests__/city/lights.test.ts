import { describe, expect, it } from "vitest";
import {
  beaconStrobeAt,
  edgePulseAt,
  haloBreathAt,
  spireRiseAt,
  windowFlickerAt,
  LIGHT_STEP_MS,
} from "@/lib/city/scene/lights";

describe("beaconStrobeAt (double-strobe warning light)", () => {
  it("stays within [0.12, 1] and hits both extremes", () => {
    let min = 1;
    let max = 0;
    for (let t = 0; t < 20000; t += LIGHT_STEP_MS) {
      for (const seed of [0, 1, 7, 12345, -9]) {
        const v = beaconStrobeAt(t, seed);
        expect(v).toBeGreaterThanOrEqual(0.12);
        expect(v).toBeLessThanOrEqual(1);
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    expect(min).toBe(0.12);
    expect(max).toBe(1);
  });

  it("is periodic per seed (same phase after one cycle)", () => {
    for (const seed of [1, 42, 999]) {
      expect(beaconStrobeAt(1000, seed)).toBe(beaconStrobeAt(1000 + 2600, seed));
    }
  });

  it("has visible on AND off spans at the 250ms sampling cadence", () => {
    // Sample a full cycle for one seed; both states must occupy real time.
    let on = 0;
    let off = 0;
    for (let t = 0; t < 2600; t += LIGHT_STEP_MS) {
      if (beaconStrobeAt(t, 3) > 0.5) on += 1;
      else off += 1;
    }
    expect(on).toBeGreaterThan(2);
    expect(off).toBeGreaterThan(2);
  });

  it("desynchronizes across seeds (no unison flash)", () => {
    const values = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) values.add(beaconStrobeAt(500, seed));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("haloBreathAt (slow architectural breath)", () => {
  it("stays within [0.18, 0.48]", () => {
    for (let t = 0; t < 20000; t += LIGHT_STEP_MS) {
      const v = haloBreathAt(t, 77);
      expect(v).toBeGreaterThanOrEqual(0.18);
      expect(v).toBeLessThanOrEqual(0.48);
    }
  });

  it("breathes (reaches both a dim and a bright phase within one cycle)", () => {
    let min = 1;
    let max = 0;
    for (let t = 0; t < 5200; t += LIGHT_STEP_MS) {
      const v = haloBreathAt(t, 77);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(max - min).toBeGreaterThan(0.2);
  });
});

describe("spireRiseAt (grand-league energy ascent)", () => {
  it("progress sweeps the full 0..1 range and fades at both ends", () => {
    let maxProgress = 0;
    let sawSoft = false;
    let sawBright = false;
    for (let t = 0; t < 1900; t += LIGHT_STEP_MS) {
      const { progress, alpha } = spireRiseAt(t, 5);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
      maxProgress = Math.max(maxProgress, progress);
      if (alpha < 0.5) sawSoft = true;
      else sawBright = true;
    }
    expect(maxProgress).toBeGreaterThan(0.85);
    expect(sawSoft).toBe(true);
    expect(sawBright).toBe(true);
  });
});

describe("windowFlickerAt (occupancy churn, two channels)", () => {
  it("stays within [1 - max depth, 1] and reaches a real dip", () => {
    for (const seed of [0, 3, 44, 12345, -9]) {
      let min = 1;
      for (const channel of [0, 1] as const) {
        for (let t = 0; t < 60000; t += LIGHT_STEP_MS) {
          const v = windowFlickerAt(t, seed, channel);
          expect(v).toBeLessThanOrEqual(1);
          expect(v).toBeGreaterThanOrEqual(0.4);
          min = Math.min(min, v);
        }
      }
      // The dip depth is seeded (0.30..0.55) — every building dips visibly.
      expect(min).toBeLessThanOrEqual(0.72);
    }
  });

  it("is periodic per (seed, channel)", () => {
    const cycle = 23000;
    expect(windowFlickerAt(1000, 5, 1)).toBe(windowFlickerAt(1000 + cycle, 5, 1));
  });

  it("desynchronizes across seeds and channels (no unison dimming)", () => {
    const at = (seed: number, channel: 0 | 1) => windowFlickerAt(8000, seed, channel);
    const values = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      values.add(at(seed, 0));
      values.add(at(seed, 1));
    }
    expect(values.size).toBeGreaterThan(2);
  });
});

describe("edgePulseAt (civic edge data-pulse)", () => {
  it("progress sweeps 0..1 and fades at both ends", () => {
    let maxProgress = 0;
    let sawSoft = false;
    let sawBright = false;
    for (let t = 0; t < 3400; t += LIGHT_STEP_MS) {
      const { progress, alpha } = edgePulseAt(t, 11);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
      maxProgress = Math.max(maxProgress, progress);
      if (alpha < 0.5) sawSoft = true;
      else sawBright = true;
    }
    expect(maxProgress).toBeGreaterThan(0.85);
    expect(sawSoft).toBe(true);
    expect(sawBright).toBe(true);
  });
});
