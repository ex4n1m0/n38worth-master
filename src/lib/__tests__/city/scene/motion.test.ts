import { describe, expect, it } from "vitest";
import {
  MOTION_FULL,
  MOTION_REDUCED,
  animationProgress,
  clamp01,
  easeOutCubic,
  resolveMotion,
} from "@/lib/city/scene/motion";

describe("motion policy", () => {
  it("keeps full-motion durations positive", () => {
    expect(MOTION_FULL.reduced).toBe(false);
    expect(MOTION_FULL.cameraSnap).toBe(false);
    for (const ms of [
      MOTION_FULL.constructMs,
      MOTION_FULL.lossMs,
      MOTION_FULL.tierUpMs,
      MOTION_FULL.cameraMs,
      MOTION_FULL.lodFadeMs,
    ]) {
      expect(ms).toBeGreaterThan(0);
    }
  });

  it("collapses EVERYTHING to zero under reduced motion", () => {
    const p = resolveMotion(true);
    expect(p).toEqual(MOTION_REDUCED);
    expect(p.reduced).toBe(true);
    expect(p.cameraSnap).toBe(true);
    expect(p.constructMs).toBe(0);
    expect(p.lossMs).toBe(0);
    expect(p.tierUpMs).toBe(0);
    expect(p.cameraMs).toBe(0);
    expect(p.lodFadeMs).toBe(0);
    expect(resolveMotion(false)).toEqual(MOTION_FULL);
  });

  it("keeps the LOD crossfade in the 150–200ms polish band", () => {
    expect(MOTION_FULL.lodFadeMs).toBeGreaterThanOrEqual(150);
    expect(MOTION_FULL.lodFadeMs).toBeLessThanOrEqual(200);
  });
});

describe("easing helpers", () => {
  it("clamps progress to [0,1] and passes through the ends", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
  });

  it("treats zero-duration animations as instantly finished", () => {
    expect(animationProgress(0, 0)).toBe(1);
    expect(animationProgress(5, 0)).toBe(1);
    expect(animationProgress(50, 100)).toBe(0.5);
    expect(animationProgress(500, 100)).toBe(1);
  });
});
