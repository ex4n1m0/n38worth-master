/**
 * Mainframe City 3D — scene controller (client-only three.js; the ONLY
 * module that owns a WebGLRenderer). AAA GRAPHICS PASS (2026-09-30, user
 * ruling "full-on max quality, best the engine can do"):
 *
 * - REAL LIGHTING: hemisphere sky/ground fill + one directional SUN at the
 *   authored azimuth (SUN_DIR, shared with the sky dome's glow), PCFSoft
 *   shadow map fitted to the whole macro grid + satellites, ACES filmic
 *   tone mapping with a daylight-driven exposure.
 * - PBR TEXTURED SURFACES: procedural runtime canvas textures (textures3d)
 *   — per-family facade skins with derived normal maps, tar roofs,
 *   concrete platforms, asphalt roads, grass terrain — all lit materials
 *   (MeshStandardMaterial, vertex colors as family albedo).
 * - POST CHAIN: EffectComposer (MSAA render target) → UnrealBloomPass
 *   (night-strength animated, emissive windows/lamps/neon bloom) →
 *   OutputPass. No new npm deps (three/examples/jsm ships with three).
 * - ATMOSPHERE: gradient sky dome + sun/moon discs + star field (sky3d),
 *   horizon-matched scene fog, continuous daylight (sun/hemisphere/sky/
 *   bloom/exposure/foliage re-aimed on the 250 ms light clock).
 * - STREET LIFE: SC4 road micro-geometry (world3d) + instanced streetlights
 *   with emissive heads and warm night pools, seeded trees and parked cars.
 *
 * The public CityScene contract, the render-on-demand loop, the pure
 * camera/picking math, the derived placement, and every bounded budget are
 * unchanged from the P0–P3 renderer.
 */

import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Object3D,
  AdditiveBlending,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  FrontSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFSoftShadowMap,
  PlaneGeometry,
  Scene,
  Quaternion,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  HalfFloatType,
  type Material,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { GRID_SIZE, SECTOR_KEYS } from "@/lib/city/layout-schema";
import { CIVIC_KINDS } from "@/lib/city/types";
import type { BuildingTier, CityBuilding, CivicKind } from "@/lib/city/types";
import { lodFor } from "@/lib/city/scene/lod";
import { resolveMotion, type MotionPolicy } from "@/lib/city/scene/motion";
import { daylightAt, facadeGlowAt } from "@/lib/city/scene/daylight";
import { LIGHT_STEP_MS, windowFlickerAt } from "@/lib/city/scene/lights";
import {
  clampCamera,
  ZOOM_MIN,
  type CameraState,
} from "@/lib/city/scene/camera";
import {
  globalTile,
  macroStride,
  pickTile,
  screenToTile,
  SECTOR_MACRO,
  tileToScreen,
  TILE_W,
} from "@/lib/city/scene/iso";
import {
  CAM_FAR,
  CAM_NEAR,
  cameraPlacement,
  orthoFrame,
  PIXEL_RISE,
  projectToScreen,
  TILE_STEP,
  tileToGround,
  worldPxToGround,
} from "@/lib/city/scene/camera3d";
import { rankArrangeTiles, tileRefKey, type TileRef } from "@/lib/city/placement";
import { hqGlobalTile } from "@/lib/city/rings";
import { deriveBoulevards, type StreetTile } from "@/lib/city/streets";
import { cityWorldStore } from "@/lib/city/scene/store";
import type {
  CitySceneCallbacks,
  CitySceneInit,
  CitySceneProjection,
  CitySceneStrings,
} from "../scene/CityScene";
import { CameraRig } from "../scene/CameraRig";
import type { RootSequenceVisualState } from "@/lib/city/root-sequence";
import {
  universeRingForRank,
  type UniversePayload,
} from "@/lib/city/universe";
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
  appendUniverseCity,
  buildAggregateGeometry,
  buildCountryRoadsGeometry,
  buildLockedPadsGeometry,
  buildProtectionRingsGeometry,
  buildSatelliteCluster,
  buildStreetsGeometry,
  deriveHomeStreets,
  deriveUniverseMarkers,
  planSatelliteKitMinis,
  streetLampSpots,
  universeRingSignature,
  universeSkylineCapFor,
  type UniverseMarker,
} from "./world3d";
import {
  CIVIC_EMISSIVE,
  CIVIC_NEON,
  CIVIC_TINT,
  civicKitPrefab,
  civicTierScale,
} from "./civic3d";
import { civicTileRef } from "@/lib/city/placement";
import { deriveRiver, riverOffsetForCities } from "@/lib/city/river";
import {
  disposeCityTextures,
  familySkinOf,
  getCityTextures,
  type CityTextureKit,
  type FacadeSkin,
} from "./textures3d";
import { SkyDome, SUN_DIR } from "./sky3d";
import {
  buildCarGeometry,
  buildStreetlightHead,
  buildStreetlightPole,
  buildTreeGeometry,
  carColorAt,
  planParkedCars,
  planTrees,
} from "./props3d";
import { satelliteAnchor, macroCenter } from "@/lib/city/satellites";
import {
  HQ_KIT_PREFAB,
  MONUMENT_EMISSIVE,
  MONUMENT_KIT_PREFABS,
  MONUMENT_TINT,
  ROAD_TILE_SCALE,
  TRAFFIC_LIGHT_PREFAB,
  buildingKitScale,
  hqStageScale,
  LAMP_KIT_SCALE,
  monumentStageScale,
  roadTileFor,
  TREE_KIT_SCALE,
  familyTint,
  loadCityKit,
  pickBuildingPrefab,
  type CityKit,
  type KitName,
  type RoadTileKind,
} from "./assets3d";
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

/** Civic beacon geometry (shared; material per kind — see syncCivic).
 *  Sized to READ at overview zoom (5px cubes were invisible next to the
 *  kit's own roof props — image-analyst QA 2026-10-01). */
const CIVIC_BEACON_GEO = new BoxGeometry(8, 6, 8);

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
/** Coarse daylight fallback poll (the light clock tracks ramps at 250 ms). */
const DAYLIGHT_POLL_MS = 15_000;
const PERF_PUSH_MS = 500;

/** Authored palette anchors (day/night pairs from the 2D system). */
const GRASS_NIGHT = new Color("#1f2a21");
const GRASS_DAY = new Color("#6b9c52");
const SELECTION_COLOR = 0x4f8dff;
/** Lit-window warm base (linear) — matches building3d's WINDOW_WARM. */
const WINDOW_WARM_LINEAR = new Color("#ffd9a0");

/** Sun animation anchors (day factor 0..1 → light rig state). */
const SUN_DAY_COLOR = new Color("#fff3dd");
const SUN_DUSK_COLOR = new Color("#ff9a52");
const HEMI_SKY_DAY = new Color("#bcd8ff");
const HEMI_SKY_NIGHT = new Color("#1c2742");
const HEMI_GROUND_DAY = new Color("#8a7f66");
const HEMI_GROUND_NIGHT = new Color("#0e1218");

/** Shadow frustum: covers the macro grid + satellite ring around center. */
const SHADOW_EXTENT = 7400;

/** Device quality tier (logical cores proxy; shadows are the big lever). */
interface QualityTier {
  shadows: boolean;
  shadowMap: number;
  treeBudget: number;
  carBudget: number;
}
function qualityTierFor(cores: number): QualityTier {
  if (cores >= 6) return { shadows: true, shadowMap: 2048, treeBudget: 220, carBudget: 150 };
  if (cores >= 4) return { shadows: true, shadowMap: 1024, treeBudget: 120, carBudget: 80 };
  return { shadows: false, shadowMap: 512, treeBudget: 48, carBudget: 24 };
}

interface BuildingMeshEntry {
  mesh: Mesh | Group;
  /** Kit geometry is SHARED across buildings — never dispose per entry. */
  sharedGeometry: boolean;
  profession: string | null;
  tier: number;
  protection: string;
  /** Rendered body-top height in screen px (kit or procedural). */
  topPx: number;
}

export class ThreeScene {
  private readonly host: HTMLElement;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: OrthographicCamera;
  private readonly callbacks: CitySceneCallbacks;
  private readonly tier: QualityTier;

  // ── lighting + post ────────────────────────────────────────────────────
  private readonly sun: DirectionalLight;
  private readonly hemi: HemisphereLight;
  private readonly sky: SkyDome;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;

  // ── materials ──────────────────────────────────────────────────────────
  /** Per-skin lit facade materials (vertex colors = family albedo). */
  private readonly facadeMaterials = new Map<FacadeSkin, MeshStandardMaterial>();
  private readonly roofMaterial: MeshStandardMaterial;
  private readonly concreteMaterial: MeshStandardMaterial;
  private readonly distantMaterial: MeshStandardMaterial;
  private readonly asphaltMaterial: MeshStandardMaterial;
  private readonly sidewalkMaterial: MeshStandardMaterial;
  private readonly paintMaterial: MeshBasicMaterial;
  private readonly emissiveMaterial: MeshBasicMaterial;
  /** One shared vertex-color material per role — the day/night tint lever. */
  private readonly groundMaterial: MeshStandardMaterial;
  private readonly ringMaterial: MeshBasicMaterial;
  /**
   * Window channel materials (light identity): every building's seeded
   * lit-pane mosaic renders through FOUR SHARED materials (channel A/B ×
   * cardId parity), so the occupancy churn + day/night glow animates by
   * touching four colors per light-clock step — zero per-vertex updates —
   * while half the city flickers out of phase with the other half.
   */
  private readonly windowMaterials: MeshBasicMaterial[];
  private readonly streetMaterials: Material[];
  private readonly lockedPadMaterial: MeshBasicMaterial;
  private readonly flatMaterial: MeshBasicMaterial;
  private readonly textures: CityTextureKit | null;
  private readonly bodyMaterialArrays = new Map<string, Material[]>();

