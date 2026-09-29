"use client";

import { useCallback, useMemo, useState } from "react";
import { Globe, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { familyHex } from "@/lib/city/district";
import { CIVIC_TIER_THRESHOLDS } from "@/lib/city/projection";
import {
  summaryBuildingTotal,
  worldSummaryRows,
} from "@/lib/city/scene/summary";
import { daylightAt, gameClockAt } from "@/lib/city/scene/daylight";
import { useNow } from "@/hooks/useNow";
import { useCityWorldStore } from "@/hooks/useCityWorldStore";
import { UNASSIGNED_FAMILY, type CityProjection } from "@/lib/city/types";
import { formatCompact } from "@/lib/utils";
import { CityPanelHead } from "./CityPanelHead";

/**
 * WORLD-LOD summary overlay (Phase D): one bounded line per profession
 * family + total buildings + portfolio, as DOM (cheaper than canvas and
 * screen-reader visible). Mounted only while the store's LOD band is
 * "world" (set on camera settle); district LOD relies on the sector chips.
 *
 * UNIVERSE (2026-09-28): while the shared map is loaded, a universe line
 * shows how many cities it holds + this player's rank; tapping a city on
 * the map adds the selected-city line with a visit link.
 *
 * DISPLAY-ONLY: every figure is a server aggregate from the projection
 * (family totals, detailed+aggregated counts, portfolio) — nothing is
 * recomputed from building lists here.
 */
export function WorldSummary({ projection }: { projection: CityProjection }) {
  const { t, locale } = useLanguage();
  const universe = useCityWorldStore((s) => s.universeSummary);
  const selectedUniverse = useCityWorldStore((s) => s.selectedUniverseCity);
  const rows = useMemo(
    () => worldSummaryRows(projection.families),
    [projection.families]
  );
  // Slim-bar disclosure (2026-09-28): the overview lives in the SIDE COLUMN
  // now (moved off the canvas overlay per user request — it used to blanket
  // the mobile map). Same collapse affordance as every other panel.
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  // SIM CLOCK (2026-09-28 user request "see the time passing quickly"): one
  // game day per real hour → 24 game seconds tick per real second, so the
  // seconds visibly race. Shared useNow (never a per-component interval);
  // the sun/moon glyph flips at the daylight ramp midpoints.
  const now = useNow();
  const clock = gameClockAt(now);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const clockText = `${pad2(clock.h)}:${pad2(clock.m)}:${pad2(clock.s)}`;
  const isDay = daylightAt(now) >= 0.5;

  return (
    <section
      className={`city-world-summary ${collapsed ? "city-panel-collapsed" : ""}`}
      aria-label={t.citySummaryLabel}
    >
      <header>
        <CityPanelHead
          title={t.citySummaryLabel}
          icon={<Globe className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />}
          trailing={
            <span
              className="text-[11px] font-bold tabular-nums tracking-wide text-gray-200"
              title={t.citySimTime}
            >
              {isDay ? (
                <Sun className="mr-0.5 inline h-3 w-3 text-amber-300" aria-hidden="true" />
              ) : (
                <Moon className="mr-0.5 inline h-3 w-3 text-slate-300" aria-hidden="true" />
              )}
              {clockText}
            </span>
          }
          collapsed={collapsed}
          onToggle={toggle}
          bodyId="city-overview-body"
        />
      </header>
      <div id="city-overview-body" hidden={collapsed} className="city-world-summary-body">
        <ul className="city-world-summary-list">
        {rows.map((row) => (
          <li key={row.profession} className="city-world-summary-row">
            <span
              className="city-world-district-dot"
              style={{ backgroundColor: familyHex(row.profession) }}
              aria-hidden="true"
            />
            <span className="min-w-0 truncate">
              {row.profession === UNASSIGNED_FAMILY
                ? t.cityUnassignedFamily
                : professionName(row.profession, locale)}
            </span>
            <span className="ml-auto shrink-0 font-bold tabular-nums text-gray-200">
              {formatCompact(row.count)}
            </span>
          </li>
        ))}
      </ul>
      <div className="city-world-summary-total">
        <span>{t.cityStatBuildings}</span>
        <span className="tabular-nums">
          {formatCompact(summaryBuildingTotal(projection))}
        </span>
      </div>
      {/* Civic landmarks status (server-derived tier; discovery line). */}
      <div className="city-world-summary-total">
        <span>{t.cityCivicSummaryTitle}</span>
        <span className="tabular-nums">
          {(projection.civic?.tier ?? 0) === 0
            ? t.cityCivicLocked.replace(
                "{threshold}",
                CIVIC_TIER_THRESHOLDS[0].toLocaleString("en-US")
              )
            : (projection.civic?.tier ?? 0) >= 3
              ? t.cityCivicTierMax
              : t.cityCivicTier.replace(
                  "{tier}",
                  String(projection.civic?.tier ?? 1)
                )}
        </span>
      </div>
      <div className="city-world-summary-total">
        <span>{t.cityStatPortfolio}</span>
        <span className="tabular-nums">
          {formatCompact(projection.owner.portfolioValue)}¢
        </span>
      </div>
      {universe ? (
        <div className="city-world-summary-total">
          <span>{t.cityUniverseSummaryLabel}</span>
          <span className="tabular-nums">
            {universe.myRank !== null
              ? t.cityUniverseChip
                  .replace("{count}", formatCompact(universe.count))
                  .replace("{rank}", String(universe.myRank))
              : t.cityUniverseChipUnranked.replace(
                  "{count}",
                  formatCompact(universe.count)
                )}
          </span>
        </div>
      ) : null}
      {selectedUniverse ? (
        <div className="city-world-summary-total items-center">
          <span className="min-w-0 truncate">
            {t.cityUniverseSelected.replace(
              "{name}",
              cardDisplayName(selectedUniverse, locale)
            )}
          </span>
          <a
            href={`/city/${encodeURIComponent(selectedUniverse)}`}
            className="ml-auto shrink-0 rounded-md border border-gray-700 bg-gray-900/60 px-1.5 py-0.5 text-[11px] font-bold text-t1-300 transition-colors hover:border-t1-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400"
          >
            {t.cityUniverseVisit}
          </a>
        </div>
      ) : null}
      </div>
    </section>
  );
}
