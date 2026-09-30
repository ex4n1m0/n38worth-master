/**
 * Mainframe City 3D — scene controller (client-only three.js; the ONLY
 * module that owns a WebGLRenderer). P0 spike of the renderer swap
 * (CITY_3D_ENGINE_STUDY.md §8): same public contract as the Pixi
 * CityScene, mounted through CitySceneMount behind the
 * NEXT_PUBLIC_CITY_RENDERER / ?renderer=three flag.
 *
 * What this P0 delivers:
 * - ORTHOGRAPHIC camera at yaw 45° / elevation 30° via the pure camera3d
 *   adapter — pixel-parity with the 2:1 iso projection (vitest-pinned).
 * - The existing CameraRig (DOM input → pure camera math) drives it
 *   unchanged; pan/zoom/pinch/keys behave identically.
 * - Procedural family/tier geometry (building3d.ts) placed by the SAME
 *   derived value-orbit placement (rankArrangeTiles), with re-rank glides.
 * - Render-on-demand (no implicit loop — three renders only when asked),
 *   DPR cap 2, context-lost ladder hook, day/night tint cycle.
 *
 * Deliberately NOT in P0 (staged, see the study): satellites/universe
 * layers, window mosaics + light clock, streets/paths, FX bursts, chips
 * and billboards (P1/P2).
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import { GRID_SIZE, SECTOR_KEYS } from "@/lib/city/layout-schema";
import type { CityBuilding, CivicKind } from "@/lib/city/types";
import { lodFor } from "@/lib/city/scene/lod";
import { resolveMotion, type MotionPolicy } from "@/lib/city/scene/motion";
import { daylightAt, facadeGlowAt } from "@/lib/city/scene/daylight";
import { LIGHT_STEP_MS, windowFlickerAt } from "@/lib/city/scene/lights";
import {
  clampCamera,
  ZOOM_MIN,
  type CameraState,
} from "@/lib/city/scene/camera";
import { globalTile, pickTile, screenToTile, tileToScreen, TILE_W } from "@/lib/city/scene/iso";
import {
  CAM_FAR,
  CAM_NEAR,
  cameraPlacement,
  orthoFrame,
  PIXEL_RISE,
  projectToScreen,
  tileToGround,
  worldPxToGround,
} from "@/lib/city/scene/camera3d";
import { rankArrangeTiles, tileRefKey, type TileRef } from "@/lib/city/placement";
import { cityWorldStore } from "@/lib/city/scene/store";
import type {
  CitySceneCallbacks,
  CitySceneInit,
  CitySceneProjection,
  CitySceneStrings,
} from "../scene/CityScene";
import { CameraRig } from "../scene/CameraRig";
import type { RootSequenceVisualState } from "@/lib/city/root-sequence";
import type { UniversePayload } from "@/lib/city/universe";
import { LANDMARK_COLORS } from "@/lib/city/landmark-colors";
import {
  buildBuildingGeometry,
  buildHqGeometry,
  buildMonumentGeometry,
  buildSelectionRingGeometry,
  familyTopHeightPx,
  groundPlateHalfExtent,
  MeshBuilder,
} from "./building3d";
import {
  buildAggregateGeometry,
  buildLockedPadsGeometry,
  buildProtectionRingsGeometry,
  buildSatelliteCluster,
  buildStreetsGeometry,
  buildUniverseCityBuildingsGeometry,
  deriveHomeStreets,
  deriveUniverseMarkers,
  type UniverseMarker,
} from "./world3d";
import {
  loadAvatarTexture,
  onAvatarTextureReady,
  resetAvatarTextures3d,
} from "./avatars3d";
import {
  HQ_TILE,
  LANDMARK_RING_SPAN_PX,
  landmarkTile,
  moatTileKeys,
  reservedTileKeys,
  worldPointOfTile,
} from "./tiles";

const DEFAULT_STRINGS: CitySceneStrings = {
  coreTag: "CORE",
  lostSignalLabel: "SIGNAL LOST",
  tierUpLabel: (tier) => `T${tier}`,
  displayName: (username) => username,
  satelliteMoreLabel: (count) => `+${count}`,
  sectorLabel: (info) => (info.index === 0 ? "BOOT" : ""),
  civicName: (kind) => kind,
};

const MAX_DPR = 2;
const HOME_ZOOM = 0.75;
/** Re-rank glide duration + cap — same feel as the Pixi scene. */
const MOVE_GLIDE_MS = 460;
const MOVE_GLIDE_CAP = 96;
/** Daylight re-check cadence (P0; P1 tracks ramps continuously). */
const DAYLIGHT_POLL_MS = 15_000;
const PERF_PUSH_MS = 500;

/** Authored palette anchors (day/night pairs from the 2D system). */
const SKY_NIGHT = new Color("#05060a");
const SKY_DAY = new Color("#6f9ed8");
const GRASS_NIGHT = new Color("#1f2a21");
const GRASS_DAY = new Color("#6b9c52");
const SELECTION_COLOR = 0x4f8dff;
/** Lit-window warm base (linear) — matches building3d's WINDOW_WARM. */
const WINDOW_WARM_LINEAR = new Color("#ffd9a0");

interface BuildingMeshEntry {
  mesh: Mesh;
  profession: string | null;
  tier: number;
  protection: string;
}

export class ThreeScene {
  private readonly host: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera;
  private readonly callbacks: CitySceneCallbacks;

  /** One shared vertex-color material per role — the day/night tint lever. */
  private readonly buildingMaterial: MeshBasicMaterial;
  private readonly groundMaterial: MeshBasicMaterial;
  private readonly ringMaterial: MeshBasicMaterial;
  /**
   * Window channel materials (light identity): every building's seeded
   * lit-pane mosaic renders through FOUR SHARED materials (channel A/B ×
   * cardId parity), so the occupancy churn + day/night glow animates by
   * touching four colors per light-clock step — zero per-vertex updates —
   * while half the city flickers out of phase with the other half.
   */
  private readonly windowMaterials: MeshBasicMaterial[];

  private readonly buildingsGroup = new Group();
  private readonly fixtures = new Group();
  private readonly worldLayers = new Group();
  private readonly satellitesGroup = new Group();
  private groundMesh: Mesh | null = null;
  private hqMesh: Mesh | null = null;
  private hqKey = "";
  private readonly monuments: Array<{ mesh: Mesh; key: string }> = [];
  private selectionRing: Mesh | null = null;

