"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { CityBuilding } from "@/lib/city/types";
import type { CityScene, CitySceneProjection } from "./scene/CityScene";
import { DistrictOverview, SceneErrorBoundary } from "./SceneErrorBoundary";

/** pixi.js chunk — client-only, never in the server bundle (ADR §D1). */
const CitySceneMount = dynamic(() => import("./CitySceneMount"), {
  ssr: false,
  loading: () => <div className="city-world-loading" aria-hidden="true" />,
});

interface CitySceneHostProps {
  projection: CitySceneProjection;
  queue: readonly CityBuilding[] | null;
  onSceneReady: (scene: CityScene) => void;
  onRelocate: (cardId: number) => void;
}

/**
 * WebGL fallback ladder (runtime degradation, not redeploy):
 *   context lost (1st) → remount the scene once (fresh Application)
 *   context lost (2nd) / init failure / chunk error → DistrictOverview
 *   (the existing CityGrid over the same projection)
 * Kill switch: `city_enabled` flag off.
 */
export function CitySceneHost({
  projection,
  queue,
  onSceneReady,
  onRelocate,
}: CitySceneHostProps) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  const onContextLost = useCallback(() => {
    setAttempt((a) => a + 1); // 0→1 remount, 1→2 gives up
  }, []);

  const onError = useCallback(() => setFailed(true), []);

  useEffect(() => {
    if (attempt > 1) setFailed(true);
  }, [attempt]);

  if (failed) {
    return <DistrictOverview families={projection.families} />;
  }

  return (
    <SceneErrorBoundary families={projection.families}>
      <CitySceneMount
        key={attempt}
        projection={projection}
        queue={queue}
        onSceneReady={onSceneReady}
        onContextLost={onContextLost}
        onError={onError}
        onRelocate={onRelocate}
      />
    </SceneErrorBoundary>
  );
}
