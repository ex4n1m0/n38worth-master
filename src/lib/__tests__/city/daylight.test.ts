import { describe, expect, it } from "vitest";
import {
  REAL_HOUR_MS,
  daylightAt,
  gameHourAt,
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
});
