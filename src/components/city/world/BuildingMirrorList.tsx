"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, Layers } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { formatCompact } from "@/lib/utils";
import { lodFor, mirrorNodeBudget } from "@/lib/city/scene/lod";
import {
  getCityWorldStore,
  useCityWorldStore,
} from "@/hooks/useCityWorldStore";
import {
  UNASSIGNED_FAMILY,
  type CityBuilding,
  type CityProjection,
} from "@/lib/city/types";

const ROW_SELECTOR = "a[data-city-mirror-row], button[data-city-mirror-row]";

/**
 * Roving-tabindex keyboard navigation for a one-column list, generalized
 * from CityGrid's useTileGridKeyboard (WAI-ARIA grid pattern): Up/Down step
 * by one, Home/End jump to the ends. The focused row keeps tabIndex 0, all
 * others -1, so Tab enters and leaves the list at the remembered position.
 */
function useListKeyboard() {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { key } = e;
      if (
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "Home" &&
        key !== "End"
      ) {
        return;
      }
      const list = listRef.current;
      if (!list) return;
      const rows = Array.from(
        list.querySelectorAll<HTMLElement>(ROW_SELECTOR)
      );
      if (rows.length === 0) return;
      e.preventDefault();

      const current = rows.findIndex((el) => el === document.activeElement);
      const from = current === -1 ? focusIndex : current;
      let next: number;
      switch (key) {
        case "ArrowDown":
          next = from + 1;
          break;
        case "ArrowUp":
          next = from - 1;
          break;
        case "Home":
          next = 0;
          break;
        default:
          next = rows.length - 1; // End
          break;
      }
      next = Math.max(0, Math.min(rows.length - 1, next));
      rows[next]?.focus();
      setFocusIndex(next);
    },
    [focusIndex]
  );

  return { listRef, focusIndex, setFocusIndex, handleKeyDown };
}

interface MirrorRow {
  kind: "building" | "aggregate";
  cardId?: number;
  username?: string;
  building?: CityBuilding;
  aggregateCount?: number;
  familyLabel: string;
}

/**
 * A11y DOM bridge for the (aria-hidden) canvas world (ADR §D1): one
 * focusable row per detailed building + one aggregate row per family with
 * folded density — bounded by the per-LOD node budget (≤1,500 at ANY LOD).
 * Focusing a building row glides the camera onto it; rows link out to the
 * player profile (existing card actions live there).
 */
export function BuildingMirrorList({
  projection,
  onFocusCard,
}: {
  projection: CityProjection;
  onFocusCard: (cardId: number) => void;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const zoom = useCityWorldStore((s) => s.camera.zoom);
  const { listRef, focusIndex, setFocusIndex, handleKeyDown } = useListKeyboard();

  const rows = useMemo<MirrorRow[]>(() => {
    const budget = mirrorNodeBudget(lodFor(zoom));
    const out: MirrorRow[] = [];

    for (const family of projection.families) {
      const familyLabel =
        family.profession === UNASSIGNED_FAMILY
          ? t.cityUnassignedFamily
          : professionName(family.profession, locale);
      for (const building of family.buildings) {
        if (out.length >= budget) return out;
        out.push({
          kind: "building",
          cardId: building.cardId,
          username: building.username,
          building,
          familyLabel,
        });
      }
    }
    for (const family of projection.families) {
      if (out.length >= budget) break;
      if (family.aggregated <= 0) continue;
      out.push({
        kind: "aggregate",
        aggregateCount: family.aggregated,
        familyLabel:
          family.profession === UNASSIGNED_FAMILY
            ? t.cityUnassignedFamily
            : professionName(family.profession, locale),
      });
    }
    return out;
  }, [projection.families, zoom, t, locale]);

  const activeIndex = Math.min(focusIndex, rows.length - 1);

  // A shrunk list (poach removed a card) keeps exactly one tabbable row.
  useEffect(() => {
    if (rows.length === 0) return;
    const clamped = Math.min(focusIndex, rows.length - 1);
    if (clamped !== focusIndex) setFocusIndex(clamped);
  }, [rows.length, focusIndex, setFocusIndex]);

  return (
    <section className="city-world-mirror" aria-label={t.cityMirrorLabel}>
      <header className="flex items-center gap-1.5">
        <Building2 className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-t1-300">
          {t.cityMirrorLabel}
        </h3>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">
          {formatCompact(rows.length)}
        </span>
      </header>
      {rows.length === 0 ? (
        <p className="px-1 py-2 text-xs text-gray-500">{t.cityMirrorEmpty}</p>
      ) : (
        <div role="grid" aria-label={t.cityMirrorLabel} onKeyDown={handleKeyDown}>
          <div ref={listRef} role="row" className="city-world-mirror-list">
            {rows.map((row, i) => {
              const tabIndex = i === activeIndex ? 0 : -1;
              if (row.kind === "aggregate") {
                return (
                  <div role="gridcell" key={`agg-${row.familyLabel}`} className="flex">
                    <div
                      className="city-world-mirror-aggregate"
                      title={t.cityMirrorAggregateRow
                        .replace("{family}", row.familyLabel)
                        .replace("{count}", formatCompact(row.aggregateCount ?? 0))}
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                      <span className="min-w-0 truncate text-[11px] text-gray-400">
                        {t.cityMirrorAggregateRow
                          .replace("{family}", row.familyLabel)
                          .replace("{count}", formatCompact(row.aggregateCount ?? 0))}
                      </span>
                    </div>
                  </div>
                );
              }
              const building = row.building as CityBuilding;
              const displayName = cardDisplayName(row.username ?? "", locale);
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
              return (
                <div role="gridcell" key={building.cardId} className="flex">
                  <a
                    href={`/players/${encodeURIComponent(row.username ?? "")}`}
                    data-city-mirror-row
                    aria-label={ariaLabel}
                    title={ariaLabel}
                    tabIndex={tabIndex}
                    onFocus={() => {
                      setFocusIndex(i);
                      if (row.cardId !== undefined) {
                        getCityWorldStore().select(row.cardId);
                        onFocusCard(row.cardId);
                      }
                    }}
                    onClick={() => play("buttons")}
                    className="city-world-mirror-row"
                  >
                    <span className="min-w-0 truncate text-xs font-semibold text-gray-200">
                      {displayName}
                    </span>
                    <span className="shrink-0 text-[10px] text-gray-500">
                      {row.familyLabel}
                    </span>
                    <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-white">
                      {valueText}
                    </span>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
