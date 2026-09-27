/**
 * Mainframe City — world UI store (zustand VANILLA, node-safe).
 *
 * A single module-level store shared by the React shell (HUD / inspector /
 * queue / mirror list) and the imperative Pixi scene (which pushes camera
 * snapshots and ghost-validity reports into it). Vanilla `createStore` keeps
 * this importable from the node-env vitest suite; the typed React binding
 * lives in src/hooks/useCityWorldStore.ts.
 *
 * SELECTOR RULE (project gotcha): selectors must return STABLE references
 * (primitives or refs the store replaces wholesale, like `camera`) — never
 * fresh arrays/objects, or useSyncExternalStore will loop. Derive composite
 * values with useMemo at the call site.
 */

import { createStore } from "zustand/vanilla";
import type { PlacementIssue, TileRef } from "../placement";
import { stepGhostTile } from "../placement";
import { LOD_DISTRICT, type Lod } from "./lod";

export interface CityCameraSnapshot {
  x: number;
  y: number;
  zoom: number;
}

/** Building placement in progress (ghost tile). */
export interface PlaceMode {
  cardId: number;
  tile: TileRef;
}

export interface CityWorldState {
  /** Interaction-end camera snapshot (HUD sector label; NOT 60fps live). */
  camera: CityCameraSnapshot;
  /** Sector index under the camera center (-1 = between sectors). */
  cameraSector: number;
  /** Current LOD band (world/district/close), pushed on camera settle. */
  lod: Lod;
  /** Currently selected building cardId (inspector). */
  selectedCardId: number | null;
  /** Selected goddess landmark index 0..5 (power panel, Phase E). */
  selectedLandmark: number | null;
  /** Active ghost placement, or null. */
  placeMode: PlaceMode | null;
  /** Current ghost validity (null = valid) — computed by the scene. */
  placeIssue: PlacementIssue | null;
  /** Tile under the pointer while a world mode is active. */
  hoverTile: TileRef | null;
  /** prefers-reduced-motion, resolved by the React shell. */
  reducedMotion: boolean;
  /** Build mode: tapping a placed building picks it back into the queue. */
  buildMode: boolean;
  /**
   * Sector index the player TAPPED while locked (peek). Pan bounds keep the
   * camera centered on unlocked sectors, so a locked sector can never be the
   * CENTERED one — tapping its pad is the discovery gesture for the HUD's
   * "unlocks at N" line. Cleared on the next camera settle that actually
   * MOVES the camera (an idle settle keeps it — see setCameraSnapshot).
   */
  lockedPeekSector: number | null;

  setCameraSnapshot: (camera: CityCameraSnapshot, sector: number) => void;
  setLockedPeek: (sector: number | null) => void;
  setLod: (lod: Lod) => void;
  select: (cardId: number | null) => void;
  selectLandmark: (index: number | null) => void;
  startPlaceMode: (cardId: number, tile: TileRef) => void;
  moveGhost: (dx: number, dy: number) => void;
  setGhostTile: (tile: TileRef) => void;
  setGhostValidity: (issue: PlacementIssue | null) => void;
  setHoverTile: (tile: TileRef | null) => void;
  endPlaceMode: () => void;
  setReducedMotion: (reduced: boolean) => void;
  setBuildMode: (on: boolean) => void;
  /** Full reset (world unmount / WebGL remount) so state never leaks. */
  resetWorld: () => void;
}

const initial = {
  camera: { x: 0, y: 0, zoom: 1 },
  cameraSector: 0,
  lockedPeekSector: null as number | null,
  // Initial framing is the HOME_ZOOM district view — matches CityScene.
  lod: LOD_DISTRICT as Lod,
  selectedCardId: null as number | null,
  selectedLandmark: null as number | null,
  placeMode: null as PlaceMode | null,
  placeIssue: null as PlacementIssue | null,
  hoverTile: null as TileRef | null,
  reducedMotion: false,
  buildMode: false,
};

export const cityWorldStore = createStore<CityWorldState>()((set) => ({
  ...initial,
  // A settle whose camera + sector are unchanged is the idle follow-up of a
  // tap (pointerdown/up always schedule one) — it must NOT clear the peek
  // that same tap just set, or the HUD line flashes for <180ms and vanishes.
  setCameraSnapshot: (camera, sector) =>
    set((s) => {
      const idle =
        s.camera.x === camera.x &&
        s.camera.y === camera.y &&
        s.camera.zoom === camera.zoom &&
        s.cameraSector === sector;
      return {
        camera: { ...camera },
        cameraSector: sector,
        lockedPeekSector: idle ? s.lockedPeekSector : null,
      };
    }),
  setLockedPeek: (sector) => set({ lockedPeekSector: sector }),
  setLod: (lod) => set({ lod }),
  select: (cardId) => set({ selectedCardId: cardId }),
  selectLandmark: (index) => set({ selectedLandmark: index }),
  startPlaceMode: (cardId, tile) =>
    set({ placeMode: { cardId, tile: { ...tile } }, placeIssue: null, selectedCardId: null }),
  moveGhost: (dx, dy) =>
    set((s) =>
      s.placeMode
        ? { placeMode: { ...s.placeMode, tile: stepGhostTile(s.placeMode.tile, dx, dy) } }
        : s
    ),
  setGhostTile: (tile) =>
    set((s) => (s.placeMode ? { placeMode: { ...s.placeMode, tile: { ...tile } } } : s)),
  setGhostValidity: (issue) => set({ placeIssue: issue }),
  setHoverTile: (tile) => set({ hoverTile: tile ? { ...tile } : null }),
  endPlaceMode: () => set({ placeMode: null, placeIssue: null, hoverTile: null }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  setBuildMode: (on) => set({ buildMode: on }),
  resetWorld: () => set({ ...initial }),
}));

/** Type-only re-export for the hook file (no React import here). */
export type { PlacementIssue, TileRef } from "../placement";
