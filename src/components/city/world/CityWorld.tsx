"use client";

import { useEffect, useMemo, useRef } from "react";
import { useSession } from "next-auth/react";
import type { CityProjection } from "@/lib/city/types";
import { cityWorldStore } from "@/lib/city/scene/store";
import { CityMap2D, type Map2DApi } from "./CityMap2D";
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
 * City world composition (2D rebuild, 2026-10-01 — CITY_2D_WORLD_STUDY.md).
 *
 * The stage is now THE SHARED 2D BLUEPRINT MAP (CityMap2D): one static
 * canvas, always day, every visible player's city fully rendered on the same
 * absolute map; the camera opens on this city's owner. The side panels and
 * inspector are unchanged — selection flows through the same store channels
 * the 3D/2.5D scenes used. Always-day ruling: no art-style / daylight HUD.
 */
export function CityWorld({ projection }: { projection: CityWorldData }) {
  const { data: session } = useSession();
  const isOwner = session?.user?.name === projection.owner.username;
  const mapApiRef = useRef<Map2DApi | null>(null);

  // RootSequenceHud pushes countdown state INTO a scene (3D beams). The 2D
  // map has no such visuals — accept and ignore (the countdown chip itself
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
        <CityMap2D
          projection={projection}
          focusUsername={projection.owner.username}
          apiRef={mapApiRef}
        />
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
