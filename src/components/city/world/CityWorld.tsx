"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { getCityWorldStore } from "@/hooks/useCityWorldStore";
import { useCityLayoutEvents } from "@/hooks/useCityLayoutEvents";
import { cityWorldStore, type PlaceMode } from "@/lib/city/scene/store";
import type { CityProjection, OwnerCityLayout } from "@/lib/city/types";
import type { CityScene } from "./scene/CityScene";
import { CitySceneHost } from "./CitySceneHost";
import { CityHud, type CityHudActions } from "./CityHud";
import { BuildingInspector } from "./BuildingInspector";
import { DistrictPanel } from "./DistrictPanel";
import { LandmarkPanel } from "./LandmarkPanel";
import { PlacementQueue } from "./PlacementQueue";
import { BuildingMirrorList } from "./BuildingMirrorList";
import { RootSequenceHud } from "./RootSequenceHud";
import { WorldSummary } from "./WorldSummary";

/** Public city payload + the route's owner.profession extra. */
export type CityWorldData = CityProjection & {
  owner: CityProjection["owner"] & { profession: string | null };
};

/** POST /api/city/layout body (layoutPatchSchema shape, schema-owned). */
interface LayoutPatchBody {
  baseVersion: number;
  placements: Array<{
    cardId: number;
    sector: string;
    x: number;
    y: number;
    rotation: number;
    variant: number;
  }>;
  removedCardIds?: number[];
}

/**
 * Mainframe City world composition (RTS plan §Phase B deliverable 3).
 *
 * Data wiring:
 * - ["city", username]  → CityScene.sync via diff (page query feeds the
 *   initial projection; Pusher ownership-changed + our invalidations keep
 *   it fresh; 120s fallback poll — the repo polling floor).
 * - ["city-layout"]     → owner-only GET /api/city/my-layout (no-store),
 *   staleTime 60s, NO polling — `city-layout-updated` Pusher events and
 *   mutation success invalidate it.
 * - Layout mutations: ONE batched POST per interaction end (Enter / the
 *   commit button), NEVER optimistic — buildings appear only after the
 *   server projection confirms. 409 → refetch both keys.
 *
 * The keyboard layer runs on window CAPTURE so Escape (and place-mode
 * arrows/Enter) wins over ComboDock's bubble-phase handler while a world
 * mode is active; c / / / 1-6 pass through untouched, and the typing guard
 * matches ComboDock's.
 */
