/**
 * Mainframe City 3D — avatar billboard textures (client-only).
 *
 * Same contract as the 2D scene/avatars.ts: hotlinked avatars load with
 * crossOrigin="anonymous" (canvas-taint → SecurityError postmortem), get
 * downscaled ONCE to 48×48 on an offscreen canvas, and feed a THREE
 * CanvasTexture. Failed loads are terminal (no plate). Cache is per
 * username; reset on scene destroy so a remount never reuses dead GPU
 * textures.
 */

import { CanvasTexture, Texture } from "three";

const SIZE = 48;

const cache = new Map<string, CanvasTexture | null>();
const waiting = new Map<string, Array<() => void>>();

/** Await texture readiness (null = failed); callers re-render on resolve. */
export function onAvatarTextureReady(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const listeners = new Set<() => void>();

export function loadAvatarTexture(username: string): CanvasTexture | null {
  if (cache.has(username)) return cache.get(username) ?? null;
  if (waiting.has(username)) return null; // in flight
  const cbs: Array<() => void> = [];
  waiting.set(username, cbs);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const tex = new CanvasTexture(canvas);
        tex.anisotropy = 1;
        cache.set(username, tex);
      } else {
        cache.set(username, null);
      }
    } catch {
      cache.set(username, null);
    }
    finish(username);
  };
  img.onerror = () => {
    cache.set(username, null);
    finish(username);
  };
  img.src = `/api/avatar/${encodeURIComponent(username)}`;
  return null;
}

function finish(username: string): void {
  const cbs = waiting.get(username) ?? [];
  waiting.delete(username);
  for (const cb of cbs) cb();
  for (const cb of listeners) cb();
}

export function resetAvatarTextures3d(): void {
  for (const tex of cache.values()) tex?.dispose();
  cache.clear();
  listeners.clear();
}

export type { Texture };