  /** World layers (one merged mesh each; rebuilt per sync — pure derived). */
  private streetsMesh: Mesh | null = null;
  private streetMaterial: MeshBasicMaterial;
  private lockedPadsMesh: Mesh | null = null;
  private lockedPadMaterial: MeshBasicMaterial;
  private aggregateMesh: Mesh | null = null;
  private protectionMesh: Mesh | null = null;
  private flatMaterial: MeshBasicMaterial;
  private universeMesh: Mesh | null = null;
  private universeMarkers: UniverseMarker[] = [];

  /** Satellite clusters by slot: mesh + picking tile map + anchor. */
  private readonly satelliteBuilds = new Map<
    number,
    {
      mesh: Mesh;
      tiles: Map<string, number>;
      owner: number;
      anchorWorld: { x: number; y: number };
    }
  >();

  /** DOM chip overlay (selection name / HQ plate / sector labels). */
  private chipsRoot: HTMLDivElement | null = null;
  /** Avatar billboard plane above the selected building. */
  private billboard: Mesh | null = null;
  private billboardFor: string | null = null;
  private avatarTeardown: (() => void) | null = null;
  /** Construct pop-in tweens (scale.y 0→1). */
  private readonly growing: Array<{ mesh: Mesh; start: number }> = [];
  /** Root Sequence beams (additive, light-clock pulsed; null = idle). */
  private rootBeams: Mesh | null = null;
  private rootActive = false;

  private readonly buildings = new Map<number, BuildingMeshEntry>();
  private readonly occupancy = new Map<string, number>();
  private readonly cardTiles = new Map<number, TileRef>();
  private readonly buildingsById = new Map<number, CityBuilding>();

  private readonly reserved = reservedTileKeys();
  private readonly moat = moatTileKeys();

  private rig!: CameraRig;
  private ro!: ResizeObserver;
  private policy: MotionPolicy;
  private strings: CitySceneStrings = DEFAULT_STRINGS;
  private lod: "world" | "district" | "close" = "district";
  private sectorCount = 1;
  private lastProjection: CitySceneProjection | null = null;
  private selectedCardId: number | null = null;

  private readonly moving: Array<{
    mesh: Mesh;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    start: number;
  }> = [];

  private daylight = 0;
  private daylightTimer: ReturnType<typeof setTimeout> | null = null;
  /** Light-clock timer (window occupancy churn; reduced motion keeps it off). */
  private lightsTimer: ReturnType<typeof setTimeout> | null = null;

  private dirty = true;
  private raf = 0;
  private destroyed = false;
  private frameEma = 0;
  private lastRenderAt = 0;
  private lastPerfPush = 0;
  private cityDetailFetcher:
    | ((username: string) => Promise<CitySceneProjection | null>)
    | null = null;

