"use client";

import { useState } from "react";
import { Satellite } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { getCityWorldStore, useCityWorldStore } from "@/hooks/useCityWorldStore";
import { cardDisplayName } from "@/lib/display-names";
import { formatCompact } from "@/lib/utils";
import type { CityNeighbor } from "@/lib/city/types";

/**
 * Satellite cities panel — the a11y/keyboard bridge for the steal surface.
 *
 * The canvas is aria-hidden, so this DOM list IS how keyboard and
 * screen-reader users reach foreign buildings: one row per satellite
 * (focus the camera on the cluster), expanding into its buildings —
 * selecting one opens the DOM inspector (BuildingInspector) where the
 * city owner finds the STEAL action. All state shown (counts, values,
 * protection) arrives from the public projection; nothing is computed
 * here, and no actions mutate anything directly.
 */
export function SatellitePanel({
  neighbors,
  onFocusSatellite,
}: {
  neighbors: readonly CityNeighbor[];
  onFocusSatellite: (index: number) => void;
}) {
  const { t, locale } = useLanguage();
  const [expanded, setExpanded] = useState<number | null>(null);
  const selectedForeign = useCityWorldStore((s) => s.selectedForeign);

  if (neighbors.length === 0) return null;

  return (
    <section className="city-world-landmarks" aria-label={t.citySatellitesTitle}>
      <header className="flex items-center gap-1.5">
        <Satellite className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-t1-300">
          {t.citySatellitesTitle}
        </h3>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">
          {t.citySatellitesCount.replace("{count}", String(neighbors.length))}
        </span>
      </header>

      <ul className="city-world-district-list">
        {neighbors.map((neighbor, i) => {
          const open = expanded === i;
          return (
            <li key={neighbor.cardId} className="city-world-district-row">
              <button
                type="button"
                onClick={() => {
                  setExpanded(open ? null : i);
                  if (!open) onFocusSatellite(i);
                }}
                aria-pressed={open}
                aria-expanded={open}
                aria-label={t.citySatelliteFocusAria.replace(
                  "{name}",
                  cardDisplayName(neighbor.username, locale)
                )}
                className={`city-landmark-row-btn ${open ? "city-landmark-row-btn-selected" : ""}`}
              >
                <span
                  className="city-world-district-dot"
                  style={{ backgroundColor: "#8b5cf6" }}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate text-left text-[11px] font-semibold text-gray-200">
                  {cardDisplayName(neighbor.username, locale)}
                </span>
                <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-gray-500">
                  {t.citySatelliteBldgs.replace(
                    "{count}",
                    formatCompact(neighbor.visibleOwnedCount)
                  )}
                </span>
              </button>

              {open ? (
                <ul className="mt-0.5 space-y-0.5">
                  {neighbor.buildings.map((building) => {
                    const selected =
                      selectedForeign !== null &&
                      selectedForeign.owner === neighbor.cardId &&
                      selectedForeign.cardId === building.cardId;
                    return (
                      <li key={building.cardId}>
                        <button
                          type="button"
                          onClick={() => {
                            const store = getCityWorldStore();
                            store.select(null);
                            store.selectLandmark(null);
                            store.selectForeign({
                              owner: neighbor.cardId,
                              cardId: building.cardId,
                            });
                            onFocusSatellite(i);
                          }}
                          aria-pressed={selected}
                          className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] font-semibold transition-colors ${
                            selected
                              ? "border-purple-500 bg-purple-500/10 text-white"
                              : "border-transparent bg-white/[0.02] text-gray-300 hover:border-purple-900 hover:text-white"
                          }`}
                        >
                          <span className="min-w-0 truncate">{cardDisplayName(building.username, locale)}</span>
                          {building.ownedByCityOwner ? (
                            <span className="shrink-0 rounded bg-gray-800 px-1 text-[9px] font-bold text-gray-400">
                              {t.cityStealOwnedTag}
                            </span>
                          ) : building.protection ? (
                            <span
                              className={`shrink-0 rounded px-1 text-[9px] font-bold ${
                                building.protection === "firewall"
                                  ? "bg-cyan-950 text-cyan-300"
                                  : "bg-amber-950 text-amber-300"
                              }`}
                            >
                              {building.protection === "firewall"
                                ? t.cityFirewall
                                : t.cityHardLock}
                            </span>
                          ) : null}
                          <span className="ml-auto shrink-0 tabular-nums text-gray-500">
                            {formatCompact(building.value)}¢
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
