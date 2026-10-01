/**
 * Player display preferences (2026-10-01 HUD toggles): building art style
 * (kit/procedural) and daylight pin (auto/day/night) — precedence, storage
 * and URL stickiness, mirroring the renderer flag contract.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cityArtStyle,
  cityDaylightMode,
  cityRenderer,
  setCityArtStyle,
  setCityDaylightMode,
} from "@/lib/city/renderer-flag";

function stubWindow(url = "http://localhost:3000/city", store?: Map<string, string>) {
  const s = store ?? new Map<string, string>();
  const win = {
    location: { search: url.split("?")[1] ? `?${url.split("?")[1]}` : "" },
    localStorage: {
      getItem: (k: string) => (s.has(k) ? s.get(k)! : null),
      setItem: (k: string, v: string) => void s.set(k, v),
    },
  };
  vi.stubGlobal("window", win);
  return s;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cityArtStyle — the HUD art toggle preference", () => {
  it("defaults to procedural (classic) while the Kenney kit is tuned", () => {
    stubWindow();
    expect(cityArtStyle()).toBe("procedural");
  });

  it("localStorage persists across reads; setter writes it", () => {
    stubWindow();
    setCityArtStyle("procedural");
    expect(cityArtStyle()).toBe("procedural");
    setCityArtStyle("kit");
    expect(cityArtStyle()).toBe("kit");
  });

  it("?art= URL param wins and is sticky (matches the renderer flag)", () => {
    const store = stubWindow("http://localhost:3000/city?art=procedural");
    expect(cityArtStyle()).toBe("procedural");
    // Sticky: the param is stored, surviving later reads without it.
    stubWindow("http://localhost:3000/city", store);
    expect(cityArtStyle()).toBe("procedural");
  });

  it("is node-safe without window", () => {
    expect(cityArtStyle()).toBe("procedural");
    expect(() => setCityArtStyle("kit")).not.toThrow();
  });
});

describe("cityDaylightMode — the always-day/always-night pin", () => {
  it("defaults to day (pinned daylight while the kit's night look is tuned)", () => {
    stubWindow();
    expect(cityDaylightMode()).toBe("day");
  });

  it("round-trips day and night through storage", () => {
    stubWindow();
    setCityDaylightMode("night");
    expect(cityDaylightMode()).toBe("night");
    setCityDaylightMode("day");
    expect(cityDaylightMode()).toBe("day");
    setCityDaylightMode("auto");
    expect(cityDaylightMode()).toBe("auto");
  });

  it("ignores garbage storage values", () => {
    const store = stubWindow();
    store.set("n38-city-daylight", "sunset");
    expect(cityDaylightMode()).toBe("day");
  });
});

describe("cityRenderer — unchanged by the new preferences", () => {
  it("still defaults to three without a stored choice", () => {
    stubWindow();
    expect(cityRenderer()).toBe("three");
  });
});
