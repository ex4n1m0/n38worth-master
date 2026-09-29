"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { CitySceneApi, CitySceneProjection } from "./scene-api";
import type { UniversePayload } from "@/lib/city/universe";
import { DistrictOverview, SceneErrorBoundary } from "./SceneErrorBoundary";

/** Renderer chunk (pixi or three — scene-api flag pick) — client-only. */
const CitySceneMount = dynamic(() => import("./CitySceneMount"), {
  ssr: false,
  loading: () => <div className="city-world-loading" aria-hidden="true" />,
});

interface CitySceneHostProps {
  projection: CitySceneProjection;
  /** Shared universe map payload (null while loading / on failure). */
  universe: UniversePayload | null;
  onSceneReady: (scene: CitySceneApi) => void;
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
  universe,
  onSceneReady,
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
        universe={universe}
        onSceneReady={onSceneReady}
        onContextLost={onContextLost}
        onError={onError}
      />
    </SceneErrorBoundary>
  );
}
