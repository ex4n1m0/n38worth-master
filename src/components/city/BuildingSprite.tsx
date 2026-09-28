/**
 * Static building preview for avatar cards (the "Buildings" browse grid).
 * Renders exactly what the city would mount for this card, split by the
 * 2026-09-29 progression rework:
 *
 *   tiers 1–7  → PROCEDURAL preview (SVG, mirrors the city's vector art:
 *                family mass color + neon accent + iso massing, no Pixi)
 *   tiers 8–14 → the generated spectacular pixel sheet, DAY frame, as a
 *                plain <img> sprite (sheet slot = tier − 7, same remap as
 *                the scene's pixel-art loader)
 *   goddesses  → their LANDMARK monument sheet (stage 2 — stage 1 renders
 *                procedurally in-city, so the sheet's classic stage is the
 *                representative form)
 *
 * Pure display: the tier derives from the SAME `buildingTier` the city
 * projection uses and the variant from the SAME `pixelVariantOf`, so the
 * preview always matches the building that hire would add to the city.
 *
 * Kill switch: NEXT_PUBLIC_CITY_PIXEL_ART=off → nothing renders (callers
 * fall back to their old layout via BUILDING_SPRITE_ENABLED).
 */

import type { ReactElement } from "react";
import {
  CITY_LANDMARK_SHEETS,
  CITY_PIXEL_SHEETS,
  type CityPixelSheet,
} from "@/components/city/world/scene/city-pixel-art.generated";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { buildingTier } from "@/lib/city/projection";
import { pixelVariantOf } from "@/lib/city/scene/pixel-variant";
import {
  FAMILY_MASS_HEX,
  FAMILY_NEON_HEX,
  UNASSIGNED_MASS_HEX,
  UNASSIGNED_NEON_HEX,
} from "@/lib/city/district";
import { cn } from "@/lib/utils";

export const BUILDING_SPRITE_ENABLED =
  process.env.NEXT_PUBLIC_CITY_PIXEL_ART !== "off";

