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

/**
 * Dev performance overlay snapshot (engine-audit §3.3), pushed by the scene
 * at ≤2 Hz WHILE RENDERING — with render-on-demand the scene sleeps when
 * idle, so fps=0 there means "no renders requested", not jank.
 */
export interface CityPerfSnapshot {
  fps: number;
  frameMs: number;
  spritesTotal: number;
  spritesVisible: number;
  lod: Lod;
  daylight: number;
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
   * Selected BUILDING inside a UNIVERSE mini city (2026-09-28 "select
   * buildings on other cities"): identified by the city owner's username +
   * the building card id. Inspector resolves it against that city's public
   * projection (["city", username] query) and offers the hire/steal action.
   */
  selectedUniverseBuilding: { username: string; cardId: number } | null;
  /**
   * Selected HQ CORE (2026-09-28 "select the core building"): the username
   * of the core's owner — the own city's owner (own core) or a foreign city
   * (satellite relay / universe relay). Drives the HQ inspector panel.
   */
  selectedHq: string | null;
  /**
   * Universe summary for the HUD chip (set by the scene on universe sync):
   * how many cities the shared map holds + the viewer's rank (null when
   * beyond the mapped cap).
   */
  universeSummary: { count: number; myRank: number | null } | null;
  /** Dev perf overlay snapshot (dev builds; null until the first push). */
  perf: CityPerfSnapshot | null;
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
  selectUniverseBuilding: (sel: { username: string; cardId: number } | null) => void;
  selectHq: (username: string | null) => void;
  setUniverseSummary: (summary: { count: number; myRank: number | null } | null) => void;
  setReducedMotion: (reduced: boolean) => void;
  /** Dev perf overlay push (≤2 Hz, dev builds only). */
  setPerf: (perf: CityPerfSnapshot) => void;
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
  selectedUniverseBuilding: null as { username: string; cardId: number } | null,
  selectedHq: null as string | null,
  universeSummary: null as { count: number; myRank: number | null } | null,
  reducedMotion: false,
  perf: null as CityPerfSnapshot | null,
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
    set({ selectedCardId: cardId, selectedForeign: null, selectedLandmark: null, selectedUniverseCity: null, selectedUniverseBuilding: null, selectedHq: null }),
  selectForeign: (sel) =>
    set({ selectedForeign: sel, selectedCardId: null, selectedLandmark: null, selectedUniverseCity: null, selectedUniverseBuilding: null, selectedHq: null }),
  selectLandmark: (index) =>
    set({ selectedLandmark: index, selectedCardId: null, selectedForeign: null, selectedUniverseCity: null, selectedUniverseBuilding: null, selectedHq: null }),
  selectUniverseCity: (username) =>
    set({ selectedUniverseCity: username, selectedCardId: null, selectedForeign: null, selectedLandmark: null, selectedUniverseBuilding: null, selectedHq: null }),
  selectUniverseBuilding: (sel) =>
    set({ selectedUniverseBuilding: sel, selectedCardId: null, selectedForeign: null, selectedLandmark: null, selectedUniverseCity: null, selectedHq: null }),
  selectHq: (username) =>
    set({ selectedHq: username, selectedCardId: null, selectedForeign: null, selectedLandmark: null, selectedUniverseCity: null, selectedUniverseBuilding: null }),
  setUniverseSummary: (summary) => set({ universeSummary: summary }),
  setReducedMotion: (reduced) => set({ reducedMotion: reduced }),
  setPerf: (perf) => set({ perf }),
  resetWorld: () => set({ ...initial }),
}));

/** Type-only re-export for the hook file (no React import here). */
export type { TileRef } from "../placement";
