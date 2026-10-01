/**
 * Mainframe City — renderer selection flag (client-safe).
 *
 * Chooses between the three.js 3D renderer (DEFAULT since 2026-09-30) and
 * the PixiJS 2D renderer. Precedence:
 *   ?renderer=three|pixi (sticky — stored)  >  localStorage  >  build env.
 *
 * The selected renderer loads as its own lazy chunk: CitySceneMount
 * dynamic-imports exactly ONE of scene3d/ThreeScene (three) or
 * scene/CityScene (pixi) — the other never reaches the client. If the
 * three scene fails at init (no WebGL2 etc.), the mount retries ONCE with
 * pixi before falling back to the DOM DistrictOverview — the default
 * renderer never dead-ends a player.
 */

export type CityRenderer = "pixi" | "three";

const STORAGE_KEY = "n38-city-renderer";

export function cityRenderer(): CityRenderer {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_CITY_RENDERER === "pixi" ? "pixi" : "three";
  }
  try {
    const q = new URLSearchParams(window.location.search).get("renderer");
    if (q === "three" || q === "pixi") {
      window.localStorage.setItem(STORAGE_KEY, q);
      return q;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "three" || stored === "pixi") return stored;
  } catch {
    /* private mode etc. — fall through to the build default */
  }
  return process.env.NEXT_PUBLIC_CITY_RENDERER === "pixi" ? "pixi" : "three";
}


// ── art style (2026-10-01 user ruling: a HUD toggle between them) ───────────
//
// The 3D scene starts on its PROCEDURAL buildings and swaps to the Kenney
// kit models once the GLBs land — players saw "one city, then another".
// The HUD toggle pins the style: "kit" (modern Kenney models, default) or
// "procedural" (the classic vector architecture — no swap flash). Same
// precedence as the renderer flag: ?art= URL param (sticky) > localStorage.

export type CityArtStyle = "kit" | "procedural";

const ART_STORAGE_KEY = "n38-city-art";

export function cityArtStyle(): CityArtStyle {
  if (typeof window === "undefined") return "kit";
  try {
    const q = new URLSearchParams(window.location.search).get("art");
    if (q === "kit" || q === "procedural") {
      window.localStorage.setItem(ART_STORAGE_KEY, q);
      return q;
    }
    const stored = window.localStorage.getItem(ART_STORAGE_KEY);
    if (stored === "kit" || stored === "procedural") return stored;
  } catch {
    /* private mode — default below */
  }
  return "kit";
}

/** Persist the choice; the scene reads it on (re)mount — CityWorld remounts. */
export function setCityArtStyle(style: CityArtStyle): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ART_STORAGE_KEY, style);
  } catch {
    /* private mode — the in-memory scene choice still applies this session */
  }
}

// ── daylight preference (2026-10-01: always-day / always-night toggle) ──────

export type CityDaylightMode = "auto" | "day" | "night";

const DAYLIGHT_STORAGE_KEY = "n38-city-daylight";

export function cityDaylightMode(): CityDaylightMode {
  if (typeof window === "undefined") return "auto";
  try {
    const stored = window.localStorage.getItem(DAYLIGHT_STORAGE_KEY);
    if (stored === "auto" || stored === "day" || stored === "night") return stored;
  } catch {
    /* private mode — default below */
  }
  return "auto";
}

export function setCityDaylightMode(mode: CityDaylightMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DAYLIGHT_STORAGE_KEY, mode);
  } catch {
    /* private mode — the live override still applies this session */
  }
}
