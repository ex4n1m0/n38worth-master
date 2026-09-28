"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import type { CityProjection } from "@/lib/city/types";
import type { UniversePayload } from "@/lib/city/universe";
import { cityWorldStore } from "@/lib/city/scene/store";
import type { CityScene } from "./scene/CityScene";
import { CitySceneHost } from "./CitySceneHost";
import { CityHud, type CityHudActions } from "./CityHud";
import { BuildingInspector } from "./BuildingInspector";
import { DistrictPanel } from "./DistrictPanel";
import { LandmarkPanel } from "./LandmarkPanel";
import { SatellitePanel } from "./SatellitePanel";
import { BuildingMirrorList } from "./BuildingMirrorList";
import { RootSequenceHud } from "./RootSequenceHud";
import { WorldSummary } from "./WorldSummary";

/** Public city payload + the route's owner.profession extra. */
export type CityWorldData = CityProjection & {
  owner: CityProjection["owner"] & { profession: string | null };
};

/**
 * Mainframe City world composition (RTS plan §Phase B deliverable 3).
 *
 * Data wiring:
 * - ["city", username] → CityScene.sync via diff (page query feeds the
 *   initial projection; Pusher ownership-changed + our invalidations keep
 *   it fresh; 120s fallback poll — the repo polling floor).
 *
 * PLACEMENT IS DERIVED (2026-09-27): every building's tile is a pure
 * function of live value order (rankArrangeTiles — landmarks + HQ center,
 * priciest rings inward, cheapest sprawl outward), recomputed on each
 * projection. There is no layout queue, no ghost, no POST — a value change
 * re-ranks the orbit and the building glides to its new ring by itself.
 */
export function CityWorld({ projection }: { projection: CityWorldData }) {
  const { data: session } = useSession();
  // Username comparison (not "is anyone logged in"): the city route is
  // public, so a logged-in VISITOR of someone else's city must not get the
  // owner-only combo button in the district panel.
  const isOwner = session?.user?.name === projection.owner.username;
  const sceneRef = useRef<CityScene | null>(null);
  // Bumped when the Pixi scene (re)mounts so the Root Sequence driver can
  // re-push its current state into the fresh instance.
  const [sceneEpoch, setSceneEpoch] = useState(0);

  // Shared universe map (2026-09-28): identical payload for every viewer
  // (CDN-cached on the server route), 5-min refresh — the client-side rank
  // orbits re-derive per viewer. Null while loading / on failure (the
  // universe simply doesn't render).
  const universeQuery = useQuery({
    queryKey: ["city-universe"],
    queryFn: async (): Promise<UniversePayload | null> => {
      const res = await fetch("/api/city/universe");
      if (!res.ok) return null;
      return (await res.json()) as UniversePayload;
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

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

  return (
    <div className="city-world-root">
      <div className="city-world-stage">
        <CitySceneHost
          projection={projection}
          universe={universeQuery.data ?? null}
          onSceneReady={(scene) => {
            sceneRef.current = scene;
            setSceneEpoch((e) => e + 1);
          }}
        />
        <CityHud actions={hudActions} sectorInfo={projection.sectorInfo} />
        <RootSequenceHud
          ownerUsername={projection.owner.username}
          sceneRef={sceneRef}
          sceneEpoch={sceneEpoch}
        />
        <BuildingInspector
          families={projection.families}
          neighbors={projection.neighbors}
          isOwner={isOwner}
        />
      </div>
      <div className="city-world-side">
        <WorldSummary projection={projection} />
        <DistrictPanel families={projection.families} isOwner={isOwner} />
        <LandmarkPanel
          landmarks={projection.landmarks}
          onFocusLandmark={(i) => sceneRef.current?.focusLandmark(i)}
        />
        {projection.neighbors.length > 0 ? (
          <SatellitePanel
            neighbors={projection.neighbors}
            onFocusSatellite={(i) => sceneRef.current?.focusSatellite(i)}
          />
        ) : null}
        <BuildingMirrorList
          projection={projection}
          onFocusCard={(cardId) => sceneRef.current?.focusCard(cardId)}
        />
      </div>
    </div>
  );
}
