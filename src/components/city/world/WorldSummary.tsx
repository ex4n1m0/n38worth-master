"use client";

import { useMemo } from "react";
import { useLanguage } from "@/components/LanguageContext";
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
 * DISPLAY-ONLY: every figure is a server aggregate from the projection
 * (family totals, detailed+aggregated counts, portfolio) — nothing is
 * recomputed from building lists here.
 */
export function WorldSummary({ projection }: { projection: CityProjection }) {
  const { t, locale } = useLanguage();
  const lod = useCityWorldStore((s) => s.lod);
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
    </section>
  );
}
