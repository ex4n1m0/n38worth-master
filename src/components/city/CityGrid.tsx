"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageContext";
import { formatCompact } from "@/lib/utils";
import { professionName } from "@/lib/professions";
import { UNASSIGNED_FAMILY, type CityFamily } from "@/lib/city/types";
import { BuildingTile } from "./BuildingTile";

/** Focusable tiles inside a family grid, in DOM order (= payload order). */
const TILE_SELECTOR = "a[data-city-tile]";

/**
 * Roving-tabindex keyboard navigation for one family grid
 * (WAI-ARIA grid pattern): ArrowLeft/Right step by one, ArrowUp/Down jump by
 * the CURRENT responsive column count (read from the computed grid template
 * at event time — no JS breakpoint duplication), Home/End go to the
 * first/last tile. The focused tile keeps tabIndex 0, all others -1, so Tab
 * enters and leaves the grid at the remembered position.
 */
function useTileGridKeyboard() {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const { key } = e;
      if (
        key !== "ArrowLeft" &&
        key !== "ArrowRight" &&
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "Home" &&
        key !== "End"
      ) {
        return;
      }
      const row = rowRef.current;
      if (!row) return;
      const tiles = Array.from(
        row.querySelectorAll<HTMLAnchorElement>(TILE_SELECTOR)
      );
      if (tiles.length === 0) return;
      e.preventDefault();

      const current = tiles.findIndex((el) => el === document.activeElement);
      const from = current === -1 ? focusIndex : current;

      // Live column count — tracks the responsive grid-cols breakpoints.
      let cols = 1;
      const template = window.getComputedStyle(row).gridTemplateColumns;
      if (template && template !== "none") {
        const count = template.split(" ").filter(Boolean).length;
        if (count > 0) cols = count;
      }

      let next: number;
      switch (key) {
        case "ArrowRight":
          next = from + 1;
          break;
        case "ArrowLeft":
          next = from - 1;
          break;
        case "ArrowDown":
          next = from + cols;
          break;
        case "ArrowUp":
          next = from - cols;
          break;
        case "Home":
          next = 0;
          break;
        default:
          next = tiles.length - 1; // End
          break;
      }
      next = Math.max(0, Math.min(tiles.length - 1, next));
      tiles[next]?.focus();
      setFocusIndex(next);
    },
    [focusIndex]
  );

  return { rowRef, focusIndex, setFocusIndex, handleKeyDown };
}

/** One profession family: header + auto-placed CSS grid of building tiles. */
function FamilySection({
  family,
  constructIds,
}: {
  family: CityFamily;
  constructIds: ReadonlySet<number>;
}) {
  const { t, locale } = useLanguage();
  const { rowRef, focusIndex, setFocusIndex, handleKeyDown } =
    useTileGridKeyboard();

  const label =
    family.profession === UNASSIGNED_FAMILY
      ? t.cityUnassignedFamily
      : professionName(family.profession, locale);

  // Clamp the roving tabindex so a shrunk family (a poach removed a card)
  // always keeps exactly one tabbable tile.
  const activeIndex = Math.min(focusIndex, family.buildings.length - 1);

  return (
    <section className="space-y-2">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="min-w-0 truncate text-sm font-bold text-white">
          {label}
        </h3>
        <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-500">
          {formatCompact(family.total)}
        </span>
      </div>
      <div role="grid" aria-label={label} onKeyDown={handleKeyDown}>
        <div
          ref={rowRef}
          role="row"
          className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8"
        >
          {family.buildings.map((building, i) => (
            <div role="gridcell" key={building.cardId} className="flex">
              <BuildingTile
                building={building}
                construct={constructIds.has(building.cardId)}
                tileTabIndex={i === activeIndex ? 0 : -1}
                onTileFocus={() => setFocusIndex(i)}
              />
            </div>
          ))}
          {/* Aggregate chip: buildings beyond the detailed-display limit
              (full density blocks are slice 7 — this is the minimal marker). */}
          {family.aggregated > 0 && (
            <div role="gridcell" className="flex">
              <div
                title={t.cityAggregatedMore.replace(
                  "{count}",
                  formatCompact(family.aggregated)
                )}
                className="flex min-h-[7rem] w-full items-center justify-center rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-1 py-4"
              >
                <span className="text-[10px] font-semibold tabular-nums text-gray-400">
                  {t.cityAggregatedMore.replace(
                    "{count}",
                    formatCompact(family.aggregated)
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The Boot Sector grid (Mainframe City slice 4): one section per profession
 * family, tiles in payload order (server sorts by value desc) — CSS grid
 * auto-placement only, no drag, no position persistence.
 *
 * Construct animation: the previous set of building cardIds is kept in a ref;
 * after each successful data render, tiles whose cardId wasn't in the
 * previous set mount with the one-shot `.city-construct` grow-in (~400ms,
 * disabled under prefers-reduced-motion). The first data render seeds the
 * ref without animating so page loads stay calm — only genuinely NEW
 * buildings (e.g. a hire landing via the Pusher ownership-changed
 * invalidation) animate.
 */
export function CityGrid({ families }: { families: CityFamily[] }) {
  const { t } = useLanguage();

  const allCardIds = useMemo(
    () => families.flatMap((f) => f.buildings.map((b) => b.cardId)),
    [families]
  );

  const prevCardIdsRef = useRef<Set<number> | null>(null);
  const [constructIds, setConstructIds] = useState<ReadonlySet<number>>(
    () => new Set<number>()
  );

  useEffect(() => {
    const current = new Set(allCardIds);
    const prev = prevCardIdsRef.current;
    prevCardIdsRef.current = current;
    if (prev === null) return; // first render: seed, no boot animation
    const added = new Set<number>();
    for (const id of current) {
      if (!prev.has(id)) added.add(id);
    }
    setConstructIds(added);
  }, [allCardIds]);

  return (
    <section className="space-y-5" aria-label={t.cityBootSector}>
      <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-t1-300">
        {t.cityBootSector}
      </h2>
      {families.map((family) => (
        <FamilySection
          key={family.profession}
          family={family}
          constructIds={constructIds}
        />
      ))}
    </section>
  );
}
