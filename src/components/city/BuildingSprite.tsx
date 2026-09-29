/**
 * Static building preview for avatar cards (the "Buildings" browse grid).
 * Renders an SVG echo of exactly what the city would mount for this card —
 * the ONE procedural art system (2026-09-29 pixel-sheet retirement):
 *
 *   tiers 1–7  → CIVIC preview (family stack + shared tier features)
 *   tiers 8–14 → GRAND preview (the family megaform: taller massing, glow
 *                band, halo rings, crown/spire — one more detail per tier)
 *   goddesses  → their LANDMARK monument echo (stage-2 elaborated form)
 *
 * Pure display: the tier derives from the SAME `buildingTier` the city
 * projection uses, so the preview always matches the building that hire
 * would add to the city. It is deliberately a simplification, not a mirror:
 * the card needs the family read + league + tier height, not vector parity.
 */

import type { ReactElement } from "react";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { buildingTier } from "@/lib/city/projection";
import { LANDMARK_HEX_COLORS } from "@/lib/city/landmark-colors";
import {
  FAMILY_MASS_HEX,
  FAMILY_NEON_HEX,
  UNASSIGNED_MASS_HEX,
  UNASSIGNED_NEON_HEX,
} from "@/lib/city/district";
import { cn } from "@/lib/utils";

const UNASSIGNED = "Unassigned";
/** First tier of the grand league (mirrors art.ts GRAND_MIN_TIER). */
const GRAND_MIN_TIER = 8;

