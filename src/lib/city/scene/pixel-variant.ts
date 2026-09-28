/**
 * Mainframe City — deterministic pixel-art variant selection (PURE, no Pixi).
 *
 * The pixel-art sheets carry CITY_PIXEL_VARIANTS building variants per
 * (family × tier); which variant a building wears is derived from its cardId
 * so the same saved city renders identically on every visit/device (upgrade
 * plan §"Building visual variants ... deterministic").
 */

import { CITY_PIXEL_VARIANTS } from "@/components/city/world/scene/city-pixel-art.generated";

/**
 * Stable variant index for a card. mulberry32-flavored mix (same family as
 * the procedural art seeds) — no Math.random, no map-dependence.
 */
export function pixelVariantOf(cardId: number): number {
  let h = (cardId ^ 0x51ed270b) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x5bd1e995) | 0;
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) | 0;
  return ((h ^ (h >>> 16)) >>> 0) % CITY_PIXEL_VARIANTS;
}