  private constructor(init: CitySceneInit) {
    this.host = init.host;
    this.callbacks = init.callbacks;
    this.policy = resolveMotion(init.reducedMotion);
    this.sectorCount = Math.max(1, Math.min(SECTOR_KEYS.length, init.sectorCount));

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    this.renderer.setSize(
      Math.max(1, init.host.clientWidth),
      Math.max(1, init.host.clientHeight)
    );
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    init.host.appendChild(canvas);

    this.camera = new OrthographicCamera(-1, 1, 1, -1, CAM_NEAR, CAM_FAR);
    this.buildingMaterial = new MeshBasicMaterial({
      vertexColors: true,
      side: DoubleSide,
    });
    this.groundMaterial = new MeshBasicMaterial({
      color: GRASS_NIGHT.clone(),
      side: DoubleSide,
    });
    this.ringMaterial = new MeshBasicMaterial({
      color: SELECTION_COLOR,
      side: DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    this.windowMaterials = [0, 1, 2, 3].map(
      () => new MeshBasicMaterial({ vertexColors: true, side: DoubleSide })
    );
    this.streetMaterial = new MeshBasicMaterial({
      vertexColors: true,
      side: DoubleSide,
    });
    this.lockedPadMaterial = new MeshBasicMaterial({
      color: "#141a24",
      side: DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    this.flatMaterial = new MeshBasicMaterial({
      vertexColors: true,
      side: DoubleSide,
    });
    this.scene.add(this.worldLayers, this.buildingsGroup, this.fixtures, this.satellitesGroup);
  }

  /** Mount entry (mirrors CityScene.create; the mount picks by flag). */
  static async create(init: CitySceneInit): Promise<ThreeScene> {
    const scene = new ThreeScene(init);

    scene.buildGround();
    scene.buildSelectionRing();
    scene.daylight = daylightAt(Date.now());
    scene.applyDaylight();
    scene.scheduleDaylightPoll();

    const rig = new CameraRig(
      {
        element: init.host,
        getViewport: () => scene.viewportSize(),
        getHomeCamera: () => scene.homeCamera(),
        applyCamera: (cam) => scene.applyCamera(cam),
        requestRender: () => scene.requestRender(),
        onSettled: (cam) => scene.onCameraSettled(cam),
        onTap: (wx, wy) => scene.onTap(wx, wy),
        isReduced: () => scene.policy.reduced,
      },
      scene.homeCamera()
    );
    scene.rig = rig;

    const ro = new ResizeObserver(() => scene.onResize());
    ro.observe(init.host);
    scene.ro = ro;

    scene.renderer.domElement.addEventListener(
      "webglcontextlost",
      scene.onContextLost
    );
    // Tab opened/created while hidden (e.g. background open, in-app
    // browsers): the initial measure can see a 0-size host and throttled
    // ResizeObserver callbacks never deliver the real size until the page
    // becomes visible — re-measure + render on visibility regain.
    document.addEventListener("visibilitychange", scene.onVisibilityChange);

    scene.applyCamera(rig.state);
    scene.requestRender();
    scene.startLightClock();
    // Dev probe (QA): live scene state reachable from the console.
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__city3d = scene;
    }
    return scene;
  }

  // ── construction helpers ────────────────────────────────────────────────

  private buildGround(): void {
    const half = groundPlateHalfExtent();
    this.groundMesh = new Mesh(makeGroundGeometry(half), this.groundMaterial);
    // Center the plate on the macro grid (the HQ tile's global position).
    const g = globalTileOf(HQ_TILE);
    const ground = tileToGround(g.x, g.y);
    this.groundMesh.position.set(ground.x, 0, ground.z);
    this.scene.add(this.groundMesh);
  }

  private buildSelectionRing(): void {
    this.selectionRing = new Mesh(
      buildSelectionRingGeometry(SELECTION_COLOR),
      this.ringMaterial
    );
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);
  }

  // ── public API (CityScene contract) ─────────────────────────────────────

  setStrings(strings: Partial<CitySceneStrings>): void {
    this.strings = { ...this.strings, ...strings };
  }

  /** P0: stored for the P2 universe layer; not used yet. */
  setCityDetailFetcher(
    fetcher: ((username: string) => Promise<CitySceneProjection | null>) | null
  ): void {
    this.cityDetailFetcher = fetcher;
  }

  sync(projection: CitySceneProjection): void {
    if (this.destroyed) return;
    this.lastProjection = projection;
    const sectorCount = Math.max(
      1,
      Math.min(SECTOR_KEYS.length, projection.owner.sectorsUnlocked)
    );
    this.sectorCount = sectorCount;

    const byId = new Map<number, CityBuilding>();
    for (const family of projection.families) {
      for (const b of family.buildings) byId.set(b.cardId, b);
    }
    const all = [...byId.values()];

    const prevPositions = new Map<number, { x: number; z: number }>();
    for (const [cardId, entry] of this.buildings) {
      prevPositions.set(cardId, { x: entry.mesh.position.x, z: entry.mesh.position.z });
    }

    const { entries, resumeRing } = rankArrangeTiles(all, sectorCount, (key) =>
      this.reserved.has(key) || this.moat.has(key)
    );

    // Rebuild occupancy + reconcile meshes (drawnKey memo — cheap syncs).
    this.occupancy.clear();
    const seen = new Set<number>();
    for (const e of entries) {
      const g = globalTileOf(e.tile);
      const ground = tileToGround(g.x, g.y);
      this.occupancy.set(tileRefKey(e.tile), e.building.cardId);
      seen.add(e.building.cardId);
      let entry = this.buildings.get(e.building.cardId);
      const protection = e.building.protection ?? "";
      if (
        entry &&
        (entry.profession !== e.building.profession ||
          entry.tier !== e.building.tier ||
          entry.protection !== protection)
      ) {
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = buildBuildingGeometry(
          e.building.profession,
          e.building.tier,
          e.building.cardId
        ).geometry;
        entry.profession = e.building.profession;
        entry.tier = e.building.tier;
        entry.protection = protection;
      }
      if (!entry) {
        const { geometry } = buildBuildingGeometry(
          e.building.profession,
          e.building.tier,
          e.building.cardId
        );
        const mesh = new Mesh(geometry, this.bodyMaterials());
        // Construct pop-in (scale.y 0→1; snapped under reduced motion).
        if (!this.policy.reduced) {
          mesh.scale.y = 0.05;
          this.growing.push({ mesh, start: performance.now() });
        }
        this.buildingsGroup.add(mesh);
        entry = {
          mesh,
          profession: e.building.profession,
          tier: e.building.tier,
          protection,
        };
        this.buildings.set(e.building.cardId, entry);
      }
      // Position (with re-rank glide when the tile changed).
      const prev = prevPositions.get(e.building.cardId);
      const moved =
        !prev ||
        Math.abs(prev.x - ground.x) > 0.5 ||
        Math.abs(prev.z - ground.z) > 0.5;
      if (moved && prev && !this.policy.reduced) {
        this.moving.push({
          mesh: entry.mesh,
          fromX: prev.x,
          fromZ: prev.z,
          toX: ground.x,
          toZ: ground.z,
          start: performance.now(),
        });
        // Past the cap the OLDEST glide snaps to its destination (same
        // tail-snap policy as the Pixi scene's mass re-rank handling).
        while (this.moving.length > MOVE_GLIDE_CAP) {
          const dropped = this.moving.shift();
          dropped?.mesh.position.set(dropped.toX, 0, dropped.toZ);
        }
      } else {
        entry.mesh.position.set(ground.x, 0, ground.z);
      }
    }
    // Removed buildings (sold/lost) — dispose geometry.
    for (const [cardId, entry] of [...this.buildings]) {
      if (seen.has(cardId)) continue;
      this.buildingsGroup.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      this.buildings.delete(cardId);
    }
    if (this.policy.reduced) this.moving.length = 0;

    this.cardTiles.clear();
    this.buildingsById.clear();
    for (const e of entries) {
      this.cardTiles.set(e.building.cardId, e.tile);
      this.buildingsById.set(e.building.cardId, e.building);
    }

    this.syncHq(projection);
    this.syncMonuments(projection);
    this.syncWorldLayers(projection, entries.map((e) => e.tile), resumeRing);
    this.syncSatellites(projection, sectorCount);
    this.applyDaylight();
    this.updateSelectionRing();
    this.updateChips();
    this.requestRender();
  }

  /** Streets + locked pads + aggregate rim + protection rings (derived). */
  private syncWorldLayers(
    projection: CitySceneProjection,
    buildingTiles: readonly TileRef[],
    resumeRing: number
  ): void {
    // Streets: derived road grid around the placed buildings + HQ.
    const streets = buildStreetsGeometry(deriveHomeStreets(buildingTiles));
    if (this.streetsMesh) {
      this.worldLayers.remove(this.streetsMesh);
      this.streetsMesh.geometry.dispose();
    }
    this.streetsMesh = new Mesh(streets.geometry, this.streetMaterial);
    this.worldLayers.add(this.streetsMesh);

    // Locked sector pads (only rebuilt when the sector count changes).
    if (
      !this.lockedPadsMesh ||
      this.lockedPadsMesh.userData.sectorCount !== this.sectorCount
    ) {
      if (this.lockedPadsMesh) {
        this.worldLayers.remove(this.lockedPadsMesh);
        this.lockedPadsMesh.geometry.dispose();
      }
      const geo = buildLockedPadsGeometry(this.sectorCount);
      this.lockedPadsMesh = new Mesh(geo, this.lockedPadMaterial);
      this.lockedPadsMesh.userData.sectorCount = this.sectorCount;
      this.worldLayers.add(this.lockedPadsMesh);
    }

    // Aggregate rim: the beyond-detail skyline continuing the orbit.
    const occupied = (key: string) => this.occupancy.has(key);
    const agg = buildAggregateGeometry(
      projection.families,
      resumeRing,
      this.sectorCount,
      occupied
    );
    if (this.aggregateMesh) {
      this.worldLayers.remove(this.aggregateMesh);
      this.aggregateMesh.geometry.dispose();
    }
    this.aggregateMesh = new Mesh(agg.geometry, this.buildingMaterial);
    this.worldLayers.add(this.aggregateMesh);

    // Protection status rings (firewall/hardlock — server authority).
    const protectedTiles = buildingTiles
      .map((tile) => {
        const b = this.buildingsById.get(this.occupancy.get(tileRefKey(tile)) ?? -1);
        if (!b?.protection) return null;
        const sectorIndex = Number(tile.sector.replace(/^s/, "")) || 0;
        const g = globalTile(sectorIndex, tile.x, tile.y, GRID_SIZE);
        return { gx: g.x, gy: g.y, protection: b.protection };
      })
      .filter((t): t is { gx: number; gy: number; protection: "hardlock" | "firewall" } => !!t);
    if (this.protectionMesh) {
      this.worldLayers.remove(this.protectionMesh);
      this.protectionMesh.geometry.dispose();
    }
    this.protectionMesh = new Mesh(
      buildProtectionRingsGeometry(protectedTiles),
      this.flatMaterial
    );
    this.worldLayers.add(this.protectionMesh);
  }

  /** Satellite mini-cities (foreign clusters on the anchor octants). */
  private syncSatellites(projection: CitySceneProjection, sectorCount: number): void {
    for (const [, s] of this.satelliteBuilds) {
      this.satellitesGroup.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.satelliteBuilds.clear();
    const neighbors = projection.neighbors ?? [];
    neighbors.slice(0, 8).forEach((neighbor, slot) => {
      const built = buildSatelliteCluster(neighbor, slot, sectorCount);
      const mesh = new Mesh(built.geometry, this.buildingMaterial);
      this.satellitesGroup.add(mesh);
      const tiles = new Map<string, number>();
      for (const t of built.tiles) tiles.set(`${t.gx},${t.gy}`, t.cardId);
      this.satelliteBuilds.set(slot, {
        mesh,
        tiles,
        owner: neighbor.cardId,
        anchorWorld: built.anchorWorld,
      });
    });
  }

  private syncHq(projection: CitySceneProjection): void {
    const stage = projection.hqStage ?? 1;
    const key = `hq|${stage}`;
    if (this.hqKey !== key) {
      if (this.hqMesh) {
        this.fixtures.remove(this.hqMesh);
        this.hqMesh.geometry.dispose();
      }
      const { geometry } = buildHqGeometry(stage);
      this.hqMesh = new Mesh(geometry, this.bodyMaterials());
      this.hqMesh.userData.topPx = buildHqGeometry(stage).topPx;
      this.fixtures.add(this.hqMesh);
      this.hqKey = key;
    }
    const g = globalTileOf(HQ_TILE);
    const ground = tileToGround(g.x, g.y);
    this.hqMesh?.position.set(ground.x, 0, ground.z);
  }

  private syncMonuments(projection: CitySceneProjection): void {
    for (let i = 0; i < 6; i++) {
      const lm = projection.landmarks[i];
      const stage = lm?.stage ?? 1;
      const owned = lm?.owned ?? false;
      const key = `m${i}|${stage}|${owned ? 1 : 0}`;
      let slot = this.monuments[i];
      if (!slot || slot.key !== key) {
        if (slot) {
          this.fixtures.remove(slot.mesh);
          slot.mesh.geometry.dispose();
        }
        const { geometry } = buildMonumentGeometry(i, stage, owned);
        const mesh = new Mesh(geometry, this.bodyMaterials());
        this.fixtures.add(mesh);
        slot = { mesh, key };
        this.monuments[i] = slot;
      }
      const t = landmarkTile(i);
      const g = globalTileOf(t);
      const ground = tileToGround(g.x, g.y);
      slot.mesh.position.set(ground.x, 0, ground.z);
    }
  }

  /**
   * Shared universe map (P2): rank-orbit markers around the home city
   * (bounded to the ground plate's reach — the HUD chip carries the true
   * count), stake cities violet-tinted. Lazy minis stay a P3 refinement.
   */
  syncUniverse(payload: UniversePayload | null, viewerUsername: string): void {
    if (this.destroyed) return;
    const stake = (this.lastProjection?.neighbors ?? []).map((n) => n.username);
    const { markers, count, viewerRank } = deriveUniverseMarkers(
      payload,
      viewerUsername,
      stake,
      this.sectorCount
    );
    this.universeMarkers = markers;
    if (this.universeMesh) {
      this.worldLayers.remove(this.universeMesh);
      this.universeMesh.geometry.dispose();
    }
    this.universeMesh = new Mesh(
      buildUniverseCityBuildingsGeometry(markers),
      this.buildingMaterial
    );
    this.worldLayers.add(this.universeMesh);
    cityWorldStore.getState().setUniverseSummary(
      count > 0
        ? { count, myRank: viewerRank <= count ? viewerRank : null }
        : null
    );
    this.requestRender();
  }

  setReducedMotion(reduced: boolean): void {
    this.policy = resolveMotion(reduced);
    if (this.policy.reduced) {
      for (const m of this.moving) m.mesh.position.set(m.toX, 0, m.toZ);
      this.moving.length = 0;
      // Reduced motion: no occupancy churn — panes keep a steady glow.
      this.stopLightClock();
      this.updateWindowLights(0);
    } else {
      this.startLightClock();
    }
    this.requestRender();
  }

  setSelected(cardId: number | null): void {
    this.selectedCardId = cardId;
    this.updateSelectionRing();
    this.updateChips();
    this.requestRender();
  }

  /** Foreign (satellite) selection: ring at the mini building's tile. */
  setSelectedForeign(sel: { owner: number; cardId: number } | null): void {
    if (!this.selectionRing) return;
    this.selectionRing.visible = false;
    if (sel) {
      for (const [, sat] of this.satelliteBuilds) {
        if (sat.owner !== sel.owner) continue;
        for (const [key, cardId] of sat.tiles) {
          if (cardId !== sel.cardId) continue;
          const [gx, gy] = key.split(",").map(Number);
          const ground = tileToGround(gx, gy);
          this.selectionRing.position.set(ground.x, 0, ground.z);
          this.selectionRing.visible = true;
        }
      }
    }
    this.requestRender();
  }

  /** P3 — no-op until then. */
  setSelectedUniverseBuilding(sel: {
    username: string;
    cardId: number;
  } | null): void {
    void sel;
  }

  setSelectedHq(username: string | null): void {
    if (!this.selectionRing || !this.hqMesh) return;
    const own = !!username && username === this.lastProjection?.owner.username;
    this.selectionRing.visible = own;
    if (own && this.hqMesh) {
      this.selectionRing.position.copy(this.hqMesh.position);
    }
    this.requestRender();
  }

  /** Universe-city selection: ring on its marker. */
  setSelectedUniverseCity(username: string | null): void {
    if (!this.selectionRing) return;
    this.selectionRing.visible = false;
    if (username) {
      const m = this.universeMarkers.find((x) => x.username === username);
      if (m) {
        const ground = tileToGround(m.gxWorld, m.gyWorld);
        this.selectionRing.position.set(ground.x, 0, ground.z);
        this.selectionRing.visible = true;
      }
    }
    this.requestRender();
  }

  /** P0: rings the monument tile (same selection read as buildings). */
  setSelectedLandmark(index: number | null): void {
    if (!this.selectionRing) return;
    if (index === null) {
      this.selectionRing.visible = false;
    } else {
      const g = globalTileOf(landmarkTile(index));
      const ground = tileToGround(g.x, g.y);
      this.selectionRing.position.set(ground.x, 0, ground.z);
      this.selectionRing.visible = true;
    }
    this.requestRender();
  }

  /** P1 (civic lots render) — no-op until then. */
  setSelectedCivic(kind: CivicKind | null): void {
    void kind;
  }

  setRootSequence(state: RootSequenceVisualState): void {
    if (this.destroyed) return;
    const wasActive = this.rootActive;
    if (state.active === wasActive) return;
    this.rootActive = state.active;
    this.applyRoot();
    this.requestRender();
  }

  /**
   * Root Sequence beams (all six fixed ring positions while the countdown
   * runs — the countdown HUD stays authoritative): thin additive towers in
   * each monument's accent color, opacity-pulsed by the light clock.
   */
  private applyRoot(): void {
    if (this.rootBeams) {
      this.scene.remove(this.rootBeams);
      this.rootBeams.geometry.dispose();
      (this.rootBeams.material as MeshBasicMaterial).dispose();
      this.rootBeams = null;
    }
    if (!this.rootActive) return;
    const builder = new MeshBuilder();
    for (let i = 0; i < 6; i++) {
      const g = globalTileOf(landmarkTile(i));
      const ground = tileToGround(g.x, g.y);
      const accent = new Color(LANDMARK_COLORS[i % LANDMARK_COLORS.length]);
      builder.box(ground.x, ground.z, 0, 2.6, 2.6, 420, accent);
    }
    const mat = new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.rootBeams = new Mesh(builder.toGeometry(), mat);
    this.scene.add(this.rootBeams);
  }

  focusCard(cardId: number): void {
    const tile = this.cardTiles.get(cardId);
    if (!tile) return;
    const p = worldPointOfTile(tile);
    this.rig.focusWorldPoint(p.x, p.y - 48);
  }

  /** Side-panel focus → glide (or snap) onto a satellite city's anchor. */
  focusSatellite(slot: number): void {
    const built = this.satelliteBuilds.get(slot);
    if (!built) return;
    this.rig.animateTo(
      clampCamera({
        x: built.anchorWorld.x,
        y: built.anchorWorld.y - 30,
        zoom: Math.max(this.rig.state.zoom, 0.7),
      })
    );
  }

  focusLandmark(index: number): void {
    const p = worldPointOfTile(landmarkTile(index));
    const hq = worldPointOfTile(HQ_TILE);
    const tx = (p.x * 2 + hq.x) / 3;
    const ty = (p.y * 2 + hq.y) / 3 - 40;
    this.rig.animateTo(
      clampCamera({ x: tx, y: ty, zoom: Math.max(this.rig.state.zoom, 0.8) })
    );
  }

  zoomBy(delta: number): void {
    this.rig.zoomBy(delta);
  }

  resetCamera(): void {
    this.rig.reset();
  }

  // ── camera + input plumbing ─────────────────────────────────────────────

  private viewportSize() {
    return {
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
    };
  }

  private homeCamera(): CameraState {
    const p = worldPointOfTile(HQ_TILE);
    const ringFit =
      (this.viewportSize().width * 0.96) / LANDMARK_RING_SPAN_PX;
    const zoom = Math.min(HOME_ZOOM, Math.max(ZOOM_MIN, ringFit));
    return clampCamera({ x: p.x, y: p.y - 48, zoom });
  }

  private applyCamera(cam: CameraState): void {
    const viewport = this.viewportSize();
    const { position, target } = cameraPlacement(cam);
    this.camera.position.set(position.x, position.y, position.z);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target.x, target.y, target.z);
    const f = orthoFrame(cam, viewport);
    this.camera.left = f.left;
    this.camera.right = f.right;
    this.camera.top = f.top;
    this.camera.bottom = f.bottom;
    this.camera.near = CAM_NEAR;
    this.camera.far = CAM_FAR;
    this.camera.updateProjectionMatrix();
    this.billboard?.quaternion.copy(this.camera.quaternion);
    this.dirty = true;
  }

  private onCameraSettled(cam: CameraState): void {
    const picked = pickTile(cam.x, cam.y, GRID_SIZE);
    const store = cityWorldStore.getState();
    store.setCameraSnapshot({ x: cam.x, y: cam.y, zoom: cam.zoom }, picked?.sector ?? -1);
    const lod = lodFor(cam.zoom);
    this.lod = lod;
    store.setLod(lod);
    // Chips follow the camera (settle-cadence, never per frame).
    this.updateChips();
  }

  /**
   * P0 tap ladder (subset of the Pixi scene's forgiveness ladder):
   * exact building tile → landmark tile → HQ tile → nearest tower within a
   * zoom-aware tolerance → locked-pad peek → deselect.
   */
  private onTap(worldX: number, worldY: number): void {
    const state = cityWorldStore.getState();
    const picked = pickTile(worldX, worldY, GRID_SIZE);
    if (picked) {
      const tile: TileRef = {
        sector: `s${picked.sector}`,
        x: picked.x,
        y: picked.y,
      };
      const hitCard = this.occupancy.get(tileRefKey(tile));
      if (hitCard !== undefined) {
        state.select(hitCard);
        this.callbacks.onSelectCard(hitCard);
        return;
      }
      if (tile.sector === "s0") {
        for (let i = 0; i < 6; i++) {
          const lt = landmarkTile(i);
          if (lt.x === tile.x && lt.y === tile.y) {
            state.selectLandmark(i);
            return;
          }
        }
        if (HQ_TILE.x === tile.x && HQ_TILE.y === tile.y && this.lastProjection) {
          state.selectHq(this.lastProjection.owner.username);
          return;
        }
      }
      if (picked.sector >= this.sectorCount) {
        state.setLockedPeek(picked.sector);
        return;
      }
    }
    // Satellite mini-cities (outside the macro grid — anchor-local tiles).
    const tap = screenToTile(worldX, worldY);
    for (const [, sat] of this.satelliteBuilds) {
      const hitCard = sat.tiles.get(`${Math.floor(tap.x)},${Math.floor(tap.y)}`);
      if (hitCard !== undefined) {
        state.selectForeign({ owner: sat.owner, cardId: hitCard });
        return;
      }
    }
    // Universe city buildings: forgiving body hit (base dot + tower body,
    // zoom-aware; marker tile coords are absolute — HQ offset baked in).
    if (this.universeMarkers.length > 0) {
      const zoom = this.rig.state.zoom;
      const tolPx = Math.max(14, 26 / zoom);
      let bestMarker: UniverseMarker | null = null;
      let bestDist = Infinity;
      for (const m of this.universeMarkers) {
        const p = tileToScreen(m.gxWorld, m.gyWorld);
        const t = Math.log10(Math.max(1, m.rank)) / Math.log10(500);
        const h = 28 + 74 * (1 - t);
        const dx = Math.max(0, Math.abs(worldX - p.x) - 10);
        const dy = Math.max(0, worldY - (p.y + 10), p.y - h - 12 - worldY);
        const d = Math.hypot(dx, dy);
        if (d < bestDist) {
          bestDist = d;
          bestMarker = m;
        }
      }
      if (bestMarker && bestDist <= tolPx) {
        state.selectUniverseCity(bestMarker.username);
        return;
      }
    }
    // Nearest tower within tolerance (towers rise above their tiles).
    const zoom = this.rig.state.zoom;
    const tol = Math.max(TILE_W * 0.75, 40 / zoom);
    let best: number | null = null;
    let bestDist = Infinity;
    for (const [cardId, tile] of this.cardTiles) {
      const b = this.buildingsById.get(cardId);
      if (!b) continue;
      const p = worldPointOfTile(tile);
      const top = familyTopHeightPx(b.profession, b.tier);
      const dx = Math.max(0, Math.abs(worldX - p.x) - 32);
      const dy = Math.max(0, worldY - (p.y + 24), p.y - top - 16 - worldY);
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = cardId;
      }
    }
    if (best !== null && bestDist <= tol) {
      state.select(best);
      this.callbacks.onSelectCard(best);
      return;
    }
    state.select(null);
  }

  private onContextLost = (): void => {
    this.callbacks.onContextLost();
  };

  private onVisibilityChange = (): void => {
    if (this.destroyed || document.visibilityState !== "visible") return;
    this.onResize();
  };

  private onResize(): void {
    if (this.destroyed) return;
    const { width, height } = this.viewportSize();
    this.renderer.setSize(width, height);
    this.applyCamera(this.rig.state);
    this.requestRender();
  }

  private updateSelectionRing(): void {
    if (!this.selectionRing) return;
    if (this.selectedCardId === null) {
      this.selectionRing.visible = false;
      this.updateBillboard();
      return;
    }
    const tile = this.cardTiles.get(this.selectedCardId);
    if (!tile) {
      this.selectionRing.visible = false;
      this.updateBillboard();
      return;
    }
    const g = globalTileOf(tile);
    const ground = tileToGround(g.x, g.y);
    this.selectionRing.position.set(ground.x, 0, ground.z);
    this.selectionRing.visible = true;
    this.updateBillboard();
  }

  // ── DOM chip overlay (selection name / HQ plate / sector labels) ────────

  private ensureChips(): void {
    if (this.chipsRoot || typeof document === "undefined") return;
    const root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.style.cssText =
      "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:5";
    this.host.appendChild(root);
    this.chipsRoot = root;
  }

  private chipNode(text: string, x: number, y: number, strong: boolean): HTMLDivElement {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.cssText = `position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;transform:translate(-50%,-100%);white-space:nowrap;pointer-events:none;font:600 10px/1.4 ui-sans-serif,system-ui,sans-serif;letter-spacing:.04em;color:${strong ? "#eaf1fb" : "#9fb0c6"};background:${strong ? "rgba(12,18,32,.92)" : "rgba(10,14,24,.72)"};border:1px solid ${strong ? "rgba(122,168,255,.55)" : "rgba(255,255,255,.14)"};border-radius:6px;padding:2px 7px;text-transform:uppercase`;
    return d;
  }

  /**
   * Rebuild the chip set (≤ ~11 DOM nodes, bounded): sector identity labels,
   * the HQ owner plate, and the selected building's name chip. Runs on sync
   * / selection change / camera settle — never per frame.
   */
  private updateChips(): void {
    this.ensureChips();
    if (!this.chipsRoot || !this.lastProjection) return;
    const cam = this.rig?.state ?? { x: 0, y: 0, zoom: 1 };
    const viewport = this.viewportSize();
    const nodes: HTMLDivElement[] = [];
    const place = (worldPx: { x: number; y: number }, risePx: number) => {
      const ground = worldPxToGround(worldPx.x, worldPx.y);
      return projectToScreen(
        { x: ground.x, y: risePx * PIXEL_RISE, z: ground.z },
        cam,
        viewport
      );
    };

    // Sector identity chips (unlocked only, non-empty labels).
    for (const info of this.lastProjection.sectorInfo) {
      if (!info.unlocked) continue;
      const label = this.strings.sectorLabel(info);
      if (!label) continue;
      const c = globalTile(info.index, GRID_SIZE >> 1, GRID_SIZE >> 1, GRID_SIZE);
      const p = place(tileToScreen(c.x, c.y), -340);
      nodes.push(this.chipNode(label, p.x, p.y, false));
    }

    // HQ plate (CORE tag + owner display name).
    const hq = worldPointOfTile(HQ_TILE);
    const hqTop = this.hqMesh
      ? (this.hqMesh.userData.topPx as number | undefined) ?? 128
      : 128;
    const hp = place(hq, -(hqTop + 14));
    nodes.push(
      this.chipNode(
        `${this.strings.coreTag} · ${this.strings.displayName(this.lastProjection.owner.username)}`,
        hp.x,
        hp.y,
        true
      )
    );

    // Satellite "+N more" plates (bounded foreign-city counts).
    const neighbors = this.lastProjection.neighbors ?? [];
    for (const [slot, sat] of this.satelliteBuilds) {
      const n = neighbors[slot];
      if (!n || !n.truncated) continue;
      const more = n.visibleOwnedCount - n.buildings.length;
      if (more <= 0) continue;
      const sp = place(sat.anchorWorld, -84);
      nodes.push(
        this.chipNode(this.strings.satelliteMoreLabel(more), sp.x, sp.y, false)
      );
    }

    // Selected building name chip (strong plate, above the body top).
    if (this.selectedCardId !== null) {
      const tile = this.cardTiles.get(this.selectedCardId);
      const b = this.buildingsById.get(this.selectedCardId);
      if (tile && b) {
        const p = worldPointOfTile(tile);
        const top = familyTopHeightPx(b.profession, b.tier);
        const sp = place(p, -(top + 16));
        nodes.push(
          this.chipNode(this.strings.displayName(b.username), sp.x, sp.y, true)
        );
      }
    }
    this.chipsRoot.replaceChildren(...nodes);
  }

  // ── avatar billboard (selected building's rooftop identity plate) ───────

  private updateBillboard(): void {
    const username =
      this.selectedCardId !== null
        ? this.buildingsById.get(this.selectedCardId)?.username
        : undefined;
    if (!username) {
      if (this.billboard) this.billboard.visible = false;
      this.billboardFor = null;
      return;
    }
    const tile = this.cardTiles.get(this.selectedCardId!);
    const b = this.buildingsById.get(this.selectedCardId!);
    if (!tile || !b) return;
    const tex = loadAvatarTexture(username);
    if (!tex) {
      // Texture in flight — one retry when it arrives.
      if (this.billboardFor !== username) {
        this.avatarTeardown?.();
        this.avatarTeardown = onAvatarTextureReady(() => {
          this.updateBillboard();
          this.requestRender();
        });
      }
      return;
    }
    this.avatarTeardown?.();
    this.avatarTeardown = null;
    if (!this.billboard) {
      const mat = new MeshBasicMaterial({ side: DoubleSide });
      this.billboard = new Mesh(new PlaneGeometry(26, 26), mat);
      this.scene.add(this.billboard);
    }
    const mat = this.billboard.material as MeshBasicMaterial;
    if (this.billboardFor !== username) {
      mat.map?.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
      this.billboardFor = username;
    }
    const g = globalTileOf(tile);
    const ground = tileToGround(g.x, g.y);
    const top = familyTopHeightPx(b.profession, b.tier);
    this.billboard.position.set(ground.x, (top + 34) * PIXEL_RISE, ground.z);
    this.billboard.quaternion.copy(this.camera.quaternion);
    this.billboard.visible = true;
  }

  // ── day/night (P0 tint pass; P1 adds authored art-state pairs) ──────────

  /** Mass + window-channel material array (geometry groups drive the pick). */
  private bodyMaterials(): MeshBasicMaterial[] {
    return [this.buildingMaterial, ...this.windowMaterials];
  }

  private applyDaylight(): void {
    const d = this.daylight;
    this.scene.background = SKY_NIGHT.clone().lerp(SKY_DAY, d);
    this.groundMaterial.color.copy(GRASS_NIGHT).lerp(GRASS_DAY, d);
    // Buildings are authored night-native; day lifts them like the 2D
    // scoped soft-lift filters (scaled 1 → ~1.25 brightness). Streets share
    // the lift (authored night asphalt).
    const lift = 1 + 0.25 * d;
    this.buildingMaterial.color.setRGB(lift, lift, lift * 0.98);
    this.streetMaterial.color.setRGB(lift, lift, lift * 0.98);
    this.updateWindowLights(performance.now());
    this.dirty = true;
  }

  /**
   * Window-channel colors at time t — the 3D twin of the Pixi light clock:
   * windowFlickerAt's two occupancy channels (different periods, out of
   * phase) dim the lit panes city-wide, SPLIT BY cardId parity so half the
   * skyline dips against the other half, scaled by facadeGlowAt(daylight)
   * (full bloom at night, glass sheen by day). Per-pane identity (warm
   * color, brightness, channel split) is baked in vertex colors, so this
   * touches exactly four material colors per step.
   */
  private updateWindowLights(t: number): void {
    const glow = facadeGlowAt(this.daylight);
    for (let parity = 0; parity < 2; parity++) {
      const fa = glow * windowFlickerAt(t, 1 + parity, 0);
      const fb = glow * windowFlickerAt(t, 3 + parity, 1);
      const a = this.windowMaterials[parity]; // A{parity}
      const b = this.windowMaterials[2 + parity]; // B{parity}
      a.color.setRGB(
        WINDOW_WARM_LINEAR.r * fa,
        WINDOW_WARM_LINEAR.g * fa,
        WINDOW_WARM_LINEAR.b * fa
      );
      b.color.setRGB(
        WINDOW_WARM_LINEAR.r * fb,
        WINDOW_WARM_LINEAR.g * fb,
        WINDOW_WARM_LINEAR.b * fb
      );
    }
  }

  /**
   * Quantized light animation (lib/city/scene/lights.ts): one window-color
   * pass + ONE render per step; no timer churn between steps. Reduced
   * motion never starts the clock — panes keep their static full-night
   * bloom. Hidden tabs let setTimeout throttle naturally (render skipped).
   */
  private startLightClock(): void {
    if (this.policy.reduced || this.lightsTimer !== null) return;
    const step = () => {
      if (this.destroyed) return;
      const t = performance.now();
      this.updateWindowLights(t);
      if (this.rootBeams) {
        // Beam pulse rides the light clock (reduced motion: steady glow).
        const mat = this.rootBeams.material as MeshBasicMaterial;
        mat.opacity = 0.5 + 0.25 * Math.sin(t / 900);
      }
      if (
        typeof document === "undefined" ||
        document.visibilityState !== "hidden"
      ) {
        this.requestRender();
      }
      this.lightsTimer = setTimeout(step, LIGHT_STEP_MS);
    };
    this.lightsTimer = setTimeout(step, LIGHT_STEP_MS);
  }

  private stopLightClock(): void {
    if (this.lightsTimer !== null) {
      clearTimeout(this.lightsTimer);
      this.lightsTimer = null;
    }
  }

  private scheduleDaylightPoll(): void {
    if (this.destroyed) return;
    this.daylightTimer = setTimeout(() => {
      if (this.destroyed) return;
      const next = daylightAt(Date.now());
      if (Math.abs(next - this.daylight) > 0.02) {
        this.daylight = next;
        this.applyDaylight();
        this.requestRender();
      }
      this.scheduleDaylightPoll();
    }, DAYLIGHT_POLL_MS);
  }

  // ── render-on-demand loop (mirrors the Pixi scene's pattern) ────────────

  private requestRender(): void {
    if (this.destroyed) return;
    this.dirty = true;
    if (!this.raf) {
      this.raf = requestAnimationFrame(() => this.tick());
    }
  }

  private tick(): void {
    this.raf = 0;
    if (this.destroyed) return;
    let busy = this.rig.update();
    busy = this.updateMoves(performance.now()) || busy;
    busy = this.updateGrowing(performance.now()) || busy;
    if (this.dirty || busy) {
      const now = performance.now();
      this.renderer.render(this.scene, this.camera);
      if (this.lastRenderAt) {
        const dt = now - this.lastRenderAt;
        this.frameEma = this.frameEma ? this.frameEma * 0.9 + dt * 0.1 : dt;
      }
      this.lastRenderAt = now;
      this.dirty = false;
      this.pushPerfSnapshot(now);
    }
    if (busy) this.requestRender();
  }

  /** Value-orbit re-rank glides (smoothstep, same feel as the Pixi scene). */
  private updateMoves(now: number): boolean {
    if (this.moving.length === 0) return false;
    let busy = false;
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const m = this.moving[i];
      const t = Math.min(1, (now - m.start) / MOVE_GLIDE_MS);
      const s = t * t * (3 - 2 * t);
      m.mesh.position.set(
        m.fromX + (m.toX - m.fromX) * s,
        0,
        m.fromZ + (m.toZ - m.fromZ) * s
      );
      if (t >= 1) {
        this.moving.splice(i, 1);
      } else {
        busy = true;
      }
    }
    return busy;
  }

