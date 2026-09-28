/**
 * Mainframe City — building avatar billboards (client-only Pixi).
 *
 * Lazy, deduped avatar-texture source for the four small facade plates each
 * building wears at CLOSE zoom (2026-09-28). Loads go through the same
 * CDN-cached public /api/avatar/[username] route the DOM panels use; each
 * avatar is downscaled to a tiny canvas texture ONCE per username (a 256px
 * source per building would dwarf the ~16px plate it feeds), and a failed
 * load (fixture NPCs, retired rows) is final — that building simply renders
 * no billboards.
 *
 * GPU LIFETIME: the scene's app.destroy({texture:true}) frees textures that
 * mounted on sprites; resetAvatarTextures() (called on scene destroy) frees
 * the rest and empties the cache so a REMOUNTED scene never reuses destroyed
 * textures — every CityScene lifetime starts with a cold cache.
 */

import { Texture } from "pixi.js";

/** Downscaled texture edge (px) — 48 is plenty for a ≤20px plate. */
const AVATAR_TEX_SIZE = 48;

const cache = new Map<string, Texture | null>();
const pending = new Map<string, Promise<Texture | null>>();
const readyListeners = new Set<() => void>();

/**
 * Scene hook: fires whenever a NEW texture finishes loading — the scene
 * re-renders so freshly arrived billboards appear without a camera nudge.
 */
export function onAvatarTextureReady(fn: () => void): () => void {
  readyListeners.add(fn);
  return () => {
    readyListeners.delete(fn);
  };
}

/** Sync cache lookup: undefined = not loaded yet, null = failed (skip). */
export function avatarTexture(username: string): Texture | null | undefined {
  return cache.get(username);
}

/** Deduped lazy load — the same username never loads twice per scene. */
export function loadAvatarTexture(username: string): Promise<Texture | null> {
  const hit = cache.get(username);
  if (hit !== undefined) return Promise.resolve(hit);
  const inflight = pending.get(username);
  if (inflight) return inflight;

  const load = new Promise<Texture | null>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    // The avatar route 301-redirects hotlinked rows to remote CDNs
    // (Unsplash/picsum). WITHOUT CORS mode the redirect taints every canvas
    // downstream, and the taint only detonates at RENDER time as an
    // uncaught texImage2D SecurityError that kills the whole render loop
    // (2026-09-28: "zoom in made the city disappear"). Both CDNs send
    // Access-Control-Allow-Origin: *, so anonymous mode succeeds; a host
    // without it simply fails the load → null → no plate (graceful).
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = AVATAR_TEX_SIZE;
        c.height = AVATAR_TEX_SIZE;
        const ctx = c.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, AVATAR_TEX_SIZE, AVATAR_TEX_SIZE);
        resolve(Texture.from(c));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `/api/avatar/${encodeURIComponent(username)}`;
  });

  const p = load.then((tex) => {
    cache.set(username, tex);
    pending.delete(username);
    if (tex) for (const fn of readyListeners) fn();
    return tex;
  });
  pending.set(username, p);
  return p;
}

/** Drop every cached texture (scene teardown — see header). */
export function resetAvatarTextures(): void {
  for (const tex of cache.values()) {
    if (tex && !tex.destroyed) tex.destroy(true);
  }
  cache.clear();
  pending.clear();
}