const UNASSIGNED = "Unassigned";
/** Generator sheet layout (scripts/gen-city-pixel-art.ts): pad around and
 * between frames; 3 frame columns = day | night | lights. */
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
    sheet = index >= 0 ? (CITY_LANDMARK_SHEETS[String(index)]?.[1] ?? null) : null;
  } else {
    const tier = buildingTier(playerValue, valueFloor);
    if (tier <= 7) {
      // The procedural league: an SVG echo of the city's vector architecture.
      return (
        <ProceduralBuildingPreview
          tier={tier}
          profession={profession}
          cardId={cardId}
          className={className}
          title={title}
        />
      );
    }
    const family =
      profession && CITY_PIXEL_SHEETS[profession] ? profession : UNASSIGNED;
    sheet = CITY_PIXEL_SHEETS[family]?.[tier - 8] ?? null;
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

// ── procedural (tier 1–7) preview ─────────────────────────────────────────
//
// A compact SVG echo of the Pixi procedural art (art.ts): same family MASS +
// NEON palette (pure district module — no Pixi import), same iso-box
// massing language, tier = stacked floors. It is deliberately a
// simplification, not a mirror: the card needs the family read + tier
// height, not vector parity.

const PV_W = 128;
const PV_PAD_TOP = 34;
const PV_PAD_BOTTOM = 20;

/** Family geometry (mirrors art.ts FamilyArtSpec baseH/floorH ratios). */
const PV_SPEC: Record<string, { baseH: number; floorH: number; hw: number }> = {
  Cryptographer: { baseH: 26, floorH: 9, hw: 46 },
  "Zero-Day": { baseH: 30, floorH: 12, hw: 44 },
  Overclocker: { baseH: 34, floorH: 11, hw: 36 },
  "Cache Keeper": { baseH: 26, floorH: 10, hw: 40 },
  "Server Marshal": { baseH: 36, floorH: 13, hw: 32 },
  "Bot Herder": { baseH: 22, floorH: 10, hw: 46 },
  Unassigned: { baseH: 28, floorH: 12, hw: 34 },
};

function shadeHex(hexColor: string, k: number): string {
  const n = parseInt(hexColor.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((n & 0xff) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** One iso box: three shaded polygons (left/right faces + top diamond). */
function pvBox(
  cx: number,
  baseY: number,
  hw: number,
  h: number,
  mass: string,
  keyPrefix: string
): ReactElement {
  const hh = hw / 2;
  const top = baseY - h;
  return (
    <g key={keyPrefix}>
      <polygon
        points={`${cx - hw},${top} ${cx},${top + hh} ${cx},${baseY + hh} ${cx - hw},${baseY}`}
        fill={shadeHex(mass, 0.62)}
      />
      <polygon
        points={`${cx + hw},${top} ${cx},${top + hh} ${cx},${baseY + hh} ${cx + hw},${baseY}`}
        fill={shadeHex(mass, 0.95)}
      />
      <polygon
        points={`${cx},${top - hh} ${cx + hw},${top} ${cx},${top + hh} ${cx - hw},${top}`}
        fill={shadeHex(mass, 1.2)}
      />
    </g>
  );
}

/** Seeded RNG (art.ts mulberry32): stable lit-window dots per card. */
function pvRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ProceduralBuildingPreview({
  tier,
  profession,
  cardId,
  className,
  title,
}: {
  tier: number;
  profession?: string | null;
  cardId: number;
  className?: string;
  title?: string;
}) {
  const family =
    profession && PV_SPEC[profession] && FAMILY_MASS_HEX[profession]
      ? profession
      : UNASSIGNED;
  const spec = PV_SPEC[family] ?? PV_SPEC[UNASSIGNED];
  const mass =
    (family !== UNASSIGNED && FAMILY_MASS_HEX[family]) || UNASSIGNED_MASS_HEX;
  const neon =
    (family !== UNASSIGNED && FAMILY_NEON_HEX[family]) || UNASSIGNED_NEON_HEX;
  const artH = spec.baseH + (tier - 1) * spec.floorH;
  const H = artH + PV_PAD_TOP + PV_PAD_BOTTOM;
  const cx = PV_W / 2;
  const baseY = H - PV_PAD_BOTTOM;
  const hw = spec.hw;
  const hh = hw / 2;
  const top = baseY - artH;
  const rand = pvRng(cardId);

  // Precomputed stack geometry (Array.from's mapFn has no length param).
  const stackCount = Math.max(2, Math.min(4, Math.ceil(tier / 2) + 1));
  const stackH = artH / stackCount;

  return (
    <div
      aria-hidden="true"
      title={title}
      className={cn(
        "relative overflow-hidden shrink-0 flex items-end justify-center",
        className
      )}
    >
      <svg
        viewBox={`0 0 ${PV_W} ${H}`}
        className="w-full h-auto select-none pointer-events-none"
        role="presentation"
      >
        {/* Platform slab (concrete day read). */}
        <polygon
          points={`${cx},${baseY - hh * 0.8} ${cx + hw * 0.9},${baseY} ${cx},${baseY + hh * 0.8} ${cx - hw * 0.9},${baseY}`}
          fill="#b4b0a6"
          stroke="#84806f"
          strokeWidth="1.5"
        />
        {family === "Zero-Day" ? (
          /* Twin pillars + beam — the hollow gateway silhouette. */
          <>
            {pvBox(cx - hw * 0.5, baseY, hw * 0.34, artH, mass, "zl")}
            {pvBox(cx + hw * 0.5, baseY, hw * 0.34, artH, mass, "zr")}
            {pvBox(cx, top, hw * 0.8, 8, shadeHex(mass, 1.4), "zb")}
            <polygon
              points={`${cx},${top - 20} ${cx + 6},${top - 8} ${cx},${top + 2} ${cx - 6},${top - 8}`}
              fill={neon}
              opacity="0.85"
            />
          </>
        ) : family === "Overclocker" ? (
          /* Reactor cylinder + coil rings. */
          <>
            <rect
              x={cx - hw * 0.42}
              y={top}
              width={hw * 0.84}
              height={artH}
              fill={shadeHex(mass, 0.8)}
            />
            <rect
              x={cx + hw * 0.1}
              y={top}
              width={hw * 0.32}
              height={artH}
              fill={shadeHex(mass, 0.55)}
            />
            <ellipse cx={cx} cy={top} rx={hw * 0.42} ry={hh * 0.42} fill={shadeHex(mass, 1.15)} />
            {Array.from({ length: Math.min(4, 1 + tier) }, (_, i) => (
              <ellipse
                key={`coil${i}`}
                cx={cx}
                cy={top + artH * (0.25 + (i % 3) * 0.22)}
                rx={hw * 0.55}
                ry={hh * 0.5}
                fill="none"
                stroke={neon}
                strokeWidth="1.5"
                opacity="0.8"
              />
            ))}
            <circle cx={cx} cy={top - 8} r="3.5" fill={neon} />
          </>
        ) : family === "Cryptographer" ? (
          /* Wide vault plates + dome. */
          <>
            {Array.from({ length: stackCount }, (_, i) =>
              pvBox(
                cx,
                baseY - i * stackH,
                hw * (1 - i * 0.12),
                stackH,
                mass,
                `cp${i}`
              )
            )}
            <ellipse cx={cx} cy={top - 6} rx={hw * 0.4} ry={hh * 0.6} fill={shadeHex(mass, 1.3)} />
            <ellipse cx={cx} cy={top - 10} rx={hw * 0.26} ry={hh * 0.36} fill={shadeHex(mass, 1.6)} />
            <circle cx={cx} cy={top - 18} r="1.8" fill={neon} />
          </>
        ) : family === "Cache Keeper" ? (
          /* Offset chip stacks. */
          <>
            {Array.from({ length: stackCount }, (_, i) =>
              pvBox(
                cx + (i % 2 === 0 ? 5 : -5),
                baseY - i * stackH,
                hw * (0.72 - i * 0.08),
                stackH,
                i % 2 === 0 ? mass : shadeHex(mass, 1.35),
                `ck${i}`
              )
            )}
            <rect x={cx - 5} y={top - 12} width="10" height="5" fill="none" stroke={neon} strokeWidth="1.5" />
          </>
        ) : family === "Bot Herder" ? (
          /* Hangar + side bays. */
          <>
            {pvBox(cx, baseY, hw * 0.6, artH, mass, "bh")}
            {pvBox(cx - hw * 0.8, baseY + 2, hw * 0.3, artH * 0.7, shadeHex(mass, 0.85), "bhl")}
            {pvBox(cx + hw * 0.8, baseY + 2, hw * 0.3, artH * 0.7, shadeHex(mass, 0.85), "bhr")}
            <ellipse cx={cx} cy={top - 4} rx="11" ry="5.5" fill="none" stroke={neon} strokeWidth="1.5" />
          </>
        ) : family === "Server Marshal" ? (
          /* Uniform rack slab + LED rows. */
          <>
            {pvBox(cx, baseY, hw * 0.62, artH, mass, "sm")}
            {Array.from({ length: Math.min(5, tier + 1) }, (_, i) => (
              <rect
                key={`led${i}`}
                x={cx - hw * 0.44}
                y={top + 6 + i * ((artH - 10) / Math.min(5, tier + 1))}
                width={hw * 0.88}
                height="2"
                fill={neon}
                opacity="0.85"
              />
            ))}
          </>
        ) : (
          /* Unassigned: stepped cube. */
          <>
            {Array.from({ length: Math.max(1, Math.min(4, tier)) }, (_, i) =>
              pvBox(
                cx,
                baseY - (i * artH) / Math.min(4, tier),
                hw * 0.82 * (1 - i * 0.16),
                artH / Math.min(4, tier),
                mass,
                `un${i}`
              )
            )}
          </>
        )}

        {/* Shared tier tells: antenna (3+), pods (4+), halo (5+), crown (6+). */}
        {tier >= 3 && (
          <>
            <line x1={cx - hw * 0.55} y1={top} x2={cx - hw * 0.55} y2={top - 14} stroke={neon} strokeWidth="1.5" />
            <circle cx={cx - hw * 0.55} cy={top - 15} r="1.8" fill={neon} />
          </>
        )}
        {tier >= 4 && (
          <>
            {pvBox(cx - hw * 0.85, baseY - 8, hw * 0.2, 10, shadeHex(mass, 0.95), "pl")}
            {pvBox(cx + hw * 0.85, baseY - 8, hw * 0.2, 10, shadeHex(mass, 0.95), "pr")}
          </>
        )}
        {tier >= 5 && (
          <ellipse
            cx={cx}
            cy={top + artH * 0.35}
            rx={hw * 0.85}
            ry={hh * 0.85}
            fill="none"
            stroke={neon}
            strokeWidth="1.5"
            opacity="0.55"
          />
        )}
        {tier >= 6 && pvBox(cx, top - 5, hw * 0.6, 6, shadeHex(mass, 1.6), "crown")}
        {tier >= 7 && (
          <>
            {pvBox(cx, top - 12, hw * 0.9, 7, shadeHex(mass, 1.35), "cap")}
            <circle cx={cx} cy={top - 23} r="2.6" fill="#ffffff" opacity="0.95" />
            <circle cx={cx} cy={top - 23} r="5" fill="none" stroke={neon} strokeWidth="1.5" opacity="0.8" />
          </>
        )}

        {/* Seeded lit windows (stable per card, warm/cool mix). */}
        {(() => {
          const rows = Math.min(5, Math.max(1, Math.floor((artH - 8) / 14)));
          const dots: Array<{ x: number; y: number; c: string }> = [];
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < 3; col++) {
              if (rand() < 0.6) {
                dots.push({
                  x: cx - hw * 0.45 + col * hw * 0.45,
                  y: baseY - 10 - row * ((artH - 14) / rows),
                  c: rand() < 0.6 ? "#ffb547" : "#cfe0ff",
                });
              }
            }
          }
          return dots.map((d, i) => (
            <rect key={`w${i}`} x={d.x} y={d.y} width="3.5" height="4" fill={d.c} opacity="0.9" />
          ));
        })()}
      </svg>
    </div>
  );
}
