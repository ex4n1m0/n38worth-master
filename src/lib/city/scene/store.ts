/**
 * Mainframe City — world UI store (zustand VANILLA, node-safe).
 *
 * A single module-level store shared by the React shell (HUD / inspector /
 * mirror list) and the imperative Pixi scene (which pushes camera snapshots
 * into it). Vanilla `createStore` keeps this importable from the node-env
 * vitest suite; the typed React binding lives in
 * src/hooks/useCityWorldStore.ts.
 *
 * SELECTOR RULE (project gotcha): selectors must return STABLE references
 * (primitives or refs the store replaces wholesale, like `camera`) — never
 * fresh arrays/objects, or useSyncExternalStore will loop. Derive composite
 * values with useMemo at the call site.
 *
 * Placement state is GONE (2026-09-27): building tiles are derived from
 * live value order (rankArrangeTiles) and recomputed on every projection
 * sync, so there is no ghost, no build mode, and no queue left to track.
 */

import { createStore } from "zustand/vanilla";
import { LOD_DISTRICT, type Lod } from "./lod";

export interface CityCameraSnapshot {
  x: number;
  y: number;
  zoom: number;
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
  /**
   * Selected SATELLITE building (steal surface): the neighbor is identified
   * by its OWN card id (stable across value re-ordering of the neighbors
   * array), the building by its card id. One inspector at a time — the
   * scene/canvas taps clear selectedCardId/selectedLandmark when this is
   * set and vice versa (same rule the landmark selection follows).
   */
  selectedForeign: { owner: number; cardId: number } | null;
  /** Selected goddess landmark index 0..5 (power panel). */
  selectedLandmark: number | null;
  /**
   * Selected UNIVERSE city username (2026-09-28): tapping a marker or lazy
   * mini city on the shared map selects it for the HUD chip + visit link.
   * Mutually exclusive with building/foreign/landmark selection (enforced
   * centrally in the actions below).
   */
  selectedUniverseCity: string | null;
  /**
   * Universe summary for the HUD chip (set by the scene on universe sync):
   * how many cities the shared map holds + the viewer's rank (null when
   * beyond the mapped cap).
   */
  universeSummary: { count: number; myRank: number | null } | null;
  /** prefers-reduced-motion, resolved by the React shell. */
  reducedMotion: boolean;
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
  selectForeign: (sel: { owner: number; cardId: number } | null) => void;
  selectLandmark: (index: number | null) => void;
  selectUniverseCity: (username: string | null) => void;
  setUniverseSummary: (summary: { count: number; myRank: number | null } | null) => void;
  setReducedMotion: (reduced: boolean) => void;
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
  selectedForeign: null as { owner: number; cardId: number } | null,
  selectedLandmark: null as number | null,
  selectedUniverseCity: null as string | null,
  universeSummary: null as { count: number; myRank: number | null } | null,
  reducedMotion: false,
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
  // One inspector at a time: every selection action clears the others.
  select: (cardId) =>
    set({ selectedCardId: cardId, selectedForeign: null, selectedLandmark: null, selectedUniverseCity: null }),
  selectForeign: (sel) =>
    set({ selectedForeign: sel, selectedCardId: null, selectedLandmark: null, selectedUniverseCity: null }),
  selectLandmark: (index) =>
    set({ selectedLandmark: index, selectedCardId: null, selectedForeign: null, selectedUniverseCity: null }),
  selectUniverseCity: (username) =>
    set({ selectedUniverseCity: username, selectedCardId: null, selectedForeign: null, selectedLandmark: null }),
  setUniverseSummary: (summary) => set({ universeSummary: summary }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  resetWorld: () => set({ ...initial }),
}));

/** Type-only re-export for the hook file (no React import here). */
export type { TileRef } from "../placement";
