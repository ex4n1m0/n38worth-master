"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minus, Plus, Crosshair } from "lucide-react";
import {
  layoutWorld,
  landmarkCanonicalIndex,
  landmarkSlotForCanonical,
  type WorldCity,
  type WorldPlot,
} from "@/lib/city/map2d/layout";
import { familyStyle } from "@/lib/city/map2d/palette";
import { cityWorldStore } from "@/lib/city/scene/store";
import { professionName } from "@/lib/professions";
import { useLanguage } from "@/components/LanguageContext";
import { useSound, playSound } from "@/hooks/useSound";
import type { CityWorldData } from "./CityWorld";
import type { Map2DApi } from "./CityMap2D";
import { CITY_WORLD_REFETCH_MS } from "./CityRefreshCountdown";
import type { City3DEngine, Hit3D } from "@/lib/city/map3d/engine";

/**
 * THE 3D WORLD VIEW — third renderer over the SAME shared world ("free
 * camera rotations" ruling, 2026-10-02): identical payload/geometry/selection
 * channels as Blueprint + Iso; the heavy three.js engine is dynamically
 * imported ONLY when this view mounts, so the default bundle stays clean.
 * Orbit: drag rotates, wheel/pinch zooms, shift/right-drag or two fingers
 * pan; tapping a tower ray-picks it into the inspector.
 */

interface WorldPayload {
  epoch: number;
  cities: WorldCity[];
  roads: { from: string; to: string }[];
  raidHits?: { username: string; hits: number }[];
  bountyTargets?: { username: string; count: number; totalReward: number }[];
}

