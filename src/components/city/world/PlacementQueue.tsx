"use client";

import { ListPlus, Move3d } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { formatCompact } from "@/lib/utils";
import { UNASSIGNED_FAMILY, type CityBuilding } from "@/lib/city/types";
import { useCityWorldStore } from "@/hooks/useCityWorldStore";

/**
 * Owner-only placement queue (GET /api/city/my-layout — no-store, authed;
 * includes hidden cards, which is exactly why it is never part of the
 * public payload). Clicking a row enters place mode: the ghost appears in
 * the world, arrows move it, Enter commits the batched POST, Escape
 * cancels (the window-capture handler in CityWorld owns those keys).
 */
export function PlacementQueue({
  queue,
  loading,
  onPlace,
  disabled,
}: {
  queue: readonly CityBuilding[] | undefined;
  loading: boolean;
  onPlace: (cardId: number) => void;
  disabled: boolean;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const activeCardId = useCityWorldStore((s) => s.placeMode?.cardId ?? null);

  return (
    <section className="city-world-queue" aria-label={t.cityQueueTitle}>
      <header className="flex items-center gap-1.5">
        <ListPlus className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-t1-300">
          {t.cityQueueTitle}
        </h3>
        {queue && queue.length > 0 ? (
          <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">
            {formatCompact(queue.length)}
          </span>
        ) : null}
      </header>

      {loading ? (
        <p className="px-1 py-2 text-xs text-gray-500">{t.cityQueueLoading}</p>
      ) : !queue || queue.length === 0 ? (
        <p className="px-1 py-2 text-xs text-gray-500">{t.cityQueueEmpty}</p>
      ) : (
        <ul className="city-world-queue-list">
          {queue.map((building) => {
            const isActive = activeCardId === building.cardId;
            return (
              <li key={building.cardId}>
                <button
                  type="button"
                  onClick={() => {
                    play("open");
                    onPlace(building.cardId);
                  }}
                  aria-pressed={isActive}
                  aria-label={t.cityQueuePlaceAria.replace(
                    "{name}",
                    cardDisplayName(building.username, locale)
                  )}
                  className={`city-world-queue-row ${isActive ? "city-world-queue-row-active" : ""}`}
                  disabled={disabled && !isActive}
                >
                  <Move3d className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden="true" />
                  <span className="min-w-0 truncate text-xs font-semibold text-gray-200">
                    {cardDisplayName(building.username, locale)}
                  </span>
                  <span className="truncate text-[10px] text-gray-500">
                    {building.profession && building.profession !== UNASSIGNED_FAMILY
                      ? professionName(building.profession, locale)
                      : t.cityUnassignedFamily}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] font-bold tabular-nums text-white">
                    {`${formatCompact(building.value)}¢`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
