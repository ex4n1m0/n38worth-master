/**
 * Mainframe City — pixel-art sheet loader (client-only Pixi).
 *
 * Loads the generated building sheets (public/city/pixel, manifest in
 * city-pixel-art.generated.ts) and splits each into per-variant day / night
 * / lights frame textures. Mirrors the avatars.ts pattern: synchronous cache
 * lookup + async load + ready-listeners so the scene can re-render when
 * textures pop in.
 *
 * Day/night contract (engine upgrade 2026-09-28): the DAY frame is authored
 * pre-compensated for the scene's day matrix lift; NIGHT is the native mass;
 * LIGHTS is emissive-only (transparent elsewhere) and renders additively at
 * night — alpha driven by facadeGlowAt(daylight).
 *
 * Kill switch: NEXT_PUBLIC_CITY_PIXEL_ART=off disables everything (frames
 * resolve null; the scene keeps today's procedural look + strong day lift).
 *
 * PROGRESSION SPLIT (2026-09-29): the sheets render GAME tiers 8–14 only
 * (sheet slot = game tier − 7) — tiers 1–7 are the procedural architecture,
 * and hero VALUE stage 1 renders procedurally on both the HQ and monuments.
 */
import { Assets, Rectangle, Texture } from "pixi.js";
import {
  CITY_HQ_SHEETS,
  CITY_LANDMARK_SHEETS,
  CITY_PIXEL_SHEETS,
  type CityPixelSheet,
} from "./city-pixel-art.generated";
import { pixelVariantOf } from "@/lib/city/scene/pixel-variant";

const ENABLED = process.env.NEXT_PUBLIC_CITY_PIXEL_ART !== "off";

const UNASSIGNED = "Unassigned";

/** One variant's split frames + placement metadata. */
export interface PixelArtFrames {
  day: Texture;
  night: Texture;
  lights: Texture;
  frameW: number;
  frameH: number;
  anchorX: number;
  anchorY: number;
  artHeight: number;
}

type SheetEntry =
  | { state: "loading" }
  | { state: "ready"; variants: PixelArtFrames[] }
  | { state: "failed" };

const sheets = new Map<string, SheetEntry>();
const listeners = new Set<() => void>();

function sheetKey(family: string, tier: number): string {
  return `${family}|${tier}`;
}

function metaFor(family: string, tier: number): CityPixelSheet | null {
  const tiers = CITY_PIXEL_SHEETS[family] ?? CITY_PIXEL_SHEETS[UNASSIGNED];
  const meta = tier >= 1 && tier <= 7 ? (tiers?.[tier - 1] ?? null) : null;
  return meta;
}

function familyOf(profession: string | null): string {
  if (profession && CITY_PIXEL_SHEETS[profession]) return profession;
  return UNASSIGNED;
}

/** Start (or join) loading a family×tier sheet. No-op when already known. */
function ensureSheet(family: string, tier: number): void {
  const key = sheetKey(family, tier);
  if (sheets.has(key)) return;
  const meta = metaFor(family, tier);
  if (!meta) {
    sheets.set(key, { state: "failed" });
    return;
  }
  sheets.set(key, { state: "loading" });
  void loadSheet(key, meta);
}

/**
 * Load + split ANY sheet (families have 3 variant rows; hero sheets have 1).
 * Resolves the entry and pokes the ready-listeners.
 */
