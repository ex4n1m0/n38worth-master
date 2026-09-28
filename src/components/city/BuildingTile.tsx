"use client";

import { useLanguage } from "@/components/LanguageContext";
import { cardDisplayName } from "@/lib/display-names";
import { formatCompact } from "@/lib/utils";
import { UNHIRED_AVATAR_SRC } from "@/lib/avatar-utils";
import { useSound } from "@/hooks/useSound";
import type { CityBuilding } from "@/lib/city/types";

interface BuildingTileProps {
  building: CityBuilding;
  /** One-shot construct animation (building appeared since the last render). */
  construct: boolean;
  /** Roving tabindex: 0 on the family grid's current tile, -1 on the rest. */
  tileTabIndex: number;
  onTileFocus: () => void;
}

/**
 * One owned avatar rendered as a building (Mainframe City slice 4).
 *
 * EVERYTHING shown is server-derived: the stage (0–5) and protection state
 * arrive from /api/city/[username] and are never recomputed here — the client
 * only draws them. The avatar lazy-loads from the CDN-cached
 * /api/avatar/[username] image route (the city payload intentionally carries
 * no avatar URLs — legacy `data:` URI rows made inline payloads unusable).
 */
export function BuildingTile({
  building,
  construct,
  tileTabIndex,
  onTileFocus,
}: BuildingTileProps) {
  const { t, locale } = useLanguage();
  const { play } = useSound();

  const displayName = cardDisplayName(building.username, locale);
  const valueText = `${formatCompact(building.value)}¢`;
  const protectionName =
    building.protection === "hardlock"
      ? t.cityHardLock
      : building.protection === "firewall"
        ? t.cityFirewall
        : null;

  const ariaLabel =
    t.cityBuildingAria
      .replace("{name}", displayName)
      .replace("{stage}", String(building.tier))
      .replace("{value}", valueText) +
    (protectionName ? ` · ${protectionName}` : "");

  // Tier visual: a stack of floor bars under the avatar (CSS-only). Capped
  // at 7 bars — the 14-level ladder (2026-09-29) would overflow the tile,
  // and the opacity/width steps below are tuned for ≤7 rows.
  const floors = Math.min(7, building.tier);

  // Protection ring on the avatar — cyan = firewalled, amber = hard-locked
  // (hard lock outranks firewall), matching PlayerCard's status-ring colors.
  const protectionRing =
    building.protection === "hardlock"
      ? "ring-2 ring-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
      : building.protection === "firewall"
        ? "ring-2 ring-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.35)]"
        : "ring-1 ring-white/10";

  return (
    <a
      href={`/players/${encodeURIComponent(building.username)}`}
      data-city-tile
      aria-label={ariaLabel}
      title={ariaLabel}
      tabIndex={tileTabIndex}
      onFocus={onTileFocus}
      onClick={() => play("buttons")}
      className={`group flex w-full flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40 transition-colors hover:border-gray-600 hover:bg-gray-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400 focus-visible:ring-offset-1 focus-visible:ring-offset-gray-950 ${
        construct ? "city-construct" : ""
      }`}
    >
      {/* Avatar "roof" — lazy-loaded square with the protection ring. The
          image is decorative: the link's accessible name carries everything. */}
      <div
        className={`relative aspect-square w-full overflow-hidden rounded-t-xl bg-gray-800 ${protectionRing}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/avatar/${encodeURIComponent(building.username)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => {
            // No avatar stored (404) → masked placeholder.
            const el = e.currentTarget;
            if (!el.src.endsWith(UNHIRED_AVATAR_SRC)) el.src = UNHIRED_AVATAR_SRC;
          }}
          className="h-full w-full object-cover"
        />
      </div>

      {/* Floor stack — the building grows one bar per stage (1–7 bars;
          tiers above 7 pin at 7 — see `floors` above).
          Cyan + glow to match the city accent system; tall/bright enough to
          read the stage count at a glance (visual-review feedback). */}
      <div className="flex flex-col-reverse gap-[2px] px-1.5 pt-1" aria-hidden="true">
        {Array.from({ length: floors }, (_, i) => (
          <div
            key={i}
            className="h-[4px] rounded-[1px] bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.45)]"
            style={{ opacity: 0.95 - i * 0.11, width: `${100 - i * 7}%` }}
          />
        ))}
      </div>

      {/* Caption: truncated display name + server value. */}
      <div className="mt-auto flex items-baseline justify-between gap-1 px-1.5 pb-1.5 pt-1">
        <span className="min-w-0 truncate text-[10px] font-semibold text-gray-300">
          {displayName}
        </span>
        <span className="shrink-0 text-[10px] font-bold text-white tabular-nums">
          {valueText}
        </span>
      </div>
    </a>
  );
}
