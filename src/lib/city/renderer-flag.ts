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