  // ── scene graph ─────────────────────────────────────────────────────────
  private readonly buildingsGroup = new Group();
  private readonly fixtures = new Group();
  private readonly worldLayers = new Group();
  private readonly satellitesGroup = new Group();
  private readonly propsGroup = new Group();
  /** Kenney City Kit pools (2026-09-30 pivot: real assets, CC0). */
  private readonly kitGroup = new Group();
  private kit: CityKit | null = null;
  private readonly familyKitMaterials = new Map<string, MeshStandardMaterial>();
  /** Every kit material clone (base + family tints) — night emissive lever. */
  private readonly kitMaterialVariants: MeshStandardMaterial[] = [];
  private kitLamps: InstancedMesh | null = null;
  private kitTrees: InstancedMesh | null = null;
  /** Kit traffic lights at intersections (roads kit GLB, instanced). */
  private kitTrafficLights: InstancedMesh | null = null;
  /** Kit ROAD-TILE street grid (Kenney 3D Road Tiles, per-material pools). */
  private kitStreets: Group | null = null;
  /** Kit satellite mini buildings (real Kenney models, per-prefab pools). */
  private kitSatelliteMinis: Group | null = null;
  /** Civic lots as kit buildings (tinted per kind, tier-scaled). */
  private civicGroup: Group | null = null;
  private civicKey = "";
  private civicMaterialClones: MeshStandardMaterial[] = [];
  private civicBeaconClones: MeshBasicMaterial[] = [];
  /** The world river (water tile plates; offset follows the universe). */
  private riverGroup: Group | null = null;
  /** Cities on the shared map — drives the river's ring-gap offset. */
  private universeCityCount = 0;
  private readonly useKitAssets: boolean = true;
  private groundMesh: Mesh | null = null;
  private hqMesh: Group | Mesh | null = null;
  private hqKey = "";
  private readonly monuments: Array<{ mesh: Group | Mesh; key: string }> = [];
  private selectionRing: Mesh | null = null;

  /** World layers (one merged mesh each; rebuilt per sync — pure derived). */
  private streetsMesh: Mesh | null = null;
  private countryRoadsMesh: Mesh | null = null;
  private lockedPadsMesh: Mesh | null = null;
  private lockedPadMaterialBasic: MeshBasicMaterial;
  private aggregateMesh: Mesh | null = null;
  private protectionMesh: Mesh | null = null;
  /** Instanced street life (rebuilt per sync). */
  private lampPoles: InstancedMesh | null = null;
  private lampHeads: InstancedMesh | null = null;
  private lampPools: InstancedMesh | null = null;
  private lampPoolMaterial: MeshBasicMaterial | null = null;
  private lampHeadMaterial: MeshBasicMaterial | null = null;
  private trees: InstancedMesh | null = null;
  private cars: InstancedMesh | null = null;

