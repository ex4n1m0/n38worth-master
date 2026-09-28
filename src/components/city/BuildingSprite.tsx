/**
 * Static pixel-art building preview for avatar cards (the "Buildings"
 * browse grid): renders the DAY frame of the card's (family × tier ×
 * variant) sheet from the generated city atlas as a plain <img> sprite —
 * exactly the art the city scene mounts, with no Pixi dependency.
 *
 * Pure display: the tier derives from the SAME `buildingTier` the city
 * projection uses and the variant from the SAME `pixelVariantOf`, so the
 * preview always matches the building that hire would add to the city.
 * Goddess cards render their LANDMARK sheet (stage 1) — monuments, never
 * ordinary buildings.
 *
 * Kill switch: NEXT_PUBLIC_CITY_PIXEL_ART=off → nothing renders (callers
 * fall back to their old layout via BUILDING_SPRITE_ENABLED).
 */

import {
  CITY_LANDMARK_SHEETS,
  CITY_PIXEL_SHEETS,
  type CityPixelSheet,
} from "@/components/city/world/scene/city-pixel-art.generated";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { buildingTier } from "@/lib/city/projection";
import { pixelVariantOf } from "@/lib/city/scene/pixel-variant";
import { cn } from "@/lib/utils";

export const BUILDING_SPRITE_ENABLED =
  process.env.NEXT_PUBLIC_CITY_PIXEL_ART !== "off";

const UNASSIGNED = "Unassigned";
/** Generator sheet layout (scripts/gen-city-pixel-art.ts): pad around and
 *  between frames; 3 frame columns = day | night | lights. */
const SHEET_PAD = 2;
const FRAME_COLS = 3;

interface BuildingSpriteProps {
  /** Card id — drives the deterministic variant row. */
  cardId: number;
  /** DB profession name (family); null/unknown → Unassigned. */
  profession?: string | null;
  playerValue: number;
  valueFloor: number;
  /** Raw goddess username — renders the landmark monument instead. */
  goddessUsername?: string;
  /** Width-side layout hook; height follows the frame's aspect ratio. */
  className?: string;
  /** Tooltip (already localized by the caller). */
  title?: string;
}

export function BuildingSprite({
  cardId,
  profession,
  playerValue,
  valueFloor,
  goddessUsername,
  className,
  title,
}: BuildingSpriteProps) {
  if (!BUILDING_SPRITE_ENABLED) return null;

  let sheet: CityPixelSheet | null = null;
  let variant = 0;
  if (goddessUsername) {
    const index = GODDESS_USERNAMES.indexOf(goddessUsername);
    sheet = index >= 0 ? (CITY_LANDMARK_SHEETS[String(index)]?.[0] ?? null) : null;
  } else {
    const family =
      profession && CITY_PIXEL_SHEETS[profession] ? profession : UNASSIGNED;
    const tier = buildingTier(playerValue, valueFloor);
    sheet = CITY_PIXEL_SHEETS[family]?.[tier - 1] ?? null;
    variant = pixelVariantOf(cardId);
  }
  if (!sheet) return null;
  variant %= sheet.variants; // hero/landmark sheets carry a single row

  const { frameW, frameH, variants } = sheet;
  const sheetW = FRAME_COLS * frameW + (FRAME_COLS + 1) * SHEET_PAD;
  const sheetH = variants * frameH + (variants + 1) * SHEET_PAD;

  return (
    <div
      aria-hidden="true"
      title={title}
      className={cn("relative overflow-hidden shrink-0", className)}
      style={{ aspectRatio: `${frameW} / ${frameH}` }}
    >
      {/* The whole sheet is scaled uniformly inside a box whose aspect
          matches ONE frame, then offset so the DAY frame (column 0, row
          `variant`) is the visible part. Percent offsets are frame-relative,
          so the crop holds at any rendered size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sheet.url}
        alt=""
        draggable={false}
        loading="lazy"
        className="absolute max-w-none select-none pointer-events-none"
        style={{
          width: `${(sheetW / frameW) * 100}%`,
          height: `${(sheetH / frameH) * 100}%`,
          left: `${-(SHEET_PAD / frameW) * 100}%`,
          top: `${-((SHEET_PAD + variant * (frameH + SHEET_PAD)) / frameH) * 100}%`,
          imageRendering: "pixelated",
        }}
      />
    </div>
  );
}
