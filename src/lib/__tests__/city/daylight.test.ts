import { describe, expect, it } from "vitest";
import {
  FACADE_GLOW_DAY,
  REAL_HOUR_MS,
  daylightAt,
  facadeGlowAt,
  gameClockAt,
  gameHourAt,
  nextDaylightBoundaryAt,
} from "@/lib/city/scene/daylight";

/** A wall-clock timestamp at game hour h (fraction of one real hour). */
function atGameHour(h: number): number {
  return Math.round(REAL_HOUR_MS * (h / 24));
}

describe("daylightAt (1 real hour = 1 game day)", () => {
  it("full night before game 05:00 and after game 19:00", () => {
    expect(daylightAt(atGameHour(0))).toBe(0);
    expect(daylightAt(atGameHour(3))).toBe(0);
    expect(daylightAt(atGameHour(5))).toBe(0);
    expect(daylightAt(atGameHour(19))).toBe(0);
    expect(daylightAt(atGameHour(23))).toBe(0);
  });

  it("full day across game 07:00–17:00 (25 real minutes)", () => {
    expect(daylightAt(atGameHour(7))).toBe(1);
    expect(daylightAt(atGameHour(12))).toBe(1);
    expect(daylightAt(atGameHour(17))).toBe(1);
  });

  it("dawn ramps 05:00→07:00 and dusk ramps 17:00→19:00", () => {
    expect(daylightAt(atGameHour(6))).toBeCloseTo(0.5);
    expect(daylightAt(atGameHour(5.5))).toBeCloseTo(0.25);
    expect(daylightAt(atGameHour(18))).toBeCloseTo(0.5);
    expect(daylightAt(atGameHour(18.5))).toBeCloseTo(0.25);
    // Monotonic through both ramps.
    let prev = daylightAt(atGameHour(5));
    for (let h = 5.1; h <= 7; h += 0.1) {
      const v = daylightAt(atGameHour(h));
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    prev = daylightAt(atGameHour(17));
    for (let h = 17.1; h <= 19; h += 0.1) {
      const v = daylightAt(atGameHour(h));
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it("half-daylight spans exactly game 06:00–18:00 = 30 real minutes", () => {
    // The dawn/dusk ramps are CENTERED on game 06:00/18:00, so daylight ≥ 0.5
    // exactly across the 12-game-hour "day" band = 30 real minutes; the
    // full-night core (19:00–05:00) is the complementary 25 real minutes
    // plus the symmetric ramps.
    expect(daylightAt(atGameHour(6))).toBe(0.5);
    expect(daylightAt(atGameHour(18))).toBe(0.5);
    expect(daylightAt(atGameHour(5.99))).toBeLessThan(0.5);
    expect(daylightAt(atGameHour(18.01))).toBeLessThan(0.5);
    expect((18 - 6) * (REAL_HOUR_MS / 24)).toBe(REAL_HOUR_MS / 2);
  });

  it("gameHourAt maps the real hour fraction onto 24 hours", () => {
    expect(gameHourAt(0)).toBe(0);
    expect(gameHourAt(REAL_HOUR_MS / 2)).toBe(12);
    expect(gameHourAt(REAL_HOUR_MS - 1)).toBeCloseTo(24, 1);
    // Wraps per real hour (every hour starts a new game day at 00:00).
    expect(gameHourAt(REAL_HOUR_MS + REAL_HOUR_MS / 4)).toBe(6);
  });

  it("gameClockAt races 24 game seconds per real second", () => {
    expect(gameClockAt(0)).toEqual({ h: 0, m: 0, s: 0 });
    // Half the real hour = game noon exactly.
    expect(gameClockAt(REAL_HOUR_MS / 2)).toEqual({ h: 12, m: 0, s: 0 });
    // +1 real second = +24 game seconds.
    const a = gameClockAt(1000);
    const b = gameClockAt(2000);
    expect((b.m * 60 + b.s) - (a.m * 60 + a.s)).toBe(24);
    // Wraps per real hour.
    expect(gameClockAt(REAL_HOUR_MS)).toEqual({ h: 0, m: 0, s: 0 });
    // Field decomposition sanity at an exact point: real minute 18.5 =
    // game 07:24:00 exactly (26,640 game seconds into the day).
    const c = gameClockAt((26640 / 86400) * REAL_HOUR_MS);
    expect(c).toEqual({ h: 7, m: 24, s: 0 });
  });

  it("nextDaylightBoundaryAt targets the next ramp start from any phase", () => {
    const H = REAL_HOUR_MS;
    // Deep night (game 2) → this hour's dawn (game 5 = 5/24 of the hour).
    expect(nextDaylightBoundaryAt(Math.round(H * (2 / 24)))).toBe(
      Math.round(H * (5 / 24))
    );
    // Late night (game 21) → NEXT hour's dawn.
    expect(nextDaylightBoundaryAt(Math.round(H * (21 / 24)))).toBe(
      H + Math.round(H * (5 / 24))
    );
    // Steady day (game 12) → this hour's dusk start (game 17).
    expect(nextDaylightBoundaryAt(Math.round(H * (12 / 24)))).toBe(
      Math.round(H * (17 / 24))
    );
    // Inside either ramp → "now" (caller tracks continuously).
    const dawnMid = Math.round(H * (6 / 24));
    expect(nextDaylightBoundaryAt(dawnMid)).toBe(dawnMid);
    const duskMid = Math.round(H * (18 / 24));
    expect(nextDaylightBoundaryAt(duskMid)).toBe(duskMid);
  });
});

describe("facadeGlowAt (lit windows dim toward glass by day)", () => {
  it("night keeps full glow, full day dims to the glass-sheen floor", () => {
    expect(facadeGlowAt(0)).toBe(1);
    expect(facadeGlowAt(1)).toBeCloseTo(FACADE_GLOW_DAY, 10);
  });

  it("is monotone decreasing across the ramp", () => {
    let prev = facadeGlowAt(0);
    for (let v = 0.05; v <= 1.0001; v += 0.05) {
      const next = facadeGlowAt(v);
      expect(next).toBeLessThanOrEqual(prev + 1e-12);
      prev = next;
    }
  });

  it("clamps out-of-range inputs", () => {
    expect(facadeGlowAt(-2)).toBe(1);
    expect(facadeGlowAt(5)).toBeCloseTo(FACADE_GLOW_DAY, 10);
  });
});