interface BuildingSpriteProps {
  /** Card id — drives the deterministic detail seed. */
  cardId: number;
  /** DB profession name (family); null/unknown → Unassigned. */
  profession?: string | null;
  playerValue: number;
  valueFloor: number;
  /** Raw goddess username — renders the landmark monument instead. */
  goddessUsername?: string;
  /** Width-side layout hook; height follows the art's aspect ratio. */
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
  if (goddessUsername) {
    const index = GODDESS_USERNAMES.indexOf(goddessUsername);
    if (index >= 0) {
      return (
        <MonumentPreview
          index={index}
          className={className}
          title={title}
        />
      );
    }
  }
  const tier = buildingTier(playerValue, valueFloor);
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

// ── procedural preview (all 14 tiers) ─────────────────────────────────────
//
// A compact SVG echo of the Pixi procedural art (art.ts): same family MASS +
// NEON palette (pure district module — no Pixi import), same iso-box
// massing language, same two leagues (civic stack / grand megaform).

const PV_W = 128;
const PV_PAD_TOP = 34;
const PV_PAD_BOTTOM = 20;

/** Family geometry (mirrors art.ts FamilyArtSpec height ratios). */
const PV_SPEC: Record<
  string,
  { baseH: number; floorH: number; hw: number; grandBaseH: number; grandFloorH: number }
> = {
  Cryptographer: { baseH: 26, floorH: 9, hw: 46, grandBaseH: 96, grandFloorH: 12 },
  "Zero-Day": { baseH: 30, floorH: 12, hw: 44, grandBaseH: 116, grandFloorH: 14 },
  Overclocker: { baseH: 34, floorH: 11, hw: 36, grandBaseH: 118, grandFloorH: 12 },
  "Cache Keeper": { baseH: 26, floorH: 10, hw: 40, grandBaseH: 106, grandFloorH: 12 },
  "Server Marshal": { baseH: 36, floorH: 13, hw: 32, grandBaseH: 130, grandFloorH: 12 },
  "Bot Herder": { baseH: 22, floorH: 10, hw: 46, grandBaseH: 100, grandFloorH: 11 },
  Unassigned: { baseH: 28, floorH: 12, hw: 34, grandBaseH: 112, grandFloorH: 10 },
};

function shadeHex(hexColor: string, k: number): string {
  const n = parseInt(hexColor.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((n & 0xff) * k));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(
      ((na >> shift) & 0xff) * (1 - t) + ((nb >> shift) & 0xff) * t
    );
  const r = ch(16);
  const g = ch(8);
  const bl = ch(0);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
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

/** Seeded lit-window dots across a body (both faces, warm/cool mix). */
function pvWindows(
  rand: () => number,
  cx: number,
  baseY: number,
  hw: number,
  artH: number,
  rows: number
): ReactElement[] {
  const dots: Array<{ x: number; y: number; c: string }> = [];
  const cols = 3;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols * 2; col++) {
      if (rand() < 0.6) {
        const side = col < cols ? -1 : 1;
        const c = col % cols;
        dots.push({
          x: cx + side * (hw * 0.14 + c * hw * 0.28),
          y: baseY - 10 - row * ((artH - 14) / rows),
          c: rand() < 0.6 ? "#ffb547" : "#cfe0ff",
        });
      }
    }
  }
  return dots.map((d, i) => (
    <rect key={`w${i}`} x={d.x} y={d.y} width="3.5" height="4" fill={d.c} opacity="0.9" />
  ));
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
  const grand = tier >= GRAND_MIN_TIER;
  const artH = grand
    ? spec.grandBaseH + (tier - GRAND_MIN_TIER) * spec.grandFloorH
    : spec.baseH + (tier - 1) * spec.floorH;
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
        {grand ? (
          <GrandBody
            family={family}
            step={tier - GRAND_MIN_TIER}
            mass={mass}
            neon={neon}
            cx={cx}
            baseY={baseY}
            hw={hw}
            artH={artH}
            rand={rand}
          />
        ) : family === "Zero-Day" ? (
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

        {!grand && (
          /* Shared civic tier tells: antenna (3+), pods (4+), halo (5+),
             crown (6+), mega cap (7). */
          <>
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
          </>
        )}

        {/* Seeded lit windows (stable per card, warm/cool mix). */}
        {(() => {
          const rows = grand
            ? 6
            : Math.min(5, Math.max(1, Math.floor((artH - 8) / 14)));
          return pvWindows(rand, cx, baseY, hw * 0.6, artH, rows);
        })()}
      </svg>
    </div>
  );
}

// ── grand league echo (tiers 8–14) ────────────────────────────────────────
//
// Simplified SVG echoes of the Pixi grand megaforms (art.ts drawGrand):
// chroma glass mass + glow band + halo ring + family crown. step = tier − 8.

function GrandBody({
  family,
  step,
  mass,
  neon,
  cx,
  baseY,
  hw,
  artH,
  rand,
}: {
  family: string;
  step: number;
  mass: string;
  neon: string;
  cx: number;
  baseY: number;
  hw: number;
  artH: number;
  rand: () => number;
}): ReactElement {
  const hh = hw / 2;
  const top = baseY - artH;
  const glass = mixHex(mass, neon, 0.35);
  void rand; // window dots come from the caller's shared pass

  const glowBand = (y: number, w: number, key: string) => (
    <g key={key}>
      <rect x={cx - w} y={y} width={w * 2} height="3.5" fill={neon} opacity="0.9" />
      <rect x={cx - w * 0.6} y={y + 0.75} width={w * 1.2} height="2" fill="#ffffff" opacity="0.75" />
    </g>
  );
  const halo = (y: number, rx: number, key: string, opacity = 0.6) => (
    <ellipse
      key={key}
      cx={cx}
      cy={y}
      rx={rx}
      ry={rx * 0.34}
      fill="none"
      stroke={neon}
      strokeWidth="1.5"
      opacity={opacity}
    />
  );

  if (family === "Zero-Day") {
    // MEGA GATE — twin pillars, beam shelves, shard, crown bridge.
    const px = hw * 0.56;
    const pw = hw * 0.4;
    return (
      <>
        {pvBox(cx - px, baseY, pw, artH - 26, glass, "gl")}
        {pvBox(cx + px, baseY, pw, artH - 26, glass, "gr")}
        {Array.from({ length: 2 + Math.floor(step / 2) }, (_, i) => {
          const by = baseY - ((artH - 26) * (i + 1)) / (3 + Math.floor(step / 2));
          return (
            <g key={`gb${i}`}>
              {pvBox(cx, by, hw * 0.86, 5, shadeHex(mass, 1.4), `gbb${i}`)}
              {glowBand(by - 5, hw * 0.5, `gbg${i}`)}
            </g>
          );
        })}
        <polygon
          points={`${cx},${baseY - 14} ${cx + 11},${baseY - artH * 0.55} ${cx},${top - 12} ${cx - 11},${baseY - artH * 0.55}`}
          fill={neon}
          opacity="0.85"
        />
        {pvBox(cx, top - 10, hw * 0.92, 9, shadeHex(mass, 1.5), "gc")}
        <circle cx={cx - px} cy={top - 23} r="2.6" fill={neon} />
        <circle cx={cx + px} cy={top - 23} r="2.6" fill={neon} />
        {step >= 4 && (
          <>
            <line x1={cx - px} y1={top - 10} x2={cx - px} y2={top - 24} stroke={neon} strokeWidth="1.5" />
            <line x1={cx + px} y1={top - 10} x2={cx + px} y2={top - 24} stroke={neon} strokeWidth="1.5" />
          </>
        )}
        {step >= 6 && <ellipse cx={cx} cy={baseY - artH * 0.55} rx="4" ry={artH * 0.3} fill="none" stroke={neon} strokeWidth="2" opacity="0.9" />}
      </>
    );
  }

  if (family === "Overclocker") {
    // GRAND REACTOR — wide core, coil ladder, plasma crown.
    const r = hw * 0.5;
    return (
      <>
        {pvBox(cx, baseY, hw * 0.85, 10, shadeHex(mass, 0.9), "rpl")}
        <rect x={cx - r} y={baseY - artH + 24} width={r * 2} height={artH - 34} fill={shadeHex(glass, 0.9)} />
        <rect x={cx + r * 0.25} y={baseY - artH + 24} width={r * 0.75} height={artH - 34} fill={shadeHex(mass, 0.6)} />
        <ellipse cx={cx} cy={baseY - artH + 24} rx={r} ry={r * 0.42} fill={shadeHex(glass, 1.2)} />
        {Array.from({ length: 3 + Math.floor(step * 0.8) }, (_, i) => (
          <ellipse
            key={`rc${i}`}
            cx={cx}
            cy={baseY - 12 - ((artH - 36) * i) / (3 + Math.floor(step * 0.8))}
            rx={r + hw * 0.1}
            ry={r * 0.42 + 2}
            fill="none"
            stroke={neon}
            strokeWidth="1.8"
            opacity="0.8"
          />
        ))}
        {glowBand(baseY - artH * 0.55, r * 0.9, "rgb")}
        {step >= 1 &&
          [-hw * 0.82, hw * 0.82].map((dx, i) => (
            <g key={`rs${i}`}>
              <rect x={dx - hw * 0.14} y={baseY - artH * 0.55} width={hw * 0.28} height={artH * 0.55} fill={shadeHex(mass, 1.1)} />
              <circle cx={dx} cy={baseY - artH * 0.55 - 4} r="2" fill={neon} />
            </g>
          ))}
        <circle cx={cx} cy={top - 10} r="5" fill={neon} />
        <circle cx={cx} cy={top - 10} r="9" fill="none" stroke={neon} strokeWidth="1.5" opacity="0.8" />
        {step >= 2 && halo(top - 10, 16, "rh")}
        {step >= 6 && <line x1={cx} y1={top - 16} x2={cx} y2={top - 30} stroke={neon} strokeWidth="2.5" />}
      </>
    );
  }

  if (family === "Cryptographer") {
    // VAULT CITADEL — podium plates, glass drum, shield dome.
    const domeH = 26 + step * 2;
    return (
      <>
        {pvBox(cx, baseY, hw * 0.98, 14, shadeHex(mass, 0.9), "vp1")}
        {pvBox(cx, baseY - 14, hw * 0.84, 11, shadeHex(mass, 1.08), "vp2")}
        {pvBox(cx, baseY - 25, hw * 0.66, artH - 25 - domeH - 16, glass, "vd")}
        {glowBand(baseY - artH + domeH + 8, hw * 0.5, "vg")}
        {step >= 2 &&
          [-hw * 0.8, hw * 0.8].map((dx, i) => (
            <g key={`va${i}`}>
              {pvBox(dx, baseY - 12, hw * 0.2, 14, shadeHex(mass, 1), `vab${i}`)}
              <ellipse cx={dx} cy={baseY - 30} rx={hw * 0.16} ry={hh * 0.3} fill={shadeHex(mass, 1.35)} />
            </g>
          ))}
        <ellipse cx={cx} cy={top - domeH * 0.45} rx={hw * 0.58} ry={domeH * 0.62} fill={shadeHex(mass, 1.15)} />
        <ellipse cx={cx} cy={top - domeH * 0.58} rx={hw * 0.4} ry={domeH * 0.42} fill={shadeHex(mass, 1.45)} />
        {step >= 4 && <ellipse cx={cx} cy={top - domeH * 0.5} rx={hw * 0.44} ry={domeH * 0.5} fill="none" stroke={neon} strokeWidth="1.5" opacity="0.8" />}
        {step >= 5 && halo(top + 4, hw * 0.5, "vh")}
        {step >= 6 ? (
          <>
            <rect x={cx - 3} y={top - 16} width="6" height="11" fill={shadeHex(mass, 1.5)} />
            <circle cx={cx} cy={top - 4} r="2.6" fill={neon} />
            <circle cx={cx} cy={top - 17} r="2.2" fill="#ffffff" opacity="0.95" />
          </>
        ) : (
          <circle cx={cx} cy={top - 4} r="2.2" fill={neon} />
        )}
      </>
    );
  }

  if (family === "Cache Keeper") {
    // GRAND DATA ZIGGURAT — offset chip stack + floating cache crown.
    const slabs = 4 + Math.floor(step / 2);
    const slabH = (artH - 24) / slabs;
    return (
      <>
        {Array.from({ length: slabs }, (_, i) => {
          const dx = i % 2 === 0 ? 7 : -7;
          const w = hw * (0.8 - i * 0.09);
          return (
            <g key={`ks${i}`}>
              {pvBox(cx + dx, baseY - i * slabH, w, slabH, i % 2 === 0 ? glass : shadeHex(mass, 1.35), `ksb${i}`)}
              <rect x={cx + dx - w * 0.75} y={baseY - i * slabH - slabH * 0.72} width={w * 1.5} height="2" fill={neon} opacity="0.85" />
            </g>
          );
        })}
        {[-hw * 0.88, hw * 0.88].map((dx, i) => (
          <g key={`kd${i}`}>
            {Array.from({ length: 6 + step }, (_, s) => (
              <circle
                key={`kdd${s}`}
                cx={dx}
                cy={baseY - 4 - (s * (artH - 30)) / (6 + step)}
                r="1.3"
                fill={neon}
                opacity="0.85"
              />
            ))}
          </g>
        ))}
        {Array.from({ length: 1 + Math.floor(step / 3) }, (_, i) => (
          <rect
            key={`kc${i}`}
            x={cx - 6 + (i % 2 ? 2 : -2)}
            y={baseY - artH + 24 - 8 - i * 8}
            width="12"
            height="5"
            fill="none"
            stroke={neon}
            strokeWidth="1.5"
            opacity="0.95"
          />
        ))}
        {step >= 6 && (
          <>
            {halo(baseY - artH + 18, hw * 0.55, "kh", 0.85)}
            <circle cx={cx} cy={top - 8} r="2.4" fill="#ffffff" opacity="0.95" />
          </>
        )}
      </>
    );
  }

  if (family === "Server Marshal") {
    // RACK SPIRE — podium, dense-LED shaft, setback crown, mast array.
    const lowerH = artH * 0.62 - 18;
    const upperW = hw * (step >= 2 ? 0.5 : 0.66);
    const shoulderY = baseY - 18 - lowerH;
    return (
      <>
        {pvBox(cx, baseY, hw * 0.92, 16, shadeHex(mass, 0.9), "sp")}
        {pvBox(cx, baseY - 18, hw * 0.66, lowerH, glass, "ss")}
        {Array.from({ length: 6 + step }, (_, i) => (
          <rect
            key={`sl${i}`}
            x={cx - hw * 0.46}
            y={baseY - 24 - i * ((lowerH - 12) / (6 + step))}
            width={hw * 0.92}
            height="2"
            fill={neon}
            opacity="0.9"
          />
        ))}
        {glowBand(shoulderY + 4, hw * 0.5, "sg")}
        {pvBox(cx, shoulderY, upperW, artH - 18 - lowerH - 26, shadeHex(mass, 1.3), "su")}
        {Array.from({ length: 3 + Math.floor(step / 2) }, (_, i) => (
          <rect
            key={`sul${i}`}
            x={cx - upperW * 0.7}
            y={shoulderY - 6 - i * ((artH - 18 - lowerH - 36) / (3 + Math.floor(step / 2)))}
            width={upperW * 1.4}
            height="2"
            fill={neon}
            opacity="0.9"
          />
        ))}
        {step >= 3 && halo(baseY - 18 - lowerH * 0.45, hw * 0.74, "sr1")}
        {step >= 5 && halo(baseY - 18 - lowerH * 0.8, hw * 0.72, "sr2", 0.55)}
        {Array.from({ length: step >= 4 ? 5 : 3 }, (_, i) => {
          const n = step >= 4 ? 5 : 3;
          const mx = cx + (i - (n - 1) / 2) * (upperW * 0.45);
          const my = shoulderY - (artH - 18 - lowerH - 26);
          return (
            <g key={`sm${i}`}>
              <line x1={mx} y1={my} x2={mx} y2={my - 12} stroke={neon} strokeWidth="1.5" />
              <circle cx={mx} cy={my - 13} r="1.6" fill={neon} />
            </g>
          );
        })}
        {step >= 6 && (
          <>
            {halo(shoulderY - (artH - 18 - lowerH - 26) - 4, upperW * 0.9, "sd", 0.85)}
            <circle cx={cx} cy={shoulderY - (artH - 18 - lowerH - 26) - 22} r="2.6" fill="#ffffff" opacity="0.95" />
          </>
        )}
      </>
    );
  }

  if (family === "Bot Herder") {
    // DRONE NEXUS — tri-lobed mega-hangar, doors, landing rings.
    const centerH = artH - 40;
    return (
      <>
        {pvBox(cx, baseY, hw * 0.62, centerH, glass, "nc")}
        {pvBox(cx - hw * 0.8, baseY + 2, hw * 0.34, centerH * 0.66, shadeHex(mass, 0.95), "nl")}
        {pvBox(cx + hw * 0.8, baseY + 2, hw * 0.34, centerH * 0.66, shadeHex(mass, 0.95), "nr")}
        {Array.from({ length: 3 + Math.floor(step / 2) }, (_, i) => {
          const which = [-hw * 0.8, 0, hw * 0.8][i % 3];
          return (
            <rect
              key={`nd${i}`}
              x={cx + which - 4}
              y={baseY - 8 - Math.floor(i / 3) * 14}
              width="8"
              height="2.5"
              fill={neon}
              opacity="0.95"
            />
          );
        })}
        {glowBand(baseY - centerH + 6, hw * 0.55, "ng")}
        {Array.from({ length: 1 + Math.floor(step / 2) }, (_, i) => (
          <ellipse
            key={`nr${i}`}
            cx={cx}
            cy={baseY - centerH - 3 - i * 7}
            rx={Math.max(6, hw * (0.34 - i * 0.09))}
            ry={Math.max(3, hw * (0.17 - i * 0.045))}
            fill="none"
            stroke={neon}
            strokeWidth="1.5"
            opacity="0.9"
          />
        ))}
        {step >= 3 &&
          [-hw * 0.4, hw * 0.4].map((dx, i) => (
            <g key={`npm${i}`}>
              <line x1={cx + dx} y1={baseY - centerH - 2} x2={cx + dx} y2={baseY - centerH - 14} stroke={neon} strokeWidth="1.5" />
              <circle cx={cx + dx} cy={baseY - centerH - 15} r="1.7" fill={neon} />
            </g>
          ))}
        {step >= 6 && (
          <>
            {halo(baseY - centerH - 10, hw * 0.85, "nx", 0.85)}
            <circle cx={cx} cy={baseY - centerH - 30} r="2.6" fill="#ffffff" opacity="0.95" />
          </>
        )}
      </>
    );
  }

  // Unassigned grand — stepped chroma mega-mast with halo rings + spire.
  const decks = 4;
  const deckH = (artH - 30) / decks;
  return (
    <>
      {Array.from({ length: decks }, (_, i) =>
        pvBox(cx, baseY - i * deckH, hw * (0.85 - i * 0.16), deckH, i === 0 ? mass : shadeHex(glass, 1 + i * 0.12), `ud${i}`)
      )}
      {step >= 1 && halo(baseY - deckH * 3, hw * 0.62, "uh1")}
      {step >= 3 && halo(baseY - deckH * 2, hw * 0.66, "uh2", 0.55)}
      {pvBox(cx, top + 6, hw * 0.3, 12, shadeHex(mass, 1.3), "usp1")}
      {pvBox(cx, top - 6, hw * 0.18, 9, shadeHex(mass, 1.5), "usp2")}
      <polygon points={`${cx},${top - 26} ${cx + 5},${top - 14} ${cx},${top - 10} ${cx - 5},${top - 14}`} fill={neon} opacity="0.95" />
      {step >= 6 && (
        <>
          {halo(top - 2, hw * 0.75, "uh3", 0.85)}
          <circle cx={cx} cy={top - 28} r="2.4" fill="#ffffff" opacity="0.95" />
        </>
      )}
    </>
  );
}

// ── goddess monument echo ─────────────────────────────────────────────────
//
// Simplified SVG echoes of the six LandmarkSprite monuments (landmarks.ts),
// in their stage-2 (climbing) elaborated forms — the representative look of
// each Founder's landmark.

function MonumentPreview({
  index,
  className,
  title,
}: {
  index: number;
  className?: string;
  title?: string;
}): ReactElement {
  const color = LANDMARK_HEX_COLORS[index] ?? "#7dd3fc";
  const stone = shadeHex(color, 0.3);
  const H = 210;
  const W = 150;
  const cx = W / 2;
  const baseY = H - 18;

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
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none pointer-events-none"
        role="presentation"
      >
        {/* Monument pad — the two-tile identity base. */}
        <polygon
          points={`${cx},${baseY - 20} ${cx + 52},${baseY} ${cx},${baseY + 20} ${cx - 52},${baseY}`}
          fill="#0a0e1a"
          stroke={color}
          strokeWidth="2"
          opacity="0.95"
        />
        <ellipse cx={cx} cy={baseY} rx="64" ry="24" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />

        {index === 0 && (
          /* The Architect — root spire + orbit rings. */
          <>
            {pvBox(cx, baseY, 26, 40, stone, "a1")}
            {pvBox(cx, baseY - 40, 18, 34, shadeHex(color, 0.4), "a2")}
            {pvBox(cx, baseY - 74, 11, 30, shadeHex(color, 0.55), "a3")}
            {pvBox(cx, baseY - 104, 6, 22, shadeHex(color, 0.7), "a4")}
            <polygon points={`${cx},${baseY - 182} ${cx + 7},${baseY - 134} ${cx},${baseY - 126} ${cx - 7},${baseY - 134}`} fill="#ffffff" />
            <ellipse cx={cx} cy={baseY - 96} rx="34" ry="10" fill="none" stroke={color} strokeWidth="1.5" opacity="0.8" />
            <ellipse cx={cx} cy={baseY - 134} rx="26" ry="8" fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
            <circle cx={cx - 34} cy={baseY - 96} r="3" fill="#ffffff" />
            <circle cx={cx + 34} cy={baseY - 96} r="3" fill="#ffffff" />
          </>
        )}
        {index === 1 && (
          /* The Locksmith — citadel towers + the floating key. */
          <>
            {pvBox(cx - 22, baseY, 12, 88, stone, "l1")}
            {pvBox(cx + 22, baseY, 12, 88, stone, "l2")}
            {pvBox(cx, baseY - 2, 14, 34, shadeHex(color, 0.25), "l3")}
            {pvBox(cx, baseY - 90, 18, 8, shadeHex(color, 0.45), "l4")}
            <rect x={cx - 12} y={baseY - 74} width="24" height="20" rx="4" fill={shadeHex(color, 0.55)} />
            <path d={`M ${cx - 9} ${baseY - 74} A 9 9 0 0 1 ${cx + 9} ${baseY - 74}`} fill="none" stroke={color} strokeWidth="4" />
            <circle cx={cx} cy={baseY - 68} r="3" fill="#fffbeb" />
            <circle cx={cx} cy={baseY - 108} r="5" fill="none" stroke={color} strokeWidth="2" />
            <line x1={cx} y1={baseY - 103} x2={cx} y2={baseY - 118} stroke={color} strokeWidth="2" />
            <line x1={cx} y1={baseY - 113} x2={cx + 5} y2={baseY - 113} stroke={color} strokeWidth="2" />
            <line x1={cx} y1={baseY - 118} x2={cx + 6} y2={baseY - 118} stroke={color} strokeWidth="2" />
          </>
        )}
        {index === 2 && (
          /* The Oracle — observatory dome, sensor eye + relay mast. */
          <>
            <rect x={cx - 17} y={baseY - 46} width="34" height="46" fill={stone} />
            <ellipse cx={cx} cy={baseY} rx="17" ry="8.5" fill={shadeHex(color, 0.2)} />
            <ellipse cx={cx} cy={baseY - 54} rx="15" ry="12" fill={shadeHex(color, 0.5)} />
            <ellipse cx={cx} cy={baseY - 58} rx="9" ry="7" fill={shadeHex(color, 0.75)} />
            <ellipse cx={cx} cy={baseY - 58} rx="5.5" ry="3.5" fill="#ffffff" />
            <path d={`M ${cx - 14} ${baseY - 62} A 14 14 0 0 1 ${cx + 14} ${baseY - 62}`} fill="none" stroke={color} strokeWidth="2" opacity="0.75" />
            <line x1={cx} y1={baseY - 66} x2={cx} y2={baseY - 94} stroke={shadeHex(color, 0.6)} strokeWidth="2.5" />
            <path d={`M ${cx - 7} ${baseY - 76} A 7 7 0 0 1 ${cx + 7} ${baseY - 76}`} fill="none" stroke={color} strokeWidth="1.5" />
            <path d={`M ${cx - 6} ${baseY - 88} A 6 6 0 0 1 ${cx + 6} ${baseY - 88}`} fill="none" stroke={color} strokeWidth="1.5" />
            <circle cx={cx} cy={baseY - 98} r="2.2" fill="#ffffff" />
          </>
        )}
        {index === 3 && (
          /* The Clockkeeper — clock tower + chrono rings. */
          <>
            {pvBox(cx, baseY, 15, 58, stone, "c1")}
            {pvBox(cx, baseY - 58, 18, 16, shadeHex(color, 0.45), "c2")}
            <circle cx={cx} cy={baseY - 66} r="13" fill="#0b1220" stroke={shadeHex(color, 1.3)} strokeWidth="2.5" />
            <line x1={cx} y1={baseY - 66} x2={cx} y2={baseY - 72} stroke="#ffffff" strokeWidth="2" />
            <line x1={cx} y1={baseY - 66} x2={cx - 5.5} y2={baseY - 72} stroke="#ffffff" strokeWidth="1.5" />
            {pvBox(cx, baseY - 74, 12, 26, shadeHex(color, 0.4), "c3")}
            <ellipse cx={cx} cy={baseY - 92} rx="22" ry="7" fill="none" stroke={color} strokeWidth="2" opacity="0.85" />
            <ellipse cx={cx} cy={baseY - 118} rx="18" ry="6" fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
            <circle cx={cx} cy={baseY - 122} r="2.2" fill="#ffffff" />
          </>
        )}
        {index === 4 && (
          /* NullPointer — fractured obelisk + orbit shards. */
          <>
            <polygon points={`${cx - 9},${baseY} ${cx + 9},${baseY} ${cx + 6},${baseY - 86} ${cx - 6},${baseY - 86}`} fill={stone} />
            <polygon points={`${cx - 8},${baseY - 86} ${cx + 8},${baseY - 86} ${cx + 5},${baseY - 122} ${cx - 5},${baseY - 118}`} fill={stone} />
            <polygon points={`${cx - 5},${baseY - 120} ${cx + 6},${baseY - 122} ${cx + 3},${baseY - 150} ${cx - 4},${baseY - 146}`} fill={stone} />
            <line x1={cx - 6} y1={baseY - 84} x2={cx + 2} y2={baseY - 88} stroke={shadeHex(color, 1.4)} strokeWidth="2" />
            <line x1={cx - 2} y1={baseY - 128} x2={cx + 4} y2={baseY - 134} stroke={shadeHex(color, 1.4)} strokeWidth="2" />
            {[-18, 0, 18].map((dx, i) => (
              <polygon
                key={`s${i}`}
                points={`${cx + dx},${baseY - 108 - (i % 2) * 22 - 7} ${cx + dx + 4},${baseY - 108 - (i % 2) * 22} ${cx + dx},${baseY - 108 - (i % 2) * 22 + 6} ${cx + dx - 4},${baseY - 108 - (i % 2) * 22}`}
                fill={shadeHex(color, 1.2)}
                opacity="0.95"
              />
            ))}
            <line x1={cx} y1={baseY - 150} x2={cx} y2={baseY - 176} stroke={shadeHex(color, 1.4)} strokeWidth="2" />
            <circle cx={cx} cy={baseY - 178} r="2.6" fill="#ffffff" />
          </>
        )}
        {index === 5 && (
          /* The Banker — stepped treasury pyramid + colonnade + coins. */
          <>
            {[
              [30, 18],
              [24, 18],
              [17, 18],
              [10, 16],
            ].map(([halfW, h], i) => {
              const y = baseY - [0, 11.7, 23.4, 35.1][i];
              return (
                <g key={`b${i}`}>
                  <polygon
                    points={`${cx - halfW},${y} ${cx},${y - h * 0.35} ${cx + halfW},${y}`}
                    fill={shadeHex(color, 0.3 + i * 0.05)}
                    stroke={shadeHex(color, 1.3)}
                    strokeWidth="1"
                  />
                  <polygon
                    points={`${cx - halfW},${y} ${cx},${y + halfW * 0.66} ${cx},${y + halfW * 0.66 - h * 0.35} ${cx - halfW},${y - h * 0.35}`}
                    fill={shadeHex(color, 0.24 + i * 0.05)}
                  />
                  <polygon
                    points={`${cx + halfW},${y} ${cx},${y + halfW * 0.66} ${cx},${y + halfW * 0.66 - h * 0.35} ${cx + halfW},${y - h * 0.35}`}
                    fill={shadeHex(color, 0.2 + i * 0.05)}
                  />
                </g>
              );
            })}
            {[-38, -19, 19, 38].map((dx, i) => (
              <g key={`bc${i}`}>
                <rect x={cx + dx - 2} y={baseY - 26} width="4" height="26" fill={shadeHex(color, 0.4)} />
                <circle cx={cx + dx} cy={baseY - 28} r="2.2" fill="#fffbeb" />
              </g>
            ))}
            <polygon points={`${cx},${baseY - 68} ${cx + 6},${baseY - 56} ${cx},${baseY - 51} ${cx - 6},${baseY - 56}`} fill="#fffbeb" />
            <ellipse cx={cx} cy={baseY - 62} rx="16" ry="5" fill="none" stroke={color} strokeWidth="1.5" opacity="0.7" />
            <circle cx={cx - 16} cy={baseY - 62} r="2" fill="#fffbeb" />
            <circle cx={cx + 16} cy={baseY - 62} r="2" fill="#fffbeb" />
          </>
        )}
      </svg>
    </div>
  );
}