  /**
   * Universe world skylines: RING-CHUNKED merged meshes built PROGRESSIVELY
   * (a time-sliced pump) and rebuilt only when a ring's content signature
   * changes. Marker list stays flat for picking/selection.
   */
  private readonly universeRings = new Map<
    number,
    { key: string; mesh: Mesh; minis: number }
  >();
  private universeQueue: Array<{
    ring: number;
    key: string;
    markers: UniverseMarker[];
    cursor: number;
    minis: number;
    builder: MeshBuilder;
  }> = [];
  private universeTimer: ReturnType<typeof setTimeout> | null = null;
  private universeLodVisible = true;
  private readonly skylineCap: number;
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
    mesh: Object3D;
    fromX: number;
    fromZ: number;
    toX: number;
    toZ: number;
    start: number;
  }> = [];

  private daylight = 0;
  /** QA/dev override (fixed daylight factor; null = follow the clock). */
  private daylightOverride: number | null = null;
  private daylightTimer: ReturnType<typeof setTimeout> | null = null;
  /** Light-clock timer (window occupancy churn; reduced motion keeps it off). */
  private lightsTimer: ReturnType<typeof setTimeout> | null = null;

  private dirty = true;
  /** Shadow-map staleness (set by sync; consumed by the tick). */
  private shadowsDirty = true;
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
    this.tier = qualityTierFor(
      typeof navigator === "undefined" ? 8 : navigator.hardwareConcurrency || 4
    );

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(MAX_DPR, window.devicePixelRatio || 1));
    this.renderer.setSize(
      Math.max(1, init.host.clientWidth),
      Math.max(1, init.host.clientHeight)
    );
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.tier.shadows;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Shadows re-render ONLY when scene content changed (sync / glides /
    // pop-in) — light-clock color ticks reuse the cached shadow map.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.touchAction = "none";
    canvas.style.display = "block";
    init.host.appendChild(canvas);

    this.camera = new OrthographicCamera(-1, 1, 1, -1, CAM_NEAR, CAM_FAR);

    // Procedural surface textures (null on SSR — untextured fallbacks).
    this.textures = getCityTextures(
      this.renderer.capabilities.getMaxAnisotropy()
    );

    // ── materials (lit pipeline; vertex colors carry family albedo) ──────
    const mkFacade = (skin: FacadeSkin): MeshStandardMaterial => {
      const t = this.textures?.facades.get(skin);
      const m = new MeshStandardMaterial({
        vertexColors: true,
        side: FrontSide,
        roughness: 0.82,
        metalness: 0.05,
      });
      if (t) {
        m.map = t.map;
        m.normalMap = t.normalMap;
        m.normalScale = new Vector2(0.75, 0.75);
      }
      return m;
    };
    for (const skin of ["stone", "concrete", "brick", "adobe", "steel", "hangar", "glass"] as FacadeSkin[]) {
      this.facadeMaterials.set(skin, mkFacade(skin));
    }
    this.roofMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: FrontSide,
      roughness: 0.95,
      metalness: 0.03,
      map: this.textures?.roof.map ?? null,
      normalMap: this.textures?.roof.normalMap ?? null,
    });
    this.concreteMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: FrontSide,
      roughness: 0.9,
      metalness: 0.02,
      map: this.textures?.concrete.map ?? null,
    });
    this.distantMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: FrontSide,
      roughness: 0.92,
      metalness: 0.03,
      map: this.facadeMaterials.get("concrete")?.map ?? null,
    });
    this.asphaltMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      roughness: 0.96,
      metalness: 0.02,
      map: this.textures?.asphalt.map ?? null,
    });
    this.sidewalkMaterial = new MeshStandardMaterial({
      vertexColors: true,
      side: DoubleSide,
      roughness: 0.92,
      metalness: 0.02,
      map: this.textures?.concrete.map ?? null,
      normalMap: this.textures?.concrete.normalMap ?? null,
    });
    // Unlit emissive-look materials (bloom picks these up at night).
    const unlit = (opts: { vertexColors: boolean; opacity?: number; blending?: typeof AdditiveBlending } ) =>
      new MeshBasicMaterial({
        vertexColors: opts.vertexColors,
        toneMapped: false,
        transparent: opts.opacity !== undefined,
        opacity: opts.opacity ?? 1,
        blending: opts.blending ?? undefined,
        depthWrite: opts.blending !== AdditiveBlending,
        side: DoubleSide,
      });
    this.paintMaterial = unlit({ vertexColors: true });
    this.emissiveMaterial = unlit({ vertexColors: true });
    this.groundMaterial = new MeshStandardMaterial({
      color: GRASS_NIGHT.clone(),
      roughness: 1,
      metalness: 0,
      side: DoubleSide,
      map: this.textures?.grass.map ?? null,
    });
    this.ringMaterial = new MeshBasicMaterial({
      color: SELECTION_COLOR,
      side: DoubleSide,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    this.windowMaterials = [0, 1, 2, 3].map(
      () => new MeshBasicMaterial({ vertexColors: true, side: FrontSide, toneMapped: false })
    );
    // Street material array maps geometry groups (0 asphalt / 5 paint /
    // 7 concrete) onto asphalt/paint/sidewalk materials.
    const filler = this.asphaltMaterial;
    this.streetMaterials = [
      this.asphaltMaterial,
      filler,
      filler,
      filler,
      filler,
      this.paintMaterial,
      filler,
      this.sidewalkMaterial,
    ];
    this.lockedPadMaterialBasic = new MeshBasicMaterial({
      // Locked sectors read as faint survey plats, not black voids.
      color: "#2c3644",
      side: DoubleSide,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.lockedPadMaterial = this.lockedPadMaterialBasic;
    this.flatMaterial = new MeshBasicMaterial({
      vertexColors: true,
      side: DoubleSide,
      toneMapped: false,
    });

    // ── lights ────────────────────────────────────────────────────────────
    this.hemi = new HemisphereLight(HEMI_SKY_NIGHT.clone(), HEMI_GROUND_NIGHT.clone(), 0.3);
    this.sun = new DirectionalLight(SUN_DAY_COLOR.clone(), 1);
    this.sun.castShadow = this.tier.shadows;
    if (this.tier.shadows) {
      this.sun.shadow.mapSize.set(this.tier.shadowMap, this.tier.shadowMap);
      const sc = this.sun.shadow.camera;
      sc.left = -SHADOW_EXTENT;
      sc.right = SHADOW_EXTENT;
      sc.top = SHADOW_EXTENT;
      sc.bottom = -SHADOW_EXTENT;
      sc.near = 1;
      sc.far = 20000;
      this.sun.shadow.bias = -0.0002;
      this.sun.shadow.normalBias = 1.1;
    }
    const centerTile = macroCenter(GRID_SIZE);
    const center = tileToGround(centerTile.x, centerTile.y);
    this.sun.position.set(
      center.x + SUN_DIR.x * 9000,
      SUN_DIR.y * 9000,
      center.z + SUN_DIR.z * 9000
    );
    this.sun.target.position.set(center.x, 0, center.z);
    this.sun.target.updateMatrixWorld();
    this.scene.add(this.sun, this.sun.target, this.hemi);

    // ── sky + fog ─────────────────────────────────────────────────────────
    this.sky = new SkyDome();
    for (const o of this.sky.objects) this.scene.add(o);
    this.scene.fog = new Fog(new Color("#0d1830"), 5200, 13200);

    this.scene.add(
      this.worldLayers,
      this.buildingsGroup,
      this.fixtures,
      this.satellitesGroup,
      this.propsGroup,
      this.kitGroup
    );
    this.skylineCap = universeSkylineCapFor(
      typeof navigator === "undefined" ? 8 : navigator.hardwareConcurrency || 4
    );

    this.buildComposer();
  }

  /** Post chain: MSAA target → scene → night bloom → tone-mapped output. */
  private buildComposer(): void {
    const size = new Vector2(
      Math.max(1, this.host.clientWidth),
      Math.max(1, this.host.clientHeight)
    );
    const target = new WebGLRenderTarget(size.x, size.y, {
      samples: 4,
      type: HalfFloatType,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.setSize(size.x, size.y);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(size, 0.75, 0.55, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
  }

  /** Mount entry (mirrors CityScene.create; the mount picks by flag). */
  static async create(init: CitySceneInit): Promise<ThreeScene> {
    const scene = new ThreeScene(init);

    scene.buildGround();
    scene.buildSelectionRing();
    scene.daylight = scene.daylightOverride ?? daylightAt(Date.now());
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
    document.addEventListener("visibilitychange", scene.onVisibilityChange);

    scene.applyCamera(rig.state);
    scene.requestRender();
    scene.startLightClock();
    // Kenney City Kit (CC0): load in the background; when it lands, re-sync
    // swaps the procedural buildings/roads/trees for kit models. ?art=
    // procedural keeps the old renderer.
    if (
      scene.useKitAssets &&
      new URLSearchParams(window.location.search).get("art") !== "procedural"
    ) {
      loadCityKit().then((kit) => {
        if (scene.destroyed || !kit) return;
        scene.kit = kit;
        for (const m of kit.materials.values()) scene.kitMaterialVariants.push(m);
        if (scene.lastProjection) {
          // Force a FULL rebuild: the per-building change memo (profession/
          // tier/protection) would keep the procedural meshes alive.
          for (const [cardId, entry] of [...scene.buildings]) {
            scene.buildingsGroup.remove(entry.mesh);
            scene.disposeEntry(entry);
            scene.buildings.delete(cardId);
          }
          scene.hqKey = ""; // the HQ wrapper must switch to the kit too
          scene.sync(scene.lastProjection);
        }
        scene.applyDaylight();
        scene.requestRender();
      });
    }
    // Dev probe (QA): live scene state + daylight override for screenshots.
    if (process.env.NODE_ENV !== "production") {
      const probe = scene as unknown as Record<string, unknown>;
      probe.__setDaylight = (v: number | null) => scene.setDaylightOverride(v);
      (window as unknown as Record<string, unknown>).__city3d = scene;
    }
    return scene;
  }

  /** QA/dev: pin the daylight factor (null = follow the game clock). */
  setDaylightOverride(v: number | null): void {
    this.daylightOverride = v === null ? null : Math.max(0, Math.min(1, v));
    this.daylight = this.daylightOverride ?? daylightAt(Date.now());
    this.applyDaylight();
    this.requestRender();
  }

  // ── construction helpers ────────────────────────────────────────────────

  private buildGround(): void {
    const half = groundPlateHalfExtent();
    this.groundMesh = new Mesh(
      makeGroundGeometry(half),
      this.groundMaterial
    );
    this.groundMesh.receiveShadow = this.tier.shadows;
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
        this.disposeEntry(entry);
        this.buildingsGroup.remove(entry.mesh);
        const fresh = this.makeBuildingEntry(
          e.building.profession,
          e.building.tier as BuildingTier,
          e.building.cardId
        );
        fresh.mesh.position.copy(entry.mesh.position);
        entry = fresh;
        this.buildings.set(e.building.cardId, entry);
        this.buildingsGroup.add(entry.mesh);
      }
      if (!entry) {
        entry = this.makeBuildingEntry(
          e.building.profession,
          e.building.tier as BuildingTier,
          e.building.cardId
        );
        // Construct pop-in (scale.y 0→1; snapped under reduced motion).
        if (!this.policy.reduced) {
          entry.mesh.scale.y = 0.05;
          this.growing.push({ mesh: entry.mesh as Mesh, start: performance.now() });
        }
        this.buildingsGroup.add(entry.mesh);
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
        while (this.moving.length > MOVE_GLIDE_CAP) {
          const dropped = this.moving.shift();
          dropped?.mesh.position.set(dropped.toX, 0, dropped.toZ);
        }
      } else {
        entry.mesh.position.set(ground.x, 0, ground.z);
      }
    }
    // Removed buildings (sold/lost) — dispose geometry (kit geometry is
    // shared and survives).
    for (const [cardId, entry] of [...this.buildings]) {
      if (seen.has(cardId)) continue;
      this.buildingsGroup.remove(entry.mesh);
      this.disposeEntry(entry);
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
    this.syncCivic(projection);
    this.syncWorldLayers(projection, entries.map((e) => e.tile), resumeRing);
    this.syncSatellites(projection, sectorCount);
    this.shadowsDirty = true; // buildings/layers changed → refresh shadow map
    this.applyDaylight();
    this.updateSelectionRing();
    this.updateChips();
    this.requestRender();
  }

  /**
   * Global keys the street/tree passes must never pave or plant: the HQ
   * plaza, each monument tile and its one-tile moat (GLOBAL keys — the
   * reserved/moat sets use TileRef keys, a different format).
   */
  private globalFixtureBlock(): Set<string> {
    const blocked = new Set<string>();
    const blockAround = (gx: number, gy: number, r: number) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) blocked.add(`${gx + dx},${gy + dy}`);
      }
    };
    const hqG = globalTileOf(HQ_TILE);
    blockAround(hqG.x, hqG.y, 1);
    for (let i = 0; i < 6; i++) {
      const lg = globalTileOf(landmarkTile(i));
      blockAround(lg.x, lg.y, 1);
    }
    return blocked;
  }

  /** Macro-sector index of a GLOBAL tile (0..8), for unlock gating. */
  private sectorOfGlobalTile(gx: number, gy: number): number {
    const stride = macroStride(GRID_SIZE);
    for (let s = 0; s < SECTOR_MACRO.length; s++) {
      const m = SECTOR_MACRO[s];
      if (
        gx >= m.x * stride &&
        gx < m.x * stride + GRID_SIZE &&
        gy >= m.y * stride &&
        gy < m.y * stride + GRID_SIZE
      ) {
        return s;
      }
    }
    return 0;
  }

  /**
   * The full street set: the organic Chebyshev-1 grid around buildings
   * (deriveStreets) PLUS continuous ring boulevards just outside every
   * occupied building ring — concentric loops with zebra corners that make
   * the orbit layout read as a planned city grid (2026-09-30 "make it look
   * like a city" ruling). Boulevards respect fixture reservations and stop
   * at locked-sector edges.
   */
  private streetTilesFor(buildingTiles: readonly TileRef[]): StreetTile[] {
    const base = deriveHomeStreets(buildingTiles);
    const blocked = this.globalFixtureBlock();
    const hq = hqGlobalTile();
    const globals = buildingTiles.map((t) => {
      const g = globalTileOf(t);
      return { gx: g.x, gy: g.y };
    });
    const boulevards = deriveBoulevards(
      globals,
      { gx: hq.x, gy: hq.y },
      (gx, gy) => blocked.has(`${gx},${gy}`),
      (gx, gy) => this.sectorOfGlobalTile(gx, gy) < this.sectorCount
    );
    // Boulevard classification WINS on its ring: the organic grid would
    // pave the same tiles as noisy "cross" fragments; the continuous
    // directional loop (dashes along the ring, zebra only at corners) is
    // the city read we want.
    const boulKeys = new Set(boulevards.map((t) => `${t.gx},${t.gy}`));
    return [
      ...base.filter((t) => !boulKeys.has(`${t.gx},${t.gy}`)),
      ...boulevards,
    ];
  }

  /**
   * One building's scene entry: KIT geometry when the assets are loaded
   * (Kenney CC0 — deterministic prefab per card, family tint, seeded
   * quarter-turn), procedural otherwise. The kit path wraps the mesh in a
   * Group so glides/pop-in animate the wrapper without touching the kit
   * mesh's own scale/rotation.
   */
  private makeBuildingEntry(
    profession: string | null,
    tier: BuildingTier,
    cardId: number
  ): BuildingMeshEntry {

    if (this.kit) {
      const choice = pickBuildingPrefab(profession, tier, cardId);
      const key = `${choice.kit}/${choice.name}`;
      const geo = this.kit.geometries.get(key);
      if (geo) {
        const mat = this.familyKitMaterial(choice.kit, profession);
        const inner = new Mesh(geo, mat);
        inner.castShadow = this.tier.shadows;
        inner.receiveShadow = this.tier.shadows;
        // Normalize the footprint to ~72% of the tile (streets/grass stay
        // visible between buildings whatever the model's native size).
        const k = buildingKitScale(this.kit.footprints.get(key));
        inner.scale.setScalar(k);
        // Axis-aligned (0/π only): rectangular footprints stay parallel
        // to the street grid — the city-block read (2026-09-30 ruling).
        inner.rotation.y = (cardId & 1) * Math.PI;
        const group = new Group();
        group.add(inner);
        const h = this.kit.heights.get(key) ?? 1;
        return {
          mesh: group,
          sharedGeometry: true,
          profession,
          tier,
          protection: "",
          topPx: (h * k) / PIXEL_RISE,
        };
      }
    }
    const { geometry, topPx } = buildBuildingGeometry(profession, tier, cardId);
    const mesh = new Mesh(geometry, this.bodyMaterialsFor(profession));
    mesh.castShadow = this.tier.shadows;
    mesh.receiveShadow = this.tier.shadows;
    return {
      mesh,
      sharedGeometry: false,
      profession,
      tier,
      protection: "",
      topPx,
    };
  }

  /** Dispose an entry's own geometry (kit geometry is shared — kept). */
  private disposeEntry(entry: BuildingMeshEntry): void {
    if (entry.sharedGeometry) return;
    (entry.mesh as Mesh).geometry?.dispose();
  }

  /** Dispose the HQ wrapper (kit geometry is shared — kept). */
  private disposeHqMesh(): void {
    if (!this.hqMesh) return;
    if (!this.hqMesh.userData.shared) {
      this.hqMesh.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    }
    this.hqMesh = null;
  }

  /** Kit material clone tinted toward the family hue (cached per pair). */
  private familyKitMaterial(kit: KitName, profession: string | null): MeshStandardMaterial {
    const key = `${kit}/${profession ?? "__unassigned__"}`;
    const cached = this.familyKitMaterials.get(key);
    if (cached) return cached;
    const base = this.kit?.materials.get(kit);
    const mat = base ? base.clone() : new MeshStandardMaterial();
    mat.color.copy(familyTint(profession));
    this.familyKitMaterials.set(key, mat);
    this.kitMaterialVariants.push(mat);
    return mat;
  }

  /**
   * Streets + country roads + locked pads + aggregate rim + protection
   * rings + the instanced street-life kit (lamps, trees, cars).
   */
  private syncWorldLayers(
    projection: CitySceneProjection,
    buildingTiles: readonly TileRef[],
    resumeRing: number
  ): void {
    // Streets: derived road grid around the placed buildings + HQ. KIT ROAD
    // TILES (Kenney 3D Road Tiles — modeled curbs, sidewalks, grass verges,
    // zebra bars) when the kit + tiles are loaded; the procedural
    // micro-geometry grid otherwise.
    const streetTiles = this.streetTilesFor(buildingTiles);
    this.syncStreets(streetTiles);
    this.ensureRiver(this.universeCityCount);

    // Country connector roads toward the satellite anchors.
    const neighborCount = Math.min(8, (projection.neighbors ?? []).length);
    const anchors = Array.from({ length: neighborCount }, (_, slot) =>
      satelliteAnchor(slot, GRID_SIZE, this.sectorCount)
    );
    const roads = buildCountryRoadsGeometry(anchors, this.sectorCount);
    if (this.countryRoadsMesh) {
      this.worldLayers.remove(this.countryRoadsMesh);
      this.countryRoadsMesh.geometry.dispose();
    }
    this.countryRoadsMesh = new Mesh(roads.geometry, this.streetMaterials);
    this.countryRoadsMesh.receiveShadow = this.tier.shadows;
    this.worldLayers.add(this.countryRoadsMesh);

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
    this.aggregateMesh = new Mesh(agg.geometry, this.distantMaterial);
    this.aggregateMesh.receiveShadow = this.tier.shadows;
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

    this.syncStreetLife(streetTiles, resumeRing);
  }

  /**
   * The WORLD RIVER (2026-10-01): a water band in the always-empty gap
   * past the LAST populated universe ring (lib/city/river.ts — placement
   * pinned by tests; the offset slides outward when a new ring
   * populates). Instanced from the road-tiles pack's water plate.
   */
  private ensureRiver(cityCount: number): void {
    if (!this.kit) return;
    const offset = riverOffsetForCities(Math.max(0, cityCount));
    if (this.riverGroup && this.riverGroup.userData.offset === offset) return;
    if (this.riverGroup) {
      this.worldLayers.remove(this.riverGroup);
      this.riverGroup.traverse((o) => {
        const inst = o as unknown as {
          isInstancedMesh?: boolean;
          dispose?: () => void;
        };
        if (inst.isInstancedMesh) inst.dispose?.();
      });
      this.riverGroup = null;
    }
    const proto = this.kit.roadTiles.get("water");
    if (!proto) return;
    const tiles = deriveRiver(offset);
    const group = new Group();
    group.userData.offset = offset;
    const m4 = new Matrix4();
    const q = new Quaternion(); // identity — the water plate is symmetric
    const sc = new Vector3(ROAD_TILE_SCALE, ROAD_TILE_SCALE, ROAD_TILE_SCALE);
    const pv = new Vector3();
    for (const child of proto.children) {
      const protoMesh = child as Mesh;
      if (!(protoMesh as unknown as { isMesh?: boolean }).isMesh) continue;
      const inst = new InstancedMesh(
        protoMesh.geometry,
        protoMesh.material as Material,
        tiles.length
      );
      inst.receiveShadow = this.tier.shadows;
      inst.castShadow = false;
      inst.frustumCulled = false;
      tiles.forEach((t, i) => {
        const g = tileToGround(t.gx, t.gy);
        pv.set(g.x, 0, g.z);
        m4.compose(pv, q, sc);
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    }
    this.riverGroup = group;
    this.worldLayers.add(group);
  }

  /**
   * The street grid (2026-09-30 "nicer roads"): KENNEY 3D ROAD TILES when
   * the kit carries them — every street tile becomes one 3×3 road piece
   * with modeled curbs, sidewalk strips and grass verges; the zebra
   * variant accents intersection approaches. Each prototype primitive
   * (Grass/Stone/Asphalt/White) becomes ONE InstancedMesh, so the whole
   * grid is a handful of draw calls. Falls back to the procedural asphalt
   * grid when the tiles are absent.
   */
  private syncStreets(
    streetTiles: readonly import("@/lib/city/streets").StreetTile[]
  ): void {
    const clearKit = () => {
      if (!this.kitStreets) return;
      this.worldLayers.remove(this.kitStreets);
      this.kitStreets.traverse((o) => {
        const inst = o as unknown as {
          isInstancedMesh?: boolean;
          dispose?: () => void;
        };
        if (inst.isInstancedMesh) inst.dispose?.(); // instance buffers only
      });
      this.kitStreets = null;
    };
    const clearProcedural = () => {
      if (!this.streetsMesh) return;
      this.worldLayers.remove(this.streetsMesh);
      this.streetsMesh.geometry.dispose();
      this.streetsMesh = null;
    };

    const kit = this.kit;
    if (!kit || kit.roadTiles.size === 0) {
      clearKit();
      const streets = buildStreetsGeometry(streetTiles);
      clearProcedural();
      this.streetsMesh = new Mesh(streets.geometry, this.streetMaterials);
      this.streetsMesh.receiveShadow = this.tier.shadows;
      this.worldLayers.add(this.streetsMesh);
      return;
    }

    clearProcedural();
    clearKit();

    // Classify tiles → per-kind transforms. Straights that approach a
    // cross intersection along their travel axis get the ZEBRA variant
    // (a crosswalk at the corner — modeled white bars, 2026-09-30).
    const crossKeys = new Set(
      streetTiles
        .filter((t) => t.axis === "cross")
        .map((t) => `${t.gx},${t.gy}`)
    );
    const lists: Record<
      "straight" | "zebra" | "cross",
      Array<{ x: number; z: number; yaw: number }>
    > = { straight: [], cross: [], zebra: [] };
    for (const t of streetTiles) {
      const g = tileToGround(t.gx, t.gy);
      const { kind, yaw } = roadTileFor(t.axis);
      let finalKind = kind;
      if (kind === "straight") {
        const approaches =
          t.axis === "y"
            ? crossKeys.has(`${t.gx},${t.gy + 1}`) ||
              crossKeys.has(`${t.gx},${t.gy - 1}`)
            : crossKeys.has(`${t.gx + 1},${t.gy}`) ||
              crossKeys.has(`${t.gx - 1},${t.gy}`);
        if (approaches) finalKind = "zebra";
      }
      lists[finalKind].push({
        x: g.x,
        z: g.z,
        yaw:
          t.axis === "stub" ? ((t.gx + t.gy) & 1) * (Math.PI / 2) : yaw,
      });
    }

    const group = new Group();
    const tileM = new Matrix4();
    const primM = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const scale = new Vector3(ROAD_TILE_SCALE, ROAD_TILE_SCALE, ROAD_TILE_SCALE);
    const pos = new Vector3();
    for (const kind of ["straight", "zebra", "cross"] as const) {
      const proto = kit.roadTiles.get(kind);
      const list = lists[kind];
      if (!proto || list.length === 0) continue;
      for (const child of proto.children) {
        const protoMesh = child as Mesh;
        if (!(protoMesh as unknown as { isMesh?: boolean }).isMesh) continue;
        const inst = new InstancedMesh(
          protoMesh.geometry,
          protoMesh.material as Material,
          list.length
        );
        inst.receiveShadow = this.tier.shadows;
        inst.castShadow = false;
        // One pool spans the whole city grid — the per-geometry bounding
        // sphere would cull it wrongly.
        inst.frustumCulled = false;
        list.forEach((tf, i) => {
          q.setFromAxisAngle(up, tf.yaw);
          pos.set(tf.x, 0, tf.z);
          tileM.compose(pos, q, scale);
          primM.multiplyMatrices(tileM, protoMesh.matrix);
          inst.setMatrixAt(i, primM);
        });
        inst.instanceMatrix.needsUpdate = true;
        group.add(inst);
      }
    }
    this.kitStreets = group;
    this.worldLayers.add(group);
  }

  /**
   * Instanced street life: streetlight poles + emissive heads + warm night
   * pools at the lamp tiles, seeded trees in the green gaps, parked cars
   * along the travel streets. Rebuilt per sync (bounded, deterministic).
   */
  private syncStreetLife(streetTiles: readonly import("@/lib/city/streets").StreetTile[], resumeRing: number): void {
    for (const m of [this.lampPoles, this.lampHeads, this.lampPools, this.trees, this.cars]) {
      if (m) this.propsGroup.remove(m);
    }
    this.lampPoles?.geometry.dispose();
    this.lampHeads?.geometry.dispose();
    this.lampPools?.geometry.dispose();
    this.trees?.geometry.dispose();
    this.cars?.geometry.dispose();

    // Streetlights (poles cast soft shadows; heads glow; pools light roads).
    const lamps = streetLampSpots(streetTiles);
    if (this.kitLamps) {
      this.kitGroup.remove(this.kitLamps);
      this.kitLamps.geometry.dispose();
      this.kitLamps = null;
    }
    if (this.kitTrees) {
      this.kitGroup.remove(this.kitTrees);
      this.kitTrees.geometry.dispose();
      this.kitTrees = null;
    }
    if (this.kit && lamps.length > 0) {
      // KIT streetlights: one instanced pool over the lamp spots.
      const geoKey = "roads/light-square";
      const geo = this.kit.geometries.get(geoKey);
      const mat = this.kit.materials.get("roads");
      if (geo && mat) {
        const inst = new InstancedMesh(geo, mat, lamps.length);
        inst.castShadow = this.tier.shadows;
        const m4 = new Matrix4();
        const q = new Quaternion();
        const sc = new Vector3(LAMP_KIT_SCALE, LAMP_KIT_SCALE, LAMP_KIT_SCALE);
        const pv = new Vector3();
        lamps.forEach((l, i) => {
          q.setFromAxisAngle(new Vector3(0, 1, 0), ((l.seed & 3) * Math.PI) / 2);
          pv.set(l.x, 0, l.z);
          m4.compose(pv, q, sc);
          inst.setMatrixAt(i, m4);
        });
        inst.instanceMatrix.needsUpdate = true;
        this.kitLamps = inst;
        this.kitGroup.add(inst);
      }
    }
    if (this.kitTrafficLights) {
      this.kitGroup.remove(this.kitTrafficLights);
      this.kitTrafficLights.dispose(); // instance buffers only (geo shared)
      this.kitTrafficLights = null;
    }
    if (this.kit) {
      // Kit traffic lights: a deterministic subset of intersections (every
      // 4th by parity, capped — bounded rendering), one light per corner.
      const geo = this.kit.geometries.get(`roads/${TRAFFIC_LIGHT_PREFAB}`);
      const mat = this.kit.materials.get("roads");
      const spots = streetTiles
        .filter((t) => t.axis === "cross" && ((t.gx + t.gy) & 3) === 0)
        .slice(0, 48);
      if (geo && mat && spots.length > 0) {
        const inst = new InstancedMesh(geo, mat, spots.length);
        inst.castShadow = this.tier.shadows;
        inst.frustumCulled = false;
        const m4 = new Matrix4();
        const qq = new Quaternion();
        const scv = new Vector3(LAMP_KIT_SCALE, LAMP_KIT_SCALE, LAMP_KIT_SCALE);
        const pv2 = new Vector3();
        spots.forEach((t, i) => {
          const g = tileToGround(t.gx, t.gy);
          qq.setFromAxisAngle(
            new Vector3(0, 1, 0),
            ((t.gx + t.gy) & 1) * Math.PI * 0.5
          );
          pv2.set(g.x + TILE_STEP * 0.34, 0, g.z - TILE_STEP * 0.34);
          m4.compose(pv2, qq, scv);
          inst.setMatrixAt(i, m4);
        });
        inst.instanceMatrix.needsUpdate = true;
        this.kitTrafficLights = inst;
        this.kitGroup.add(inst);
      }
    }
    if (!this.kit && lamps.length > 0) {
      const poleGeo = buildStreetlightPole();
      const poleMat = new MeshStandardMaterial({
        color: "#2e333b",
        roughness: 0.6,
        metalness: 0.5,
      });
      this.lampPoles = new InstancedMesh(poleGeo, poleMat, lamps.length);
      this.lampPoles.castShadow = this.tier.shadows;
      const headGeo = this.kit ? null : buildStreetlightHead();
      if (!this.kit && !this.lampHeadMaterial) {
        this.lampHeadMaterial = new MeshBasicMaterial({
          vertexColors: true,
          toneMapped: false,
        });
      }
      if (headGeo) {
        this.lampHeads = new InstancedMesh(headGeo, this.lampHeadMaterial!, lamps.length);
      }
      // Light pool: flat additive decal at each lamp's base.
      if (!this.lampPoolMaterial) {
        this.lampPoolMaterial = new MeshBasicMaterial({
          map: this.textures?.lampPool ?? null,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          side: DoubleSide,
        });
      }
      const poolGeo = new PlaneGeometry(30, 30).rotateX(-Math.PI / 2);
      this.lampPools = new InstancedMesh(poolGeo, this.lampPoolMaterial, lamps.length);
      const poles = this.lampPoles;
      const heads = this.lampHeads;
      const pools = this.lampPools;
      if (poles && pools) {
        const mat4 = new Matrix4();
        lamps.forEach((l, i) => {
          mat4.makeTranslation(l.x, 0, l.z);
          poles.setMatrixAt(i, mat4);
          heads?.setMatrixAt(i, mat4);
          mat4.makeTranslation(l.x, this.Y_POOL + 0.4, l.z);
          pools.setMatrixAt(i, mat4);
        });
        poles.instanceMatrix.needsUpdate = true;
        if (heads) heads.instanceMatrix.needsUpdate = true;
        pools.instanceMatrix.needsUpdate = true;
        this.propsGroup.add(pools);
        if (heads) this.propsGroup.add(poles, heads);
        else this.propsGroup.add(poles);
      }
    } else {
      this.lampPoles = null;
      this.lampHeads = null;
      this.lampPools = null;
    }

    // Trees: seeded scatter over the green gaps around the MACRO CENTER
    // (global tiles — the city lives around macroCenter, not the origin).
    const paved = new Set(streetTiles.map((t) => `${t.gx},${t.gy}`));
    const blocked = this.globalFixtureBlock();
    const centerTile = macroCenter(GRID_SIZE);
    const cityRadius = Math.max(resumeRing, 8);
    const placements = planTrees(
      this.occupancyKeysGlobal(),
      paved,
      blocked,
      cityRadius + 16,
      this.tier.treeBudget,
      0x5eed11,
      { gx: Math.round(centerTile.x), gy: Math.round(centerTile.y) }
    );
    if (this.kit && placements.length > 0) {
      // KIT trees: two prefab pools (large/small) in one instanced mesh per
      // variant, tinted per instance.
      const geoLarge = this.kit.geometries.get("suburban/tree-large");
      const geoSmall = this.kit.geometries.get("suburban/tree-small");
      const mat = this.kit.treeMaterial;
      if (geoLarge && geoSmall) {
        const large = placements.filter((p) => p.variant === "round");
        const small = placements.filter((p) => p.variant !== "round");
        const mk = (geo: typeof geoLarge, list: typeof placements) => {
          const inst = new InstancedMesh(geo, mat, list.length);
          inst.castShadow = this.tier.shadows;
          const m4 = new Matrix4();
          const q = new Quaternion();
          const col = new Color();
          list.forEach((p, i) => {
            const k = TREE_KIT_SCALE * p.scale;
            q.setFromAxisAngle(new Vector3(0, 1, 0), p.jitter * Math.PI * 2);
            m4.compose(new Vector3(p.x, 0, p.z), q, new Vector3(k, k, k));
            inst.setMatrixAt(i, m4);
            col.setRGB(0.85 + p.jitter * 0.3, 0.95, 0.8);
            inst.setColorAt(i, col);
          });
          inst.instanceMatrix.needsUpdate = true;
          if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          this.kitGroup.add(inst);
          return inst;
        };
        this.kitTrees = large.length ? mk(geoLarge, large) : mk(geoSmall, small);
        if (large.length && small.length) mk(geoSmall, small);
      }
    } else if (placements.length > 0) {
      const roundGeo = buildTreeGeometry("round");
      const treeMat = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
      });
      const trees = new InstancedMesh(roundGeo, treeMat, placements.length);
      trees.castShadow = this.tier.shadows;
      const mat4 = new Matrix4();
      const col = new Color();
      placements.forEach((p, i) => {
        mat4.makeScale(p.scale, p.scale, p.scale);
        mat4.setPosition(p.x, 0, p.z);
        trees.setMatrixAt(i, mat4);
        // Hue jitter: lerp the canopy toward yellow-green or deep green.
        col.setRGB(0.85 + p.jitter * 0.3, 0.9 + p.jitter * 0.15, 0.8);
        trees.setColorAt(i, col);
      });
      trees.instanceMatrix.needsUpdate = true;
      if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
      this.trees = trees;
      this.propsGroup.add(trees);
    } else {
      this.trees = null;
    }

    // Parked cars along the travel streets.
    const carPlacements = planParkedCars(streetTiles, this.tier.carBudget, 0x1c9b3f);
    if (carPlacements.length > 0) {
      const carGeo = buildCarGeometry();
      const carMat = new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.35,
        metalness: 0.55,
      });
      const cars = new InstancedMesh(carGeo, carMat, carPlacements.length);
      cars.castShadow = this.tier.shadows;
      const mat4 = new Matrix4();
      carPlacements.forEach((p, i) => {
        mat4.makeRotationY(p.yaw);
        mat4.setPosition(p.x, this.Y_POOL, p.z);
        cars.setMatrixAt(i, mat4);
        cars.setColorAt(i, carColorAt(p.colorSeed));
      });
      cars.instanceMatrix.needsUpdate = true;
      if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
      this.cars = cars;
      this.propsGroup.add(cars);
    } else {
      this.cars = null;
    }
  }

  /** Occupancy keys as GLOBAL tile keys (the street/planning coordinate). */
  private occupancyKeysGlobal(): Set<string> {
    const out = new Set<string>();
    for (const tile of this.cardTiles.values()) {
      const g = globalTileOf(tile);
      out.add(`${g.x},${g.y}`);
    }
    return out;
  }

  /** Satellite mini-cities (foreign clusters on the anchor octants). */
  private syncSatellites(projection: CitySceneProjection, sectorCount: number): void {
    for (const [, s] of this.satelliteBuilds) {
      this.satellitesGroup.remove(s.mesh);
      s.mesh.geometry.dispose();
    }
    this.satelliteBuilds.clear();
    if (this.kitSatelliteMinis) {
      this.satellitesGroup.remove(this.kitSatelliteMinis);
      this.kitSatelliteMinis.traverse((o) => {
        const inst = o as unknown as {
          isInstancedMesh?: boolean;
          dispose?: () => void;
        };
        if (inst.isInstancedMesh) inst.dispose?.();
      });
      this.kitSatelliteMinis = null;
    }
    const neighbors = projection.neighbors ?? [];
    const kit = this.kit;
    neighbors.slice(0, 8).forEach((neighbor, slot) => {
      // Kit path: relay-only merged mesh — the mini buildings render as
      // REAL Kenney models below (2026-10-01 "kit minis for satellites").
      const built = buildSatelliteCluster(
        neighbor,
        slot,
        sectorCount,
        kit ? { minis: false } : {}
      );
      const mesh = new Mesh(built.geometry, this.distantMaterial);
      mesh.receiveShadow = this.tier.shadows;
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
    if (!kit) return;
    // Mini buildings: per-(prefab, profession) instanced pools — same
    // seeded prefab pick + family tint as the home city, at 0.8 scale.
    // Bounded: 8 clusters × NEIGHBOR_BUILDING_LIMIT 24 = 192 instances.
    const pools = new Map<
      string,
      { geo: import("three").BufferGeometry; mat: Material; list: Array<{ x: number; z: number; yaw: number; k: number }> }
    >();
    neighbors.slice(0, 8).forEach((neighbor, slot) => {
      for (const m of planSatelliteKitMinis(neighbor, slot, sectorCount)) {
        const pick = pickBuildingPrefab(m.profession, m.tier as BuildingTier, m.cardId);
        const geoKey = `${pick.kit}/${pick.name}`;
        const geo = kit.geometries.get(geoKey);
        if (!geo) continue;
        const mat = this.familyKitMaterial(pick.kit, m.profession);
        const key = `${geoKey}|${m.profession ?? "_"}`;
        let pool = pools.get(key);
        if (!pool) {
          pool = { geo, mat, list: [] };
          pools.set(key, pool);
        }
        const k = buildingKitScale(kit.footprints.get(geoKey)) * 0.8;
        const g = tileToGround(m.gx, m.gy);
        pool.list.push({ x: g.x, z: g.z, yaw: (m.cardId & 1) * Math.PI, k });
      }
    });
    if (pools.size === 0) return;
    const group = new Group();
    const m4 = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const pv = new Vector3();
    const up = new Vector3(0, 1, 0);
    for (const pool of pools.values()) {
      const inst = new InstancedMesh(pool.geo, pool.mat, pool.list.length);
      inst.castShadow = false; // distant minis — skip shadow cost
      inst.receiveShadow = this.tier.shadows;
      inst.frustumCulled = false; // pools span the whole world
      pool.list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        sc.setScalar(p.k);
        pv.set(p.x, 0, p.z);
        m4.compose(pv, q, sc);
        inst.setMatrixAt(i, m4);
      });
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    }
    this.kitSatelliteMinis = group;
    this.satellitesGroup.add(group);
  }

  private syncHq(projection: CitySceneProjection): void {
    const stage = projection.hqStage ?? 1;
    const key = `hq|${stage}|${this.kit ? "kit" : "proc"}`;
    if (this.hqKey !== key) {
      if (this.hqMesh) {
        this.fixtures.remove(this.hqMesh);
        this.disposeHqMesh();
      }
      const wrapper = new Group();
      if (this.kit) {
        // Kit HQ: a grand skyscraper, stage-scaled (shared geometry).
        const geoKey = HQ_KIT_PREFAB;
        const geo = this.kit.geometries.get(geoKey);
        const h = this.kit.heights.get(geoKey) ?? 2.9;
        if (geo) {
          const inner = new Mesh(geo, this.familyKitMaterial("commercial", null));
          inner.castShadow = this.tier.shadows;
          inner.receiveShadow = this.tier.shadows;
          const base = buildingKitScale(this.kit.footprints.get(geoKey));
          const k = base * hqStageScale(stage);
          inner.scale.setScalar(k);
          wrapper.userData.shared = true;
          wrapper.userData.topPx = (h * k) / PIXEL_RISE;
          wrapper.add(inner);
        }
      }
      if (!wrapper.children.length) {
        const { geometry, topPx } = buildHqGeometry(stage);
        const mesh = new Mesh(geometry, this.bodyMaterialsFor(null, "stone"));
        mesh.castShadow = this.tier.shadows;
        mesh.receiveShadow = this.tier.shadows;
        wrapper.userData.topPx = topPx;
        wrapper.add(mesh);
      }
      this.hqMesh = wrapper;
      this.fixtures.add(wrapper);
      this.hqKey = key;
    }
    const g = globalTileOf(HQ_TILE);
    const ground = tileToGround(g.x, g.y);
    this.hqMesh?.position.set(ground.x, 0, ground.z);
  }

  /** Monument kit prefabs live in assets3d (MONUMENT_KIT_PREFABS) — shared
   *  with the catalog so the two never drift. */

  /**
   * CIVIC LOTS in 3D (2026-10-01): the four ring-4 diagonal reservations
   * render as tinted kit buildings with a civic beacon — same shape
   * language as the monuments, one notch smaller. Tier 0 keeps them empty
   * (locked reservations, as before). The 2D renderer keeps its own art.
   */
  private syncCivic(projection: CitySceneProjection): void {
    const tier = projection.civic?.tier ?? 0;
    const key = `civic|${tier}|${this.kit ? "kit" : "proc"}`;
    if (this.civicKey === key) return;
    this.civicKey = key;
    if (this.civicGroup) {
      this.fixtures.remove(this.civicGroup);
      for (const m of this.civicMaterialClones) m.dispose();
      for (const m of this.civicBeaconClones) m.dispose();
      this.civicMaterialClones = [];
      this.civicBeaconClones = [];
      this.civicGroup = null;
    }
    if (tier === 0 || !this.kit) return;
    const kit = this.kit;
    const group = new Group();
    CIVIC_KINDS.forEach((kind, i) => {
      const prefab = civicKitPrefab(kind);
      const geoKey = `${prefab.kit}/${prefab.name}`;
      const geo = kit.geometries.get(geoKey);
      const base = kit.materials.get(prefab.kit);
      if (!geo || !base) return;
      const accent = new Color(CIVIC_NEON[kind]);
      const mat = base.clone();
      // Premultiply a light gray base so the ACCENT dominates the kit's
      // warm colormap (0.85 lerp alone still reads "salmon" at overview).
      mat.color.copy(new Color(0.85, 0.85, 0.85).lerp(accent, CIVIC_TINT));
      mat.emissiveMap = null;
      mat.emissive = accent.clone().multiplyScalar(CIVIC_EMISSIVE);
      this.civicMaterialClones.push(mat);
      const k =
        buildingKitScale(kit.footprints.get(geoKey)) * civicTierScale(tier);
      const h = kit.heights.get(geoKey) ?? 2.9;
      const mesh = new Mesh(geo, mat);
      mesh.scale.setScalar(k);
      mesh.castShadow = this.tier.shadows;
      mesh.receiveShadow = this.tier.shadows;
      const beaconMat = new MeshBasicMaterial({ color: accent, toneMapped: false });
      this.civicBeaconClones.push(beaconMat);
      const beacon = new Mesh(CIVIC_BEACON_GEO, beaconMat);
      beacon.position.y = h * k * 1.1547 + 2;
      const wrap = new Group();
      wrap.userData.shared = true; // kit geometry shared — keep on dispose
      wrap.add(mesh, beacon);
      const t = civicTileRef(i);
      const g = globalTileOf(t);
      const ground = tileToGround(g.x, g.y);
      wrap.position.set(ground.x, 0, ground.z);
      group.add(wrap);
    });
    this.civicGroup = group;
    this.fixtures.add(group);
  }

  private syncMonuments(projection: CitySceneProjection): void {
    for (let i = 0; i < 6; i++) {
      const lm = projection.landmarks[i];
      const stage = lm?.stage ?? 1;
      const owned = lm?.owned ?? false;
      const key = `m${i}|${stage}|${owned ? 1 : 0}|${this.kit ? "kit" : "proc"}`;
      let slot = this.monuments[i];
      if (!slot || slot.key !== key) {
        if (slot) {
          this.fixtures.remove(slot.mesh);
          this.disposeMonument(slot.mesh);
        }
        const group = new Group();
        const accent = new Color(LANDMARK_COLORS[i % LANDMARK_COLORS.length]);
        let topPx = 120;
        if (this.kit) {
          // LANDMARK as a grand kit tower, strongly tinted in the
          // Founder's accent color (unowned monuments go dim/gray), on a
          // beacon-capped silhouette that reads from any zoom.
          const geoKey = MONUMENT_KIT_PREFABS[i % MONUMENT_KIT_PREFABS.length];
          const geo = this.kit.geometries.get(geoKey);
          const fp = this.kit.footprints.get(geoKey);
          const h = this.kit.heights.get(geoKey) ?? 2.9;
          if (geo) {
            const tint = owned
              ? new Color(1, 1, 1).lerp(accent, MONUMENT_TINT)
              : new Color(0.62, 0.64, 0.68);
            const mat = this.kit.materials.get("commercial")!.clone();
            mat.color.copy(tint);
            // Night identity: the Founder's accent glows from within after
            // dark (unowned monuments keep a cold ember).
            mat.emissiveMap = null;
            mat.emissive = owned ? accent.clone().multiplyScalar(MONUMENT_EMISSIVE) : new Color(0.05, 0.06, 0.09);
            this.kitMaterialVariants.push(mat);
            const inner = new Mesh(geo, mat);
            inner.castShadow = this.tier.shadows;
            inner.receiveShadow = this.tier.shadows;
            const base = buildingKitScale(fp);
            const k = base * monumentStageScale(stage);
            inner.scale.setScalar(k);
            group.add(inner);
            // Beacon: the Founder's light at the crown (emissive, blooms).
            const beaconMat = new MeshBasicMaterial({
              color: owned ? accent : new Color(0.35, 0.38, 0.45),
              toneMapped: false,
            });
            const beacon = new Mesh(new BoxGeometry(7.5, 6, 7.5), beaconMat);
            beacon.position.y = h * k * 1.1547 + 3;
            group.add(beacon);
            topPx = (h * k) / PIXEL_RISE + 6;
          }
        }
        if (!group.children.length) {
          const { geometry, topPx: p } = buildMonumentGeometry(i, stage, owned);
          const mesh = new Mesh(geometry, this.bodyMaterialsFor(null, "concrete"));
          mesh.castShadow = this.tier.shadows;
          mesh.receiveShadow = this.tier.shadows;
          group.userData.shared = false;
          group.add(mesh);
          topPx = p;
        } else {
          group.userData.shared = true; // kit geometry is shared — keep
        }
        group.userData.topPx = topPx;
        this.fixtures.add(group);
        slot = { mesh: group, key };
        this.monuments[i] = slot;
      }
      const t = landmarkTile(i);
      const g = globalTileOf(t);
      const ground = tileToGround(g.x, g.y);
      slot.mesh.position.set(ground.x, 0, ground.z);
    }
  }

  /** Dispose a monument wrapper (kit geometry is shared — kept). */
  private disposeMonument(mesh: Group | Mesh): void {
    if (mesh.userData?.shared) return;
    mesh.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
  }

  /**
   * Shared universe map — EVERY ranked city fully rendered as its real
   * skyline, on the FIXED WORLD_BASE_RING. Rebuilds are ring-chunked +
   * signature-gated; the pump below builds them without blocking input.
   */
  syncUniverse(payload: UniversePayload | null, viewerUsername: string): void {
    if (this.destroyed) return;
    const stake = (this.lastProjection?.neighbors ?? []).map((n) => n.username);
    const { markers, count, viewerRank } = deriveUniverseMarkers(
      payload,
      viewerUsername,
      stake
    );
    this.universeMarkers = markers;
    this.universeCityCount = payload?.cities?.length ?? 0;

    const byRing = new Map<number, UniverseMarker[]>();
    for (const m of markers) {
      const ring = universeRingForRank(m.rank);
      const list = byRing.get(ring);
      if (list) list.push(m);
      else byRing.set(ring, [m]);
    }
    if (this.universeTimer !== null) {
      clearTimeout(this.universeTimer);
      this.universeTimer = null;
    }
    this.universeQueue = [];
    for (const [ring, ringMarkers] of byRing) {
      const key = universeRingSignature(ringMarkers, this.skylineCap);
      const existing = this.universeRings.get(ring);
      if (existing && existing.key === key) continue;
      this.disposeUniverseRing(ring);
      this.universeQueue.push({
        ring,
        key,
        markers: ringMarkers,
        cursor: 0,
        minis: 0,
        builder: new MeshBuilder(),
      });
    }
    for (const ring of [...this.universeRings.keys()]) {
      if (!byRing.has(ring)) this.disposeUniverseRing(ring);
    }
    if (this.universeQueue.length > 0) this.pumpUniverseBuild();

    cityWorldStore.getState().setUniverseSummary(
      count > 0
        ? { count, myRank: viewerRank <= count ? viewerRank : null }
        : null
    );
    this.requestRender();
  }

  private disposeUniverseRing(ring: number): void {
    const slot = this.universeRings.get(ring);
    if (!slot) return;
    this.worldLayers.remove(slot.mesh);
    slot.mesh.geometry.dispose();
    this.universeRings.delete(ring);
  }

  /**
   * Time-sliced world builder: appends whole cities into the active ring's
   * MeshBuilder until the slice budget is spent, then yields and continues
   * — the world completes without blocking input.
   */
  private pumpUniverseBuild(): void {
    if (this.destroyed) return;
    const SLICE_MS = 24;
    const start = performance.now();
    while (this.universeQueue.length > 0) {
      const job = this.universeQueue[0];
      while (
        job.cursor < job.markers.length &&
        performance.now() - start < SLICE_MS
      ) {
        job.minis += appendUniverseCity(
          job.builder,
          job.markers[job.cursor],
          this.skylineCap
        );
        job.cursor++;
      }
      if (job.cursor < job.markers.length) break;
      const mesh = new Mesh(job.builder.toGeometry(), this.distantMaterial);
      mesh.visible = this.universeLodVisible;
      this.worldLayers.add(mesh);
      this.universeRings.set(job.ring, {
        key: job.key,
        mesh,
        minis: job.minis,
      });
      this.universeQueue.shift();
      if (performance.now() - start >= SLICE_MS) break;
    }
    this.requestRender();
    if (this.universeQueue.length > 0) {
      this.universeTimer = setTimeout(() => this.pumpUniverseBuild(), 0);
    } else {
      this.universeTimer = null;
    }
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

  /** Rings the monument tile (same selection read as buildings). */
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

  /** Civic lots are 2D-only today — no-op. */
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
      toneMapped: false,
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
    // The sky dome rides the camera target (ortho pan safety).
    this.sky.followTarget(target.x, target.z);
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
    // Universe world hides at close zoom: deep-zoom inspection doesn't pay
    // for far-world vertices.
    const showUniverse = lod !== "close";
    if (showUniverse !== this.universeLodVisible) {
      this.universeLodVisible = showUniverse;
      for (const [, ring] of this.universeRings) ring.mesh.visible = showUniverse;
    }
    // Chips follow the camera (settle-cadence, never per frame).
    this.updateChips();
  }

  /**
   * Tap ladder (subset of the Pixi scene's forgiveness ladder): exact
   * building tile → landmark tile → HQ tile → nearest tower within a
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
    // Universe city buildings: forgiving body hit.
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
      const entry = this.buildings.get(cardId);
      const top = entry?.topPx ?? familyTopHeightPx(b.profession, b.tier);
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
    this.composer?.setSize(width, height);
    this.bloomPass?.setSize(width, height);
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
   * the HQ owner plate, and the selected building's name chip.
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

    for (const info of this.lastProjection.sectorInfo) {
      if (!info.unlocked) continue;
      const label = this.strings.sectorLabel(info);
      if (!label) continue;
      const c = globalTile(info.index, GRID_SIZE >> 1, GRID_SIZE >> 1, GRID_SIZE);
      const p = place(tileToScreen(c.x, c.y), -340);
      nodes.push(this.chipNode(label, p.x, p.y, false));
    }

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

    if (this.selectedCardId !== null) {
      const tile = this.cardTiles.get(this.selectedCardId);
      const b = this.buildingsById.get(this.selectedCardId);
      if (tile && b) {
        const p = worldPointOfTile(tile);
        const entry = this.buildings.get(this.selectedCardId!);
        const top = entry?.topPx ?? familyTopHeightPx(b.profession, b.tier);
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
      const mat = new MeshBasicMaterial({ side: DoubleSide, toneMapped: false });
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
    const entry = this.buildings.get(this.selectedCardId!);
    const top = entry?.topPx ?? familyTopHeightPx(b.profession, b.tier);
    this.billboard.position.set(ground.x, (top + 34) * PIXEL_RISE, ground.z);
    this.billboard.quaternion.copy(this.camera.quaternion);
    this.billboard.visible = true;
  }

  // ── daylight: the one consistent sun ────────────────────────────────────

  /** Street-life anchor heights (world units above terrain). */
  private get Y_POOL(): number {
    return 1.3;
  }

  /**
   * Building material array: [family facade skin, window channels A0/A1/
   * B0/B1, emissive, roof, concrete]. Cached per profession (the window
   * channel materials are shared city-wide).
   */
  private bodyMaterialsFor(
    profession: string | null,
    forceSkin?: FacadeSkin
  ): Material[] {
    const skin = forceSkin ?? familySkinOf(profession);
    const key = forceSkin ? `*${skin}` : (profession ?? "__unassigned__");
    const cached = this.bodyMaterialArrays.get(key);
    if (cached) return cached;
    const facade = this.facadeMaterials.get(skin) ?? this.facadeMaterials.get("concrete")!;
    const arr: Material[] = [
      facade,
      this.windowMaterials[0],
      this.windowMaterials[1],
      this.windowMaterials[2],
      this.windowMaterials[3],
      this.emissiveMaterial,
      this.roofMaterial,
      this.concreteMaterial,
    ];
    this.bodyMaterialArrays.set(key, arr);
    return arr;
  }

  /**
   * Re-aim the whole lighting rig from the daylight factor: sky palette +
   * sun/moon discs + stars, sun color/intensity, hemisphere fill, ACES
   * exposure, bloom strength, ground tint, window glow, lamp pools. Runs
   * on sync + every light-clock tick while a ramp is in flight.
   */
  private applyDaylight(): void {
    const d = Math.max(0, Math.min(1, this.daylight));
    const warm = Math.max(0, 1 - Math.abs(d * 2 - 1)); // dawn/dusk factor

    this.sky.update(d);
    if (this.scene.fog) {
      this.sky.horizonColor(this.scene.fog.color);
      this.scene.fog.color.multiplyScalar(0.92);
    }

    // Sun: warm + low near the ramps, pale + strong at noon; the same
    // azimuth ALWAYS (SC4's consistent-light rule — shadows never swing).
    // Intensities are calibrated for three's physical light units (÷π BRDF).
    this.sun.intensity = 0.18 + 9.2 * Math.pow(d, 0.85);
    this.sun.color.copy(SUN_DUSK_COLOR).lerp(SUN_DAY_COLOR, Math.min(1, d * 1.6));
    this.hemi.intensity = 0.95 + 1.35 * d;
    this.hemi.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, d);
    this.hemi.groundColor.copy(HEMI_GROUND_NIGHT).lerp(HEMI_GROUND_DAY, d);
    this.renderer.toneMappingExposure = 1.3 + 0.16 * d + warm * 0.06;

    // Night bloom on emissives (windows/lamps/neon); day keeps a faint
    // sheen so glass still sparkles in the sun.
    if (this.bloomPass) {
      this.bloomPass.strength = 0.12 + 0.72 * (1 - d);
      this.bloomPass.threshold = 0.95 - 0.14 * (1 - d);
    }

    this.groundMaterial.color.copy(GRASS_NIGHT).lerp(GRASS_DAY, d);
    this.groundMaterial.color.multiplyScalar(1.4);
    this.updateWindowLights(performance.now());

    // KIT night windows: derived emissive maps glow after dark (a soft
    // global occupancy wobble keeps them alive without per-instance work).
    const night = 1 - d;
    const kitGlow = 2.6 * Math.pow(night, 1.1);
    for (const m of this.kitMaterialVariants) {
      m.emissiveIntensity = kitGlow;
    }
    if (this.lampHeadMaterial) {
      this.lampHeadMaterial.color.setRGB(
        0.45 + 0.55 * night,
        0.36 + 0.47 * night,
        0.24 + 0.31 * night
      );
    }
    if (this.lampPoolMaterial) {
      this.lampPoolMaterial.opacity = 0.85 * Math.pow(night, 1.3);
      this.lampPoolMaterial.visible = night > 0.02;
    }
    this.dirty = true;
  }

  /**
   * Window-channel colors at time t — the 3D twin of the Pixi light clock:
   * windowFlickerAt's two occupancy channels dim the lit panes city-wide,
   * SPLIT by cardId parity, scaled by facadeGlowAt(daylight).
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
   * Quantized light animation: window colors, daylight ramp tracking, root
   * beam pulse + ONE render per step; no timer churn between steps. Reduced
   * motion never starts the clock (daylight follows the coarse poll).
   */
  private startLightClock(): void {
    if (this.policy.reduced || this.lightsTimer !== null) return;
    const step = () => {
      if (this.destroyed) return;
      const t = performance.now();
      this.updateWindowLights(t);
      // Continuous daylight: the 250 ms clock tracks the dawn/dusk ramps
      // (the game day is one real hour — a ramp spans ~2.5 real minutes).
      const next = this.daylightOverride ?? daylightAt(Date.now());
      if (Math.abs(next - this.daylight) > 0.004) {
        this.daylight = next;
        this.applyDaylight();
      }
      if (this.rootBeams) {
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
      const next = this.daylightOverride ?? daylightAt(Date.now());
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
    const moved = this.updateMoves(performance.now());
    const growing = this.updateGrowing(performance.now());
    busy = busy || moved || growing;
    if (this.dirty || busy) {
      const now = performance.now();
      if (this.tier.shadows) {
        // Shadow maps refresh only when scene CONTENT changed (sync covers
        // all layer rebuilds; glides/pop-in flag here) — the 250 ms light
        // ticks reuse the cached map.
        this.renderer.shadowMap.needsUpdate =
          this.shadowsDirty || moved || growing;
      }
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      this.shadowsDirty = false;
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
    for (const entry of this.buildings.values()) this.disposeEntry(entry);
    this.buildings.clear();
    this.disposeHqMesh();
    for (const m of this.monuments) this.disposeMonument(m.mesh);
    this.monuments.length = 0;
    this.groundMesh?.geometry.dispose();
    this.selectionRing?.geometry.dispose();
    this.streetsMesh?.geometry.dispose();
    this.countryRoadsMesh?.geometry.dispose();
    this.lockedPadsMesh?.geometry.dispose();
    this.aggregateMesh?.geometry.dispose();
    this.protectionMesh?.geometry.dispose();
    for (const m of [this.lampPoles, this.lampHeads, this.lampPools, this.trees, this.cars]) {
      m?.geometry.dispose();
      (m?.material as Material | undefined)?.dispose?.();
    }
    if (this.universeTimer !== null) {
      clearTimeout(this.universeTimer);
      this.universeTimer = null;
    }
    this.universeQueue = [];
    for (const [, ring] of this.universeRings) ring.mesh.geometry.dispose();
    this.universeRings.clear();
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
    if (this.rootBeams) {
      this.rootBeams.geometry.dispose();
      (this.rootBeams.material as MeshBasicMaterial).dispose();
    }
    this.kitLamps?.geometry.dispose();
    this.kitTrees?.geometry.dispose();
    this.kitTrafficLights?.dispose(); // instance buffers (geometry is shared kit)
    this.kitLamps = null;
    this.kitTrees = null;
    this.kitTrafficLights = null;
    if (this.kitStreets) {
      this.kitStreets.traverse((o) => {
        const inst = o as unknown as {
          isInstancedMesh?: boolean;
          dispose?: () => void;
        };
        if (inst.isInstancedMesh) inst.dispose?.();
      });
      this.kitStreets = null;
    }
    if (this.kitSatelliteMinis) {
      this.kitSatelliteMinis.traverse((o) => {
        const inst = o as unknown as {
          isInstancedMesh?: boolean;
          dispose?: () => void;
        };
        if (inst.isInstancedMesh) inst.dispose?.();
      });
      this.kitSatelliteMinis = null;
    }
    if (this.riverGroup) {
      this.riverGroup.traverse((o) => {
        const inst = o as unknown as {
          isInstancedMesh?: boolean;
          dispose?: () => void;
        };
        if (inst.isInstancedMesh) inst.dispose?.();
      });
      this.riverGroup = null;
    }
    for (const m of this.civicMaterialClones) m.dispose();
    for (const m of this.civicBeaconClones) m.dispose();
    this.civicMaterialClones = [];
    this.civicBeaconClones = [];
    this.civicGroup = null;
    for (const m of this.familyKitMaterials.values()) m.dispose();
    this.familyKitMaterials.clear();
    this.kitMaterialVariants.length = 0;
    this.kit?.dispose();
    this.kit = null;
    this.sky.dispose();
    this.composer?.dispose?.();
    for (const m of this.facadeMaterials.values()) m.dispose();
    this.roofMaterial.dispose();
    this.concreteMaterial.dispose();
    this.distantMaterial.dispose();
    this.asphaltMaterial.dispose();
    this.sidewalkMaterial.dispose();
    this.paintMaterial.dispose();
    this.emissiveMaterial.dispose();
    this.groundMaterial.dispose();
    this.ringMaterial.dispose();
    for (const m of this.windowMaterials) m.dispose();
    this.lockedPadMaterialBasic.dispose();
    this.flatMaterial.dispose();
    disposeCityTextures();
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

/** Ground-plane quad centered on its own origin, with tiled grass UVs. */
function makeGroundGeometry(half: number): BufferGeometry {
  const g = new BufferGeometry();
  const S = 46; // world units per grass texture tile
  g.setAttribute(
    "position",
    new Float32BufferAttribute(
      [-half, 0, -half, half, 0, -half, half, 0, half, -half, 0, half],
      3
    )
  );
  // Up-facing normals — without these the lit ground gets ZERO diffuse
  // (a missing normal attribute reads as (0,0,0) in the shader).
  g.setAttribute(
    "normal",
    new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)
  );
  g.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, (half * 2) / S, 0, (half * 2) / S, (half * 2) / S, 0, (half * 2) / S], 2)
  );
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Renderer-agnostic factory for CitySceneMount's flag switch. */
export async function createScene(init: CitySceneInit): Promise<ThreeScene> {
  return ThreeScene.create(init);
}