export function CityMap3D({
  projection,
  focusUsername,
  apiRef,
}: {
  projection: CityWorldData;
  focusUsername: string;
  apiRef: React.MutableRefObject<Map2DApi | null>;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const { data: session } = useSession();
  const myUsername = session?.user?.name ?? null;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<City3DEngine | null>(null);
  const plotsRef = useRef<WorldPlot[]>([]);
  const [engineReady, setEngineReady] = useState(false);
  const [firstFrame, setFirstFrame] = useState(false);
  const [failed, setFailed] = useState(false);

  const worldQuery = useQuery<WorldPayload | null>({
    queryKey: ["city-world"],
    queryFn: async () => {
      const res = await fetch("/api/city/world");
      if (!res.ok) return null;
      return (await res.json()) as WorldPayload;
    },
    staleTime: 60_000,
    refetchInterval: CITY_WORLD_REFETCH_MS,
  });
  const world = worldQuery.data ?? null;
  const plots = useMemo(() => (world ? layoutWorld(world.cities) : []), [world]);
  useEffect(() => {
    plotsRef.current = plots;
  }, [plots]);

  // Hit routing — SAME store contract as Blueprint/Iso. Stable for a mounted
  // page (focusUsername is fixed per city view), so the engine is created once.
  const handleEngineHit = useCallback(
    (hit: Hit3D | null) => {
      playSound("click");
      const store = cityWorldStore.getState();
      if (!hit) {
        store.select(null);
        return;
      }
      const own = hit.username === focusUsername;
      if (hit.kind === "hq") {
        store.selectHq(hit.username);
      } else if (hit.kind === "landmark") {
        if (own) {
          const plot = plotsRef.current.find((p) => p.username === focusUsername);
          const canonical = plot ? landmarkCanonicalIndex(plot.city, hit.slotIndex) : -1;
          if (canonical >= 0) store.selectLandmark(canonical);
        } else store.selectUniverseCity(hit.username);
      } else if (hit.kind === "building") {
        if (own) store.select(hit.cardId);
        else store.selectUniverseBuilding({ username: hit.username, cardId: hit.cardId });
      } else if (hit.kind === "prop") {
        store.selectProp({ username: hit.username, prop: hit.prop });
      }
    },
    [focusUsername]
  );

  // ── engine lifecycle (lazy three.js import; dispose on unmount) ──
  useEffect(() => {
    let cancelled = false;
    let engine: City3DEngine | null = null;
    void (async () => {
      try {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const { City3DEngine: Engine } = await import("@/lib/city/map3d/engine");
        if (cancelled) return;
        engine = new Engine(canvas, {
          onHit: handleEngineHit,
          onFirstFrame: () => setFirstFrame(true),
        });
        engineRef.current = engine;
        const rect = wrapRef.current?.getBoundingClientRect();
        if (rect && rect.width > 10) engine.resize(rect.width, rect.height || rect.width);
        setEngineReady(true);
      } catch (err) {
        console.error("3D city engine failed to start", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, [handleEngineHit]);

  // Feed world data + keep selection highlight in sync.
  useEffect(() => {
    if (!engineRef.current || !world) return;
    engineRef.current.setWorld(world.cities, {
      roads: world.roads,
      raidHits: world.raidHits,
      bountyTargets: world.bountyTargets,
    }, focusUsername);
    const st = cityWorldStore.getState();
    engineRef.current.setSelection({
      ownUsername: myUsername ?? "",
      selectedCardId: st.selectedCardId,
      selectedUniverseBuilding: st.selectedUniverseBuilding,
    });
  }, [world, focusUsername, myUsername, engineReady]);

  useEffect(() => {
    const unsub = cityWorldStore.subscribe(() => {
      const st = cityWorldStore.getState();
      engineRef.current?.setSelection({
        ownUsername: myUsername ?? "",
        selectedCardId: st.selectedCardId,
        selectedUniverseBuilding: st.selectedUniverseBuilding,
      });
    });
    return unsub;
  }, [myUsername]);

  // Resize (square stage like the other renderers).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 10) return;
      engineRef.current?.resize(rect.width, rect.height || rect.width);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [engineReady]);

  // ── imperative API for the shell panels (same contract) ──
  useEffect(() => {
    apiRef.current = {
      focusCard: (cardId) => {
        const mine = plotsRef.current.find(
          (p) => p.username === focusUsername && p.layout.cells.some((c) => c.id === cardId)
        );
        if (!mine) return;
        const cell = mine.layout.cells.find((c) => c.id === cardId)!;
        engineRef.current?.focusCell(mine.cx + cell.x, mine.cy + cell.y, 7);
      },
      focusLandmark: (index) => {
        const mine = plotsRef.current.find((p) => p.username === focusUsername);
        if (!mine) return;
        const slot = landmarkSlotForCanonical(mine.layout, mine.city, index);
        if (!slot) return;
        engineRef.current?.focusCell(mine.cx + slot.x, mine.cy + slot.y, 7);
      },
      focusSatellite: (index) => {
        const n = projection.neighbors[index];
        if (!n) return;
        const p = plotsRef.current.find((x) => x.username === n.username);
        if (p) engineRef.current?.focusCell(p.cx, p.cy, Math.max(10, (p.half + 3) * 2.4));
      },
      zoomBy: (delta) => engineRef.current?.zoomBy(delta),
      resetCamera: () => engineRef.current?.resetCamera(),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, focusUsername, projection.neighbors]);

  const legend = useMemo(() => {
    const keys = [
      "Cryptographer",
      "Zero-Day",
      "Overclocker",
      "Cache Keeper",
      "Server Marshal",
      "Bot Herder",
    ];
    const items = keys.map((k, i) => ({
      color: familyStyle(i).fill,
      label: professionName(k, locale),
    }));
    items.push({ color: familyStyle(6).fill, label: t.catalogUnassigned });
    return items;
  }, [locale, t]);

  const myPlot = plots.find((p) => p.username === focusUsername);

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="city-map-2d-stage relative">
        {(worldQuery.isPending || !engineReady || !firstFrame) && !failed && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-[#E9E4D6]">
              <Crosshair className="h-5 w-5 animate-pulse" aria-hidden="true" />
              <span className="text-xs font-semibold">{t.city2dLoading}</span>
            </div>
          </div>
        )}
        {(failed || (world != null && world.cities.length === 0)) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="px-6 text-center text-sm text-[#E9E4D6]">
              {failed ? t.city3dUnsupported : t.city2dEmpty}
            </span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t.city3dCanvasLabel}
          className="touch-none select-none cursor-grab active:cursor-grabbing"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center">
          <span className="pointer-events-none rounded-full bg-[#F4F1E8]/85 px-3 py-1 text-[10px] font-semibold text-[#33506B]/80">
            {t.city3dHint}
          </span>
        </div>
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <MapButton
            label={t.city2dMyCity}
            onClick={() => {
              play("changepage");
              if (myPlot) engineRef.current?.focusCell(myPlot.cx, myPlot.cy, Math.max(10, (myPlot.half + 3) * 2.4));
              else engineRef.current?.fitWorld();
            }}
          />
          <MapButton
            label={t.city2dWholeMap}
            onClick={() => {
              play("changepage");
              engineRef.current?.fitWorld();
            }}
          />
          <MapButton label={t.city2dZoomIn} icon={<Plus className="h-3.5 w-3.5" />} onClick={() => engineRef.current?.zoomBy(1)} />
          <MapButton label={t.city2dZoomOut} icon={<Minus className="h-3.5 w-3.5" />} onClick={() => engineRef.current?.zoomBy(-1)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-gray-500">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px] bg-[#F5C518]" />
          {t.city2dLandmark}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-2 border-dashed border-[#E8590C]" />
          {t.city2dYou}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#C0392B]" />
          {t.city2dBountyTarget}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#8B2E2E]" />
          {t.city2dRaided}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-[#2F5226] bg-[#6FA35C]" />
          {t.city2dAlbumProp}
        </span>
      </div>
    </div>
  );
}

function MapButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#33506B]/30 bg-[#F4F1E8]/95 text-[10px] font-bold text-[#33506B] shadow-sm transition-colors hover:border-[#33506B]/70"
    >
      {icon ?? <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}
