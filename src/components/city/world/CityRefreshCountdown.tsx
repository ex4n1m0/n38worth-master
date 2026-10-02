"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useNow } from "@/hooks/useNow";

/** Poll cadence of the shared world query. CityMap2D/CityMap3D set their
 * refetchInterval from this constant so the countdown can never drift from
 * the actual refresh. */
export const CITY_WORLD_REFETCH_MS = 180_000;

/**
 * "Next update in m:ss" chip under the 2D/3D toggle. The world map is a
 * slow poll by design (cost control — no Pusher event covers ["city-world"]),
 * so this tells the viewer a change they're waiting for is already on its
 * way instead of looking like a frozen canvas.
 *
 * A passive observer over the SHARED query owned by the map views:
 * enabled:false never fetches (and never refetches on focus) — it only
 * mirrors dataUpdatedAt so the countdown re-anchors on every landed
 * refresh, including the view-switch remount between 2D and 3D. One leaf
 * component so the shared 1s useNow clock re-renders only this chip.
 */
export function CityRefreshCountdown() {
  const { t } = useLanguage();
  const world = useQuery({ queryKey: ["city-world"], enabled: false });
  const now = useNow();

  const updatedAt = world.dataUpdatedAt;
  const remaining =
    updatedAt > 0 ? Math.max(0, updatedAt + CITY_WORLD_REFETCH_MS - now) : 0;
  // Hold at "Updating…" once the window closes (or a fetch is in flight):
  // absorbs timer drift and background-tab throttling — the label settles
  // back to 3:00 exactly when new data lands.
  const updating = world.isFetching || remaining <= 0;

  const totalSec = Math.ceil(remaining / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  const time = `${mm}:${ss.toString().padStart(2, "0")}`;

  return (
    <div
      className="absolute left-2 top-11 z-10 flex items-center gap-1.5 rounded-md border border-[#33506B]/30 bg-[#F4F1E8]/95 px-2.5 py-1.5 text-[10px] font-bold text-[#33506B] shadow-sm"
      role="timer"
      aria-label={
        updating
          ? t.cityWorldUpdating
          : t.cityWorldRefreshIn.replace("{time}", time)
      }
    >
      <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
      {updating ? (
        <span>{t.cityWorldUpdating}</span>
      ) : (
        <span className="tabular-nums">
          {t.cityWorldRefreshIn.replace("{time}", time)}
        </span>
      )}
    </div>
  );
}
