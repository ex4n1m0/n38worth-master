/**
 * Mainframe City — renderer selection flag (client-safe).
 *
 * Chooses between the PixiJS 2D renderer (default) and the three.js 3D
 * renderer (CITY_3D_ENGINE_STUDY.md §8 flag plan). Precedence:
 *   ?renderer=three|pixi (sticky — stored)  >  localStorage  >  build env.
 *
 * The selected renderer loads as its own lazy chunk: CitySceneMount
 * dynamic-imports exactly ONE of scene/CityScene (pixi) or
 * scene3d/ThreeScene (three) — the other never reaches the client.
 */

export type CityRenderer = "pixi" | "three";

const STORAGE_KEY = "n38-city-renderer";

export function cityRenderer(): CityRenderer {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_CITY_RENDERER === "three" ? "three" : "pixi";
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
  return process.env.NEXT_PUBLIC_CITY_RENDERER === "three" ? "three" : "pixi";
}
