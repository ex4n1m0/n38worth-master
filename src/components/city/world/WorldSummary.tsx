"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/LanguageContext";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { familyHex } from "@/lib/city/district";
import {
  summaryBuildingTotal,
  worldSummaryRows,
} from "@/lib/city/scene/summary";
import { useCityWorldStore } from "@/hooks/useCityWorldStore";
import { UNASSIGNED_FAMILY, type CityProjection } from "@/lib/city/types";
import { formatCompact } from "@/lib/utils";

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
  const lod = useCityWorldStore((s) => s.lod);
  const universe = useCityWorldStore((s) => s.universeSummary);
  const selectedUniverse = useCityWorldStore((s) => s.selectedUniverseCity);
  const rows = useMemo(
    () => worldSummaryRows(projection.families),
    [projection.families]
  );

  if (lod !== "world") return null;

  return (
    <section className="city-world-summary" aria-label={t.citySummaryLabel}>
      <h3 className="city-world-summary-title">{t.citySummaryLabel}</h3>
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
    </section>
  );
}
