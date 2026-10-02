"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import type { CityProjection } from "@/lib/city/types";
import { cityWorldStore } from "@/lib/city/scene/store";
import { CityMap2D, type Map2DApi } from "./CityMap2D";
import { CityRefreshCountdown } from "./CityRefreshCountdown";
import { BuildingInspector } from "./BuildingInspector";
import { DistrictPanel } from "./DistrictPanel";
import { LandmarkPanel } from "./LandmarkPanel";
import { SatellitePanel } from "./SatellitePanel";
import { BuildingMirrorList } from "./BuildingMirrorList";
import { RootSequenceHud } from "./RootSequenceHud";
import { WorldSummary } from "./WorldSummary";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";

// three.js loads ONLY when the 3D view is mounted (keeps the default bundle clean).
const CityMap3D = dynamic(() => import("./CityMap3D").then((m) => m.CityMap3D), {
  ssr: false,
  loading: () => <div className="city-map-2d-stage" aria-hidden="true" />,
});

/** Public city payload + the route's owner.profession extra. */
export type CityWorldData = CityProjection & {
  owner: CityProjection["owner"] & { profession: string | null };
};

/** The two world renderers over the same shared map (2026-10-02: the
 *  Isometric middle view shipped and was removed the same day — 2D + 3D
 *  only). */
type CityViewMode = "2d" | "3d";

const CITY_VIEW_STORAGE_KEY = "city-renderer";
const VIEW_MODES: readonly CityViewMode[] = ["2d", "3d"];
/** Legacy deep-link/storage values → their modern mode. */
const VIEW_ALIASES: Record<string, CityViewMode> = {
  blueprint: "2d",
  iso: "2d",
};

/**
 * View preference: `?view=2d|3d` deep link wins (and persists); otherwise the
 * stored per-browser choice; default = the 2D map. Legacy values
 * ("blueprint", "iso") map to 2D. Read post-mount so SSR HTML and the first
 * client render agree.
 */
function readCityViewPreference(): CityViewMode {
  if (typeof window === "undefined") return "2d";
  try {
    const param = new URLSearchParams(window.location.search).get("view");
    const canonical = (v: string | null): CityViewMode | null => {
      if (!v) return null;
      if ((VIEW_MODES as readonly string[]).includes(v)) return v as CityViewMode;
      return VIEW_ALIASES[v] ?? null;
    };
    const fromParam = canonical(param);
    if (fromParam) {
      window.localStorage.setItem(CITY_VIEW_STORAGE_KEY, fromParam);
      return fromParam;
    }
    const stored = canonical(window.localStorage.getItem(CITY_VIEW_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // private mode / blocked storage — stay on the default
  }
  return "2d";
}

/**
 * City world composition (2D rebuild, 2026-10-01 — CITY_2D_WORLD_STUDY.md).
 *
 * The stage is THE SHARED MAP: one canvas, always day, every visible player's
 * city fully rendered on the same absolute map; the camera opens on this
 * city's owner. Two interchangeable renderers project the identical
 * /api/city/world geometry: the 2D blueprint map (CityMap2D, default) and
 * the 3D view (CityMap3D — card-art geometry, free camera rotation). The
 * side panels and inspector are unchanged — selection flows through the same
 * store channels for both renderers.
 */
export function CityWorld({ projection }: { projection: CityWorldData }) {
  const { t } = useLanguage();
  const { play } = useSound();
  const { data: session } = useSession();
  const isOwner = session?.user?.name === projection.owner.username;
  const mapApiRef = useRef<Map2DApi | null>(null);

  const [view, setView] = useState<CityViewMode>("2d");
  useEffect(() => {
    setView(readCityViewPreference());
  }, []);

  const switchView = (next: CityViewMode) => {
    if (next === view) return;
    setView(next);
    play("changepage");
    try {
      window.localStorage.setItem(CITY_VIEW_STORAGE_KEY, next);
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.replaceState(null, "", url);
    } catch {
      // storage/URL unavailable — the in-memory switch still works
    }
  };

  // RootSequenceHud pushes countdown state INTO a scene (3D beams). The 2D
  // maps have no such visuals — accept and ignore (the countdown chip itself
  // still renders from its own query).
  const rootSeqShim = useMemo(
    () => ({ current: { setRootSequence: () => {} } }),
    []
  );

  // Reset transient world state on unmount (store is module-level).
  useEffect(() => {
    const store = cityWorldStore.getState();
    return () => store.resetWorld();
  }, []);

  return (
    <div className="city-world-root">
      <div className="relative">
        <div
          className="absolute left-2 top-2 z-20 flex overflow-hidden rounded-md border border-[#33506B]/30 bg-[#F4F1E8]/95 text-[10px] font-bold text-[#33506B] shadow-sm"
          role="group"
          aria-label={t.city2dCanvasLabel}
        >
          {(
            [
              ["2d", t.cityView2d],
              ["3d", t.cityView3d],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => switchView(mode)}
              className={
                view === mode
                  ? "px-2.5 py-1.5 bg-[#33506B] text-[#F4F1E8]"
                  : "px-2.5 py-1.5 transition-colors hover:bg-[#33506B]/10"
              }
            >
              {label}
            </button>
          ))}
        </div>
        <CityRefreshCountdown />
        {view === "3d" ? (
          <CityMap3D
            projection={projection}
            focusUsername={projection.owner.username}
            apiRef={mapApiRef}
          />
        ) : (
          <CityMap2D
            projection={projection}
            focusUsername={projection.owner.username}
            apiRef={mapApiRef}
          />
        )}
        <RootSequenceHud
          ownerUsername={projection.owner.username}
          sceneRef={rootSeqShim}
          sceneEpoch={0}
        />
        <BuildingInspector projection={projection} isOwner={isOwner} />
      </div>
      <div className="city-world-side">
        <WorldSummary projection={projection} />
        <DistrictPanel families={projection.families} isOwner={isOwner} />
        <LandmarkPanel
          landmarks={projection.landmarks}
          onFocusLandmark={(i) => mapApiRef.current?.focusLandmark(i)}
        />
        {projection.neighbors.length > 0 ? (
          <SatellitePanel
            neighbors={projection.neighbors}
            onFocusSatellite={(i) => mapApiRef.current?.focusSatellite(i)}
          />
        ) : null}
        <BuildingMirrorList
          projection={projection}
          onFocusCard={(cardId) => mapApiRef.current?.focusCard(cardId)}
        />
      </div>
    </div>
  );
}
