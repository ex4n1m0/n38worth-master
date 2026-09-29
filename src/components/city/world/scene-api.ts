/**
 * Mainframe City — the scene contract both renderers satisfy.
 *
 * Structural interface: the Pixi CityScene satisfies it today; the three.js
 * ThreeScene (scene3d/) satisfies it behind the renderer flag. The React
 * shell (CityWorld panels, RootSequenceHud, CitySceneMount) holds ONLY this
 * type, so neither renderer's module graph leaks into the other's chunk.
 */

import type { RootSequenceVisualState } from "@/lib/city/root-sequence";
import type { UniversePayload } from "@/lib/city/universe";
import type { CivicKind } from "@/lib/city/types";
import type {
  CitySceneInit,
  CitySceneProjection,
  CitySceneStrings,
} from "./scene/CityScene";

export type { CitySceneInit, CitySceneProjection, CitySceneStrings };

export interface CitySceneApi {
  setStrings(strings: Partial<CitySceneStrings>): void;
  setCityDetailFetcher(
    fetcher:
      | ((username: string) => Promise<CitySceneProjection | null>)
      | null
  ): void;
  sync(projection: CitySceneProjection): void;
  syncUniverse(payload: UniversePayload | null, viewerUsername: string): void;
  setSelected(cardId: number | null): void;
  setSelectedForeign(sel: { owner: number; cardId: number } | null): void;
  setSelectedLandmark(index: number | null): void;
  setSelectedCivic(kind: CivicKind | null): void;
  setSelectedUniverseCity(username: string | null): void;
  setSelectedUniverseBuilding(sel: {
    username: string;
    cardId: number;
  } | null): void;
  setSelectedHq(username: string | null): void;
  setReducedMotion(reduced: boolean): void;
  setRootSequence(state: RootSequenceVisualState): void;
  focusCard(cardId: number): void;
  focusSatellite(slot: number): void;
  focusLandmark(index: number): void;
  zoomBy(delta: number): void;
  resetCamera(): void;
  destroy(): void;
}