  /** Construct pop-in (320ms scale.y ease-out; the list is sync-driven). */
  private updateGrowing(now: number): boolean {
    if (this.growing.length === 0) return false;
    let busy = false;
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const g = this.growing[i];
      const t = Math.min(1, (now - g.start) / 320);
      g.mesh.scale.y = 0.05 + 0.95 * (1 - (1 - t) * (1 - t));
      if (t >= 1) {
        g.mesh.scale.y = 1;
        this.growing.splice(i, 1);
      } else {
        busy = true;
      }
    }
    return busy;
  }

  private pushPerfSnapshot(now: number): void {
    if (now - this.lastPerfPush < PERF_PUSH_MS) return;
    this.lastPerfPush = now;
    const store = cityWorldStore.getState();
    store.setPerf({
      fps: this.frameEma > 0 ? Math.round(1000 / this.frameEma) : 0,
      frameMs: Math.round(this.frameEma * 10) / 10,
      spritesTotal: this.buildings.size,
      spritesVisible: this.renderer.info.render.calls,
      lod: this.lod,
      daylight: this.daylight,
      zoom: this.rig.state.zoom,
    });
  }

  // ── teardown ────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.daylightTimer) clearTimeout(this.daylightTimer);
    this.stopLightClock();
    this.rig?.destroy();
    this.ro?.disconnect();
    this.renderer.domElement.removeEventListener(
      "webglcontextlost",
      this.onContextLost
    );
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    for (const entry of this.buildings.values()) entry.mesh.geometry.dispose();
    this.buildings.clear();
    if (this.hqMesh) this.hqMesh.geometry.dispose();
    for (const m of this.monuments) m?.mesh.geometry.dispose();
    this.monuments.length = 0;
    this.groundMesh?.geometry.dispose();
    this.selectionRing?.geometry.dispose();
    this.streetsMesh?.geometry.dispose();
    this.lockedPadsMesh?.geometry.dispose();
    this.aggregateMesh?.geometry.dispose();
    this.protectionMesh?.geometry.dispose();
    this.universeMesh?.geometry.dispose();
    for (const [, s] of this.satelliteBuilds) s.mesh.geometry.dispose();
    this.satelliteBuilds.clear();
    if (this.billboard) {
      this.billboard.geometry.dispose();
      (this.billboard.material as MeshBasicMaterial).dispose();
      this.billboard = null;
    }
    this.avatarTeardown?.();
    this.avatarTeardown = null;
    resetAvatarTextures3d();
    this.chipsRoot?.remove();
    this.chipsRoot = null;
    this.buildingMaterial.dispose();
    this.groundMaterial.dispose();
    this.ringMaterial.dispose();
    for (const m of this.windowMaterials) m.dispose();
    this.streetMaterial.dispose();
    this.lockedPadMaterial.dispose();
    this.flatMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    void this.cityDetailFetcher;
  }
}

// ── module-local helpers ──────────────────────────────────────────────────

/** TileRef → global tile (GRID_SIZE macro layout). */
function globalTileOf(tile: TileRef): { x: number; y: number } {
  const sectorIndex = Number(tile.sector.replace(/^s/, "")) || 0;
  return globalTile(sectorIndex, tile.x, tile.y, GRID_SIZE);
}

/** Ground-plane quad centered on its own origin (positioned by caller). */
function makeGroundGeometry(half: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new Float32BufferAttribute(
      [-half, 0, -half, half, 0, -half, half, 0, half, -half, 0, half],
      3
    )
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Renderer-agnostic factory for CitySceneMount's flag switch. */
export async function createScene(init: CitySceneInit): Promise<ThreeScene> {
  return ThreeScene.create(init);
}