function loadSheet(key: string, meta: CityPixelSheet): Promise<void> {
  return Assets.load<Texture>(meta.url)
    .then((base) => {
      // Pixel art must stay crisp at every zoom — nearest-neighbor forever.
      base.source.scaleMode = "nearest";
      const pad = 2; // SHEET_PAD in the generator layout
      const stepW = meta.frameW + pad;
      const stepH = meta.frameH + pad;
      const variants: PixelArtFrames[] = [];
      for (let v = 0; v < meta.variants; v++) {
        const col = (frame: 0 | 1 | 2) =>
          new Texture({
            source: base.source,
            frame: new Rectangle(
              pad + frame * stepW,
              pad + v * stepH,
              meta.frameW,
              meta.frameH
            ),
          });
        variants.push({
          day: col(0),
          night: col(1),
          lights: col(2),
          frameW: meta.frameW,
          frameH: meta.frameH,
          anchorX: meta.anchorX,
          anchorY: meta.anchorY,
          artHeight: meta.artHeight,
        });
      }
      sheets.set(key, { state: "ready", variants });
      for (const fn of listeners) fn();
    })
    .catch(() => {
      sheets.set(key, { state: "failed" });
    });
}

/**
 * Frames for a building, or undefined while the sheet loads (caller keeps
 * the procedural fallback), or null when pixel art is disabled/failed — OR
 * when the tier renders procedurally by design (2026-09-29 progression
 * rework): tiers 1–7 ARE the procedural vector architecture; the generated
 * sheets carry tiers 8–14 (sheet slot = tier − 7).
 */
export function pixelFramesFor(
  profession: string | null,
  tier: number,
  cardId: number
): PixelArtFrames | null | undefined {
  if (!ENABLED) return null;
  if (tier < 8) return null; // tiers 1–7: procedural is the REAL art
  const family = familyOf(profession);
  const sheetTier = tier - 7; // game tier 8..14 → sheet slot 1..7
  const key = sheetKey(family, sheetTier);
  const entry = sheets.get(key);
  if (!entry) {
    ensureSheet(family, sheetTier);
    return undefined;
  }
  if (entry.state === "loading") return undefined;
  if (entry.state === "failed") return null;
  return entry.variants[pixelVariantOf(cardId)] ?? entry.variants[0];
}

/**
 * Shared lookup for HERO sheets (HQ + the Six monuments): one variant row,
 * keyed "HQ|sN" / "LM|i|sN". Same undefined/null contract as above.
 */
function heroFrames(key: string, meta: CityPixelSheet | null | undefined): PixelArtFrames | null | undefined {
  if (!ENABLED) return null;
  if (!meta) return null;
  const entry = sheets.get(key);
  if (!entry) {
    sheets.set(key, { state: "loading" });
    void loadSheet(key, meta);
    return undefined;
  }
  if (entry.state === "loading") return undefined;
  if (entry.state === "failed") return null;
  return entry.variants[0];
}

/** HQ core frames for a value stage (1..3). Stage 1 renders PROCEDURALLY
 *  (progression rework 2026-09-29): the generated hero sheets carry the
 *  climbing (2) and near-max (3) forms only. */
export function hqFramesFor(stage: number): PixelArtFrames | null | undefined {
  const s = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
  if (s === 1) return null;
  return heroFrames(`HQ|s${s}`, CITY_HQ_SHEETS[s - 1]);
}

/** Monument frames for goddess roster index 0..5 + value stage (1..3).
 *  Stage 1 renders procedurally (same rule as the HQ). */
export function landmarkFramesFor(
  index: number,
  stage: number
): PixelArtFrames | null | undefined {
  const i = ((index % 6) + 6) % 6;
  const s = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
  if (s === 1) return null;
  return heroFrames(`LM|${i}|s${s}`, CITY_LANDMARK_SHEETS[String(i)]?.[s - 1]);
}

/** Whether at least one sheet loaded (the scene's pixel-mode signal). */
export function pixelArtActive(): boolean {
  for (const entry of sheets.values()) {
    if (entry.state === "ready") return true;
  }
  return false;
}

/**
 * Ready-listener (avatars.ts pattern): fires whenever a sheet finishes
 * loading. The scene re-applies daylight + re-syncs sprites and renders.
 */
export function onPixelArtReady(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Test hook — drop all cached sheets/listeners (never used at runtime). */
export function resetPixelArtCache(): void {
  sheets.clear();
  listeners.clear();
}