export function CityWorld({ projection }: { projection: CityWorldData }) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { play } = useSound();
  const username = projection.owner.username;
  // Username comparison (not "is anyone logged in"): the city route is
  // public, so a logged-in VISITOR of someone else's city must not get the
  // owner-only layout queue / combo button.
  const isOwner = session?.user?.name === username;
  const sceneRef = useRef<CityScene | null>(null);
  // Bumped when the Pixi scene (re)mounts so the Root Sequence driver can
  // re-push its current state into the fresh instance.
  const [sceneEpoch, setSceneEpoch] = useState(0);

  const cityQuery = useQuery<CityWorldData>({
    queryKey: ["city", username],
    queryFn: async () => {
      const res = await fetch(`/api/city/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error("Failed to fetch city");
      return res.json();
    },
    initialData: projection,
    enabled: !!username,
    refetchInterval: 120_000,
  });
  const city = cityQuery.data ?? projection;

  const layoutQuery = useQuery<OwnerCityLayout>({
    queryKey: ["city-layout"],
    queryFn: async () => {
      const res = await fetch("/api/city/my-layout");
      if (!res.ok) throw new Error("Failed to fetch layout");
      return res.json();
    },
    enabled: isOwner,
    staleTime: 60_000,
  });

  const baseVersion = layoutQuery.data?.layoutVersion ?? 0;

  const layoutMutation = useMutation({
    mutationFn: async (body: LayoutPatchBody) => {
      const res = await fetch("/api/city/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const err = new Error(data.error || "Layout save failed");
        Object.assign(err, { status: res.status });
        throw err;
      }
      return data;
    },
    onSuccess: async (_data, variables) => {
      play("reward");
      // Just-placed spawn marker (Phase C polish d): the POST SUCCEEDED, so
      // the server has confirmed this tile — celebrating here is not
      // optimism. The building itself still only appears via the refetched
      // projection.
      const first = variables.placements[0];
      if (first) {
        sceneRef.current?.celebratePlacement({
          sector: first.sector,
          x: first.x,
          y: first.y,
        });
      }
      getCityWorldStore().endPlaceMode();
      // NEVER optimistic: invalidate and let the server projection speak.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["city"] }),
        queryClient.invalidateQueries({ queryKey: ["city-layout"] }),
      ]);
    },
    onError: (err: Error) => {
      play("error");
      if ((err as { status?: number }).status === 409) {
        // Version mismatch / tile raced — refetch BOTH keys and keep the ghost.
        toast.info(t.cityLayoutConflict);
        void queryClient.invalidateQueries({ queryKey: ["city"] });
        void queryClient.invalidateQueries({ queryKey: ["city-layout"] });
      } else {
        toast.error(t.cityLayoutSaveError);
      }
    },
  });

  useCityLayoutEvents(session?.user?.id);

  /** ONE batched POST at interaction end (Enter key or commit button). */
  const commitPlacement = useCallback(
    (place: PlaceMode) => {
      layoutMutation.mutate({
        baseVersion,
        placements: [
          {
            cardId: place.cardId,
            sector: place.tile.sector,
            x: place.tile.x,
            y: place.tile.y,
            rotation: 0,
            variant: 0,
          },
        ],
      });
    },
    [layoutMutation, baseVersion]
  );

  const commitFromStore = useCallback(() => {
    const place = getCityWorldStore().placeMode;
    if (place) commitPlacement(place);
  }, [commitPlacement]);

  const onRelocate = useCallback((cardId: number) => {
    getCityWorldStore().setBuildMode(false);
    sceneRef.current?.startPlacement(cardId);
  }, []);

  // ── window-capture keyboard layer (place mode / build mode) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const state = getCityWorldStore();
      if (!state.placeMode && !state.buildMode) return; // no world mode → ComboDock rules
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest?.(
        "input, textarea, select, [contenteditable=true]"
      );
      if (e.key === "Escape") {
        if (typing) return; // same guard as ComboDock
        e.preventDefault();
        // Capture + stopPropagation → wins over ComboDock's Esc (bubble).
        e.stopPropagation();
        if (state.placeMode) state.endPlaceMode();
        else state.setBuildMode(false);
        return;
      }
      if (!state.placeMode || typing || e.metaKey || e.ctrlKey || e.altKey) return;
      // c / / / 1-6 are deliberately untouched — ComboDock keeps working.
      const step: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const delta = step[e.key];
      if (delta) {
        e.preventDefault();
        e.stopPropagation();
        state.moveGhost(delta[0], delta[1]);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commitFromStore();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [commitFromStore]);

  const hudActions = useMemo<CityHudActions>(
    () => ({
      zoomIn: () => sceneRef.current?.zoomBy(0.2),
      zoomOut: () => sceneRef.current?.zoomBy(-0.2),
      reset: () => sceneRef.current?.resetCamera(),
    }),
    []
  );

  // Reset transient world state on unmount (store is module-level).
  useEffect(() => {
    const store = cityWorldStore.getState();
    return () => store.resetWorld();
  }, []);

  const queue = layoutQuery.data?.queue ?? null;

  return (
    <div className="city-world-root">
      <div className="city-world-stage">
        <CitySceneHost
          projection={city}
          queue={queue}
          onSceneReady={(scene) => {
            sceneRef.current = scene;
            setSceneEpoch((e) => e + 1);
          }}
          onRelocate={onRelocate}
        />
        <CityHud
          actions={hudActions}
          onCommitPlacement={commitFromStore}
          placementPending={layoutMutation.isPending}
          sectorInfo={city.sectorInfo}
          readOnly={!isOwner}
        />
        <RootSequenceHud
          ownerUsername={username}
          sceneRef={sceneRef}
          sceneEpoch={sceneEpoch}
        />
        <WorldSummary projection={city} />
        <BuildingInspector families={city.families} queue={queue} />
      </div>
      <div className="city-world-side">
        <DistrictPanel families={city.families} isOwner={isOwner} />
        <LandmarkPanel
          landmarks={city.landmarks}
          onFocusLandmark={(i) => sceneRef.current?.focusLandmark(i)}
        />
        {isOwner ? (
          <PlacementQueue
            queue={layoutQuery.data?.queue}
            loading={layoutQuery.isPending}
            onPlace={(cardId) => sceneRef.current?.startPlacement(cardId)}
            disabled={layoutMutation.isPending}
          />
        ) : null}
        <BuildingMirrorList
          projection={city}
          queue={queue}
          onFocusCard={(cardId) => sceneRef.current?.focusCard(cardId)}
        />
      </div>
    </div>
  );
}
