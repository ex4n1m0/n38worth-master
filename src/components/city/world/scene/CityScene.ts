/**
 * Mainframe City — scene controller (client-only Pixi; the ONLY module that
 * owns a Pixi Application). Mounted exclusively through CitySceneMount inside
 * CitySceneHost's next/dynamic(ssr:false) chunk.
 *
 * Responsibilities (RTS plan §D1 deliverable 2 + §Phase C):
 * - Application init: WebGL preference, DPR capped at 2, own ResizeObserver
 *   (the pixi ticker is stopped — see below — so resize cannot ride it).
 * - RENDER-ON-DEMAND: app.ticker.stop() right after init; a single
 *   self-suspending rAF loop renders only while a dirty flag, camera
 *   activity, FX, or a district-link pulse sweep require it (zero RAF idle).
 * - sync(projection, queue): pure diffBuildings → IsoWorld update +
 *   construct/loss/tier-up FX; aggregate skyline; landmarks; HQ core;
 *   data paths (HQ connections, visual only); district data links +
 *   completion glow (derived from the projection, never forked).
 * - Phase D: locked-sector pads + identity chips (server sectorInfo),
 *   sector-unlock FX, viewport culling on camera-settle/sync, LOD-swap
 *   crossfades (aggregate skyline + sprite detail), and the LOD band
 *   pushed into the world store for the DOM world summary.
 * - VALUE-ORBIT placement (2026-09-27): rankArrangeTiles derives every
 *   building's tile from live value order — landmarks + HQ hold the
 *   center, priciest buildings ring them, cheapest sprawl the rim — and
 *   re-ranked buildings GLIDE to their new ring (reduced motion: snap).
 * - Tap picking (iso math), selection visuals + floating name chip, camera
 *   focus for the a11y mirror list.
 * - Locale-aware STRINGS (tier-up flash, lost-signal chip, HQ CORE tag,
 *   display names, sector labels) supplied by the React shell via
 *   setStrings() — the scene itself never imports i18n.
 * - Day/night cycle (2026-09-28): 1 real hour = 1 game day — 30 real
 *   minutes of day, 30 of night (daylight.ts). Daylight crossfades a blue
 *   day sky over the night backdrop and adds a screen-blend wash that
 *   brightens floor + buildings; night keeps the current dark ambience.
 *   A wake timer sleeps through the steady plateaus; during each ramp the
 *   factor is tracked CONTINUOUSLY per frame (smooth drift, no steps).
 *
 * The scene is a RENDERER of server state: tier / protection / sectors /
 * placements all arrive via the projection and are never recomputed here.
 */

import { Application, ColorMatrixFilter, Container, FillGradient, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { GRID_SIZE, SECTOR_KEYS } from "@/lib/city/layout-schema";
import type { CityBuilding, CityProjection, CitySectorInfo } from "@/lib/city/types";
import {
  rootSequenceKey,
  type RootSequenceVisualState,
} from "@/lib/city/root-sequence";
import { diffBuildings } from "@/lib/city/scene/diff";
import { lodFor, type Lod } from "@/lib/city/scene/lod";
import {
  clamp01,
  easeOutCubic,
  resolveMotion,
  type MotionPolicy,
} from "@/lib/city/scene/motion";
import { daylightAt, nextDaylightBoundaryAt } from "@/lib/city/scene/daylight";
import { clampCamera, ZOOM_MIN, type CameraState } from "@/lib/city/scene/camera";
import { visibleWorldRect } from "@/lib/city/scene/culling";
import { TILE_W, pickTile, sectorWorldBounds } from "@/lib/city/scene/iso";
import { rankArrangeTiles, type TileRef } from "@/lib/city/placement";
import type { UniversePayload } from "@/lib/city/universe";
import {
  districtRepresentatives,
  districtsFromFamilies,
} from "@/lib/city/district";
import { cityWorldStore } from "@/lib/city/scene/store";
import { CameraRig } from "./CameraRig";
import {
  HQ_TILE,
  IsoWorld,
  LANDMARK_RING_SPAN_PX,
  landmarkTile,
  worldPointOfTile,
} from "./IsoWorld";
import { AggregateBlocks } from "./AggregateBlocks";
import { DistrictLinks, type LinkAnchor } from "./DistrictLinks";
import { PathLayer } from "./PathLayer";
import { RootSequenceLayer, ROOT_PHASE_COLORS } from "./RootSequenceLayer";
import { FxLayer } from "./FxLayer";
import { BuildingSprite } from "./BuildingSprite";
import { SatelliteLayer } from "./SatelliteLayer";
import { UniverseLayer } from "./UniverseLayer";
import { onAvatarTextureReady, resetAvatarTextures } from "./avatars";
import { onPixelArtReady, pixelArtActive } from "./pixel-art";
import { mulberry32 } from "./art";

/** City payload the scene consumes (public route + owner.profession). */
export type CitySceneProjection = CityProjection & {
  owner: CityProjection["owner"] & { profession: string | null };
};

/**
 * Locale-aware strings the shell injects (cardDisplayName + i18n keys live in
 * React land; the imperative scene only ever receives resolved strings).
 */
export interface CitySceneStrings {
  /** HQ "CORE" tag (i18n cityHqCoreTag). */
  coreTag: string;
  /** Lost-signal chip over a vacated tile (i18n cityFxLostSignal). */
  lostSignalLabel: string;
  /** Tier-up flash chip, pre-localized ("T{tier} · {value}"). */
  tierUpLabel: (tier: number, value: number) => string;
  /** Display name resolver (cardDisplayName, zh/en). */
  displayName: (username: string) => string;
  /** Satellite "+N more" plate text, pre-localized. */
  satelliteMoreLabel: (count: number) => string;
  /** Sector identity resolver — Boot → cityBootSector, others →
   *  missionLabel/finalGoddessLabel (locale resolved in React land). */
  sectorLabel: (info: CitySectorInfo) => string;
}

const DEFAULT_STRINGS: CitySceneStrings = {
  coreTag: "CORE",
  lostSignalLabel: "SIGNAL LOST",
  tierUpLabel: (tier) => `T${tier}`,
  displayName: (username) => username,
  satelliteMoreLabel: (count) => `+${count}`,
  sectorLabel: (info) => (info.index === 0 ? "BOOT" : ""),
};

export interface CitySceneCallbacks {
  onSelectCard: (cardId: number | null) => void;
  onContextLost: () => void;
}

export interface CitySceneInit {
  host: HTMLElement;
  sectorCount: number;
  reducedMotion: boolean;
  callbacks: CitySceneCallbacks;
}

const MAX_DPR = 2;

/** Bloom kill switch: NEXT_PUBLIC_CITY_BLOOM=off disables the filter pass. */
const CITY_BLOOM_ENV = process.env.NEXT_PUBLIC_CITY_BLOOM !== "off";

/** Dev perf overlay (engine-audit §3.3) — stripped from production builds. */
const PERF_OVERLAY = process.env.NODE_ENV !== "production";
/** Perf snapshot cadence (ms) — store writes stay rare. */
const PERF_PUSH_MS = 500;

/**
 * Night sky gradient (study §A5): vertical #05060A → #0A0E1A with a faint
 * horizon band — generated to a texture once per size, static behind the
 * camera (infinite-distance backdrop). A sparse seeded STARFIELD is baked
 * into the same texture (study §Track D): zero runtime cost, and it sits
 * behind fxRoot so stars never bloom — the backdrop stays calm while the
 * city glows. (2026-09-28: the distant-skyline city strip was REMOVED by
 * user ruling — the background is sky + stars only.)
 */
function buildSkyTexture(app: Application, w: number, h: number): Texture {
  // Normalized local gradient (0,0)→(0,1) over the full-screen rect.
  const grad = new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: "#05060a" },
      { offset: 0.55, color: "#0a0e1a" },
      { offset: 0.82, color: "#111830" },
      { offset: 1, color: "#0a0e1a" },
    ],
    textureSpace: "local",
  });
  const g = new Graphics();
  g.rect(0, 0, w, h).fill(grad);
  // Starfield: deterministic (fixed seed — the sky is the same city-wide),
  // upper 55% only (below that the horizon band + city dominate).
  const rng = mulberry32(0x517b1e);
  const stars = Math.round((w * h) / 12000); // ~86 @1440x900 — sparse
  for (let i = 0; i < stars; i++) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(rng() * h * 0.55);
    const r = rng();
    const size = r < 0.85 ? 1 : 2;
    const alpha = 0.12 + rng() * 0.5;
    const color = r < 0.12 ? 0xbfd7ff : r < 0.2 ? 0xffd9a8 : 0xf2f7ff;
    g.circle(x, y, size).fill({ color, alpha });
  }
  const tex = app.renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/**
 * DAY sky gradient (day/night cycle, 2026-09-28): deep blue zenith → pale
 * horizon with a soft baked sun glow high-right. Crossfades over the night
 * texture (skyDay.alpha = daylight factor) so dawn/dusk are continuous. No
 * stars — they fade in with the night layer underneath as daylight drops.
 */
function buildDaySkyTexture(app: Application, w: number, h: number): Texture {
  const grad = new FillGradient({
    type: "linear",
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: "#3e6fb4" },
      { offset: 0.45, color: "#6f9ed8" },
      { offset: 0.78, color: "#b7d3ec" },
      { offset: 1, color: "#8fb2d4" },
    ],
    textureSpace: "local",
  });
  const g = new Graphics();
  g.rect(0, 0, w, h).fill(grad);
  // Sun: layered glow discs (deterministic position, zero runtime cost).
  const sx = Math.round(w * 0.72);
  const sy = Math.round(h * 0.18);
  const spread = Math.max(w, h);
  g.circle(sx, sy, spread * 0.16).fill({ color: 0xfff3d6, alpha: 0.16 });
  g.circle(sx, sy, spread * 0.085).fill({ color: 0xfff8e6, alpha: 0.28 });
  g.circle(sx, sy, 26).fill({ color: 0xffffff, alpha: 0.85 });
  const tex = app.renderer.generateTexture(g);
  g.destroy();
  return tex;
}

/** Initial/reset zoom: district LOD — the core + landmark ring read clearly
 *  while the wider sector grid stays in frame. */
const HOME_ZOOM = 0.75;

/** Re-rank glide duration (value change → drift to the new ring). */
const MOVE_GLIDE_MS = 460;
/** Max simultaneous glides — past this (mass re-rank) the rest snap. */
const MOVE_GLIDE_CAP = 96;

/**
 * Day/night cycle (daylight.ts — 1 real hour = 1 game day, 30 real minutes
 * day / 30 night). The scene SLEEPS through the steady day/night plateaus
 * (a wake timer armed at the next ramp boundary — zero idle rAF cost) and
 * then tracks daylightAt CONTINUOUSLY through each 2.5-minute ramp, so the
 * sky/wash drift smoothly the whole transition instead of stepping — the
 * player feels the time passing (2026-09-28 user ruling).
 */
const DAYLIGHT_STEP_MS = 250;
/** Screen-blend daylight wash over the whole stage (atmosphere unifier —
 *  since the v2 normal-city redo every element owns AUTHORED day/night art,
 *  so this is subtle). Soft warm-white, never bloom-fed (above fxRoot). */
const DAY_WASH_COLOR = 0xf2ead4;
const DAY_WASH_MAX_ALPHA = 0.14;

export class CityScene {
  private readonly app: Application;
  private readonly host: HTMLElement;
  private readonly worldContainer = new Container();
  /** Screen-sized filtered wrapper (bloom) around the whole world. */
  private readonly fxRoot = new Container();
  /** Static night-sky backdrop (behind fxRoot, never filtered). */
  private sky!: Sprite;
  /** Day-sky crossfade layer (alpha = daylight; sits directly over `sky`). */
  private skyDay!: Sprite;
  /** Screen-blend daylight wash above fxRoot (brightens floor + buildings). */
  private dayWash!: Graphics;
  /** Day/night state: displayed factor 0..1 + continuous ramp tracking. */
  private daylight = 0;
  private daylightTracking = false;
  private daylightAppliedAt = 0;
  /** One-shot wake timer for the next ramp boundary (render-on-demand). */
  private daylightTimer: ReturnType<typeof setTimeout> | null = null;
  /** Threshold bloom (study §Track B) — dark palette makes it selective. */
  private readonly bloom = new AdvancedBloomFilter({
    threshold: 0.55,
    bloomScale: 0.85,
    brightness: 1.0,
    blur: 8,
    quality: 4,
  });
  /** Runtime bloom state: env + WebGL2 support + frame-probe verdict. */
  private bloomSupported = true;
  private bloomKilledByProbe = false;
  /** Frame-budget probe (bloom fallback, study §B3). */
  private frameEma = 0;
  private frameSamples = 0;
  private lastRenderAt = 0;
  /**
   * Aggregate-skyline daylight lift (v2 normal-city redo, 2026-09-28): the
   * global day ColorMatrix is GONE — buildings, terrain and platforms now
   * carry AUTHORED day/night art frames — but the beyond-limit aggregate
   * slabs are still procedural night masses, so they get the same soft
   * per-layer lerp the HQ/monuments use (identity at night; see
   * IsoWorld.setDaylight for the hero layers).
   */
  private readonly aggregateDay = new ColorMatrixFilter();
  /** Bloom is currently in the fxRoot filter stack (probe + LOD gated). */
  private bloomAttached = false;
  private readonly world: IsoWorld;
  private readonly aggregate: AggregateBlocks;
  private readonly satellites = new SatelliteLayer(() => this.requestRender());
  /** The shared universe map (markers + lazy mini cities, 2026-09-28). */
  private readonly universe = new UniverseLayer();
  private readonly paths = new PathLayer();
  private readonly links: DistrictLinks;
  private readonly rootLayer: RootSequenceLayer;
  private readonly fx: FxLayer;
  private rig!: CameraRig;
  private ro!: ResizeObserver;
  private readonly callbacks: CitySceneCallbacks;

  private policy: MotionPolicy;
  private strings: CitySceneStrings = DEFAULT_STRINGS;
  private lod: Lod = "district";
  private prevDetailed: readonly CityBuilding[] | null = null;
  /** Sector count seen at the last sync (unlock-FX edge detector). */
  private prevSectorCount: number | null = null;
  /** Landmark owned-flags seen at the last sync (acquisition-FX edge). */
  private prevLandmarkOwned: readonly boolean[] | null = null;
  /** Last Root Sequence state pushed by the shell (change-detected by key). */
  private lastRootState: RootSequenceVisualState = { active: false };
  private lastRootKey = rootSequenceKey(this.lastRootState);
  private lastProjection: CitySceneProjection | null = null;
  private lastTiles: readonly TileRef[] = [];
  private readonly cardTiles = new Map<number, TileRef>();
  private readonly buildingsById = new Map<number, CityBuilding>();
  private selectedCardId: number | null = null;
  /** Ring the aggregate slabs resume the orbit at (outermost building ring). */
  private aggregateStartRing = 7;
  /** In-flight re-rank glides (value orbits), drained by updateMoves. */
  private readonly moving: Array<{
    sprite: BuildingSprite;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    start: number;
  }> = [];
  /** LOD-swap detail fade (windows/identity), one tween for ALL sprites. */
  private detailFadeActive = false;
  private detailFadeStart = 0;
  private detailAlpha = 1;

  private dirty = true;
  private raf = 0;
  private destroyed = false;
  /** Unsubscribe for avatar-texture arrivals (billboards need a re-render). */
  private avatarReadyTeardown: (() => void) | null = null;
  /**
   * PIXEL-ART MODE (engine upgrade 2026-09-28): true once generated building
   * sheets are mounted — switches the day matrix to the soft pixel lift and
   * keeps frames/ daylight crossfades authoritative for buildings.
   */
  private pixelMode = false;
  private pixelArtTeardown: (() => void) | null = null;

  private constructor(
    app: Application,
    init: CitySceneInit,
    world: IsoWorld,
    aggregate: AggregateBlocks,
    links: DistrictLinks,
    rootLayer: RootSequenceLayer,
    fx: FxLayer
  ) {
    this.app = app;
    this.host = init.host;
    this.callbacks = init.callbacks;
    this.policy = resolveMotion(init.reducedMotion);
    this.satellites.setPulseEnabled(!this.policy.reduced);
    this.universe.setReducedMotion(this.policy.reduced);
    this.world = world;
    this.aggregate = aggregate;
    this.links = links;
    this.rootLayer = rootLayer;
    this.fx = fx;
  }

  static async create(init: CitySceneInit): Promise<CityScene> {
    const app = new Application();
    await app.init({
      preference: "webgl",
      antialias: true,
      background: 0x05060a,
      resolution: Math.min(MAX_DPR, window.devicePixelRatio || 1),
      autoDensity: true,
      width: Math.max(1, init.host.clientWidth),
      height: Math.max(1, init.host.clientHeight),
    });
    init.host.appendChild(app.canvas);
    app.canvas.setAttribute("aria-hidden", "true");
    app.canvas.style.touchAction = "none";

    // Render-on-demand: kill pixi's internal ticker; CityScene owns a
    // self-suspending rAF that only renders while dirty/animating.
    app.ticker.stop();

    const policy = resolveMotion(init.reducedMotion);
    const scene = new CityScene(
      app,
      init,
      new IsoWorld(init.sectorCount),
      new AggregateBlocks(),
      new DistrictLinks(policy),
      new RootSequenceLayer(policy),
      new FxLayer(policy)
    );

    // Night relight stack (study §A5/§B1): static sky behind everything, the
    // whole world inside ONE screen-sized filtered container — with the dark
    // night palette, a threshold bloom on that pass is effectively selective
    // (only emissives clear the threshold) without per-building layers. The
    // DAY layer (day/night cycle) crossfades over the night sky, and the
    // daylight wash sits ABOVE fxRoot so it never feeds the bloom filter.
    scene.sky = new Sprite(buildSkyTexture(app, app.renderer.width, app.renderer.height));
    scene.skyDay = new Sprite(
      buildDaySkyTexture(app, app.renderer.width, app.renderer.height)
    );
    scene.skyDay.alpha = 0;
    scene.dayWash = new Graphics()
      .rect(0, 0, app.renderer.width, app.renderer.height)
      .fill({ color: DAY_WASH_COLOR, alpha: DAY_WASH_MAX_ALPHA });
    scene.dayWash.blendMode = "screen";
    scene.dayWash.alpha = 0;
    scene.fxRoot.addChild(scene.worldContainer);
    scene.fxRoot.filterArea = new Rectangle(0, 0, app.renderer.width, app.renderer.height);
    app.stage.addChild(scene.sky, scene.skyDay, scene.fxRoot, scene.dayWash);
    scene.bloomSupported = CITY_BLOOM_ENV && scene.detectWebGL2();
    scene.syncBloom();

    // Day/night cycle: apply the CURRENT daylight immediately (opening at
    // :15–:45 real = daytime right away), then arm the one-shot wake timer
    // for the next ramp boundary (see updateDaylight).
    scene.daylight = daylightAt(Date.now());
    scene.applyDaylight();
    scene.scheduleDaylightWake();

    // Root beams ride ABOVE the skyline (under FX chips); the veil mounts
    // beneath paths/buildings as a ground-level wash. The shared UNIVERSE
    // sits just under the satellites (its cities live far outside the macro
    // grid too); satellite clusters draw over it near the home city.
    scene.worldContainer.addChild(
      scene.world,
      scene.aggregate,
      scene.universe,
      scene.satellites,
      scene.rootLayer.beams,
      scene.fx
    );
    // Aggregate skyline daylight lerp (identity at night — applyDaylight).
    scene.aggregate.filters = [scene.aggregateDay];
    // Ground-level overlays (root veil → paths + district links) sit
    // beneath buildings, veil first so tinted paths stay legible over it.
    scene.world.beneathBuildings.addChild(
      scene.rootLayer.ground,
      scene.paths,
      scene.links
    );
    scene.updateVeilBounds();

    const viewport = () => scene.viewportSize();

    const rig = new CameraRig(
      {
        element: init.host,
        getViewport: viewport,
        getHomeCamera: () => scene.homeCamera(),
        applyCamera: (cam) => scene.applyCamera(cam),
        requestRender: () => scene.requestRender(),
        onSettled: (cam) => scene.onCameraSettled(cam),
        onTap: (wx, wy) => scene.onTap(wx, wy),
        isReduced: () => scene.policy.reduced,
      },
      // INITIAL FRAMING = the static home view (HQ anchor). No glide, no
      // sync dependency — a content fit is wrong here: multi-sector cities
      // spread over the whole macro grid, so fitting "all content" clamps
      // to the zoom floor and centers on the empty gap between sector
      // clusters.
      scene.homeCamera()
    );
    scene.rig = rig; // private access from the static factory (same class)

    const ro = new ResizeObserver(() => scene.onResize());
    ro.observe(init.host);
    scene.ro = ro;

    app.canvas.addEventListener("webglcontextlost", scene.onContextLost);
    // Billboard textures arrive async — each arrival requests one render so
    // plates pop in without a camera nudge (sprites mount themselves).
    scene.avatarReadyTeardown = onAvatarTextureReady(() => scene.requestRender());
    // Pixel-art sheets arrive async too: the first ready sheet flips pixel
    // mode (soft day matrix — applyDaylight re-runs so the lift retargets
    // live), every arrival re-checks all sprites and mounts frames in place.
    scene.pixelArtTeardown = onPixelArtReady(() => {
      const active = pixelArtActive();
      const modeChanged = active !== scene.pixelMode;
      scene.pixelMode = active;
      scene.world.refreshPixelArt();
      if (modeChanged) scene.applyDaylight();
      scene.updateCulling();
      scene.requestRender();
    });

    scene.applyCamera(rig.state);
    scene.requestRender();
    return scene;
  }

  // ── public API (driven by CitySceneMount) ─────────────────────────────

  /** Locale-aware labels (HQ tag, FX chips, display names, sector chips). */
  setStrings(strings: Partial<CitySceneStrings>): void {
    this.strings = { ...this.strings, ...strings };
    // Refresh everything that baked a string in.
    if (this.lastProjection) {
      this.world.syncHq(
        this.lastProjection.owner.profession,
        this.strings.coreTag,
        this.strings.displayName(this.lastProjection.owner.username)
      );
      this.world.syncSectorInfo(
        this.lastProjection.sectorInfo,
        this.strings.sectorLabel
      );
      this.world.syncLandmarks(
        this.lastProjection.landmarks,
        this.strings.displayName
      );
      this.satellites.setLabels(
        this.strings.displayName,
        this.strings.satelliteMoreLabel
      );
    }
    this.universe.setLabels(this.strings.displayName);
    this.updateNameChips();
    this.requestRender();
  }

  sync(projection: CitySceneProjection): void {
    if (this.destroyed) return;
    this.lastProjection = projection;

    const sectorCount = Math.max(
      1,
      Math.min(SECTOR_KEYS.length, projection.owner.sectorsUnlocked)
    );
    const sectorCountChanged = this.world.sectorCount !== sectorCount;
    this.world.setSectorCount(sectorCount);
    if (sectorCountChanged) this.updateVeilBounds();

    // Sector descriptors (locked pads + identity chips) — server-authoritative
    // unlock state; the label text was resolved by the React shell.
    this.world.syncSectorInfo(projection.sectorInfo, this.strings.sectorLabel);

    // Sector-unlock FX: sectorCount GREW since the last sync (a mission
    // completed server-side — nothing here is optimistic). Skipped entirely
    // under reduced motion (FxLayer policy) and on the first sync.
    if (this.prevSectorCount !== null && sectorCount > this.prevSectorCount) {
      for (let s = this.prevSectorCount; s < sectorCount; s++) {
        const p = worldPointOfTile({
          sector: `s${s}`,
          x: GRID_SIZE >> 1,
          y: GRID_SIZE >> 1,
        });
        this.fx.playSectorUnlock(p.x, p.y);
      }
    }
    this.prevSectorCount = sectorCount;

    // Detailed (visible) buildings. The placement queue is retired: with
    // derived value-orbit placement every owned card always has a tile, and
    // hidden-card queue extras no longer render anywhere (the public
    // projection stays the single source of visible buildings).
    const byId = new Map<number, CityBuilding>();
    for (const family of projection.families) {
      for (const b of family.buildings) byId.set(b.cardId, b);
    }
    const all = [...byId.values()];

    // Pre-sync sprite positions: a building whose RING changed (its value
    // crossed another's) glides from its old tile to the new one instead
    // of teleporting — the "gains value → moves toward the core" read.
    const prevPositions = new Map<number, { x: number; y: number }>();
    for (const cardId of this.cardTiles.keys()) {
      const s = this.world.spriteFor(cardId);
      if (s) prevPositions.set(cardId, { x: s.x, y: s.y });
    }

    // VALUE-ORBIT arrangement (placement.ts/rings.ts): priciest innermost,
    // clockwise rings outward; HQ + landmark reservations and the monument
    // moat stay clear so the core plaza reads.
    const { entries, resumeRing } = rankArrangeTiles(
      all,
      sectorCount,
      (key) => this.world.reserved.has(key) || this.world.landmarkMoat.has(key)
    );
    this.aggregateStartRing = resumeRing;

    const diff = diffBuildings(this.prevDetailed, all);
    const tileOf = new Map(entries.map((e) => [e.building.cardId, e.tile]));
    const { removed } = this.world.syncBuildings(entries);
    this.beginMoves(entries, prevPositions);

    if (!diff.seeded) {
      for (const b of diff.entered) {
        const tile = tileOf.get(b.cardId);
        if (!tile) continue;
        const p = worldPointOfTile(tile);
        this.fx.playConstruct(p.x, p.y);
      }
      for (const gone of removed) {
        const p = worldPointOfTile(gone.tile);
        this.fx.playLoss(p.x, p.y);
        this.fx.playLostSignal(p.x, p.y, this.strings.lostSignalLabel, () =>
          this.requestRender()
        );
      }
      for (const up of diff.tierUp) {
        const sprite = this.world.spriteFor(up.cardId);
        if (!sprite) continue;
        this.fx.playTierUp(sprite.x, sprite.y, sprite.topY, {
          profession: up.building.profession,
          fromTier: up.fromTier,
          toTier: up.toTier,
          label: this.strings.tierUpLabel(up.toTier, up.building.value),
        });
      }
    }

    // Data paths (visual only): every rendered building → HQ, beneath all.
    this.lastTiles = entries.map((e) => e.tile);
    this.paths.sync(this.lastTiles, HQ_TILE, this.lod);

    // District data links: one representative per owned profession, complete
    // glow when all six are present (pure derivation — districtsFromFamilies
    // mirrors the combo state; combo logic itself is NOT implemented here).
    const reps = districtRepresentatives(projection.families);
    const anchors: LinkAnchor[] = [];
    for (const rep of reps) {
      const tile = tileOf.get(rep.cardId);
      if (!tile) continue;
      const p = worldPointOfTile(tile);
      anchors.push({ profession: rep.profession, x: p.x, y: p.y });
    }
    this.links.sync(anchors, districtsFromFamilies(projection.families).complete);

    this.aggregate.sync(
      projection.families,
      sectorCount,
      this.aggregateStartRing,
      // Aggregate slabs continue the SAME orbit beyond the outermost
      // building ring (cheap sprawl at the rim) and keep the monument moat
      // clear (same legibility rule as the building rings).
      (key) =>
        !this.world.isTileOccupied(key) && !this.world.landmarkMoat.has(key),
      this.lod
    );

    // Satellite cities (owned cards that own cards): sync the foreign
    // clusters + their home↔satellite data-links + the core→core pulse
    // target, then play construct/loss FX at their world positions (the
    // seeded first sync stays silent, reduced-motion safe via the FX policy
    // — same rules as the home orbit). The anchor ring is sized from the
    // UNLOCKED sector extent (dynamic distance).
    const hqPoint = worldPointOfTile(HQ_TILE);
    const satFx = this.satellites.sync(
      projection.neighbors ?? [],
      (cardId) => tileOf.get(cardId),
      this.lod,
      this.world.sectorCount,
      hqPoint
    );
    if (!satFx.seeded) {
      for (const p of satFx.added) this.fx.playConstruct(p.x, p.y);
      for (const p of satFx.removed) {
        this.fx.playLoss(p.x, p.y);
      }
    }
    const landmarkOwned = this.world.syncLandmarks(
      projection.landmarks,
      this.strings.displayName
    );
    // Goddess acquisition (Phase E): an owned flag flipping false→true
    // between syncs = a server-confirmed purchase/mission reward — ignite
    // the monument (never on the first/seed sync, reduced-motion safe via
    // the FX policy). Loss flips clear silently; the monument redraws dim.
    if (this.prevLandmarkOwned) {
      landmarkOwned.forEach((owned, i) => {
        if (owned && !this.prevLandmarkOwned?.[i]) {
          const p = worldPointOfTile(landmarkTile(i));
          this.fx.playLandmark(p.x, p.y);
        }
      });
    }
    this.prevLandmarkOwned = landmarkOwned;
    // A goddess lost/gained mid-sequence re-anchors the beams on the next
    // confirmed projection (all six ring positions — see applyRoot, M2).
    if (this.lastRootState.active) this.applyRoot(false);
    this.world.syncHq(
      projection.owner.profession,
      this.strings.coreTag,
      this.strings.displayName(projection.owner.username)
    );
    this.world.setLod(this.lod);
    // Sprites created by THIS sync must match an in-flight detail fade.
    if (this.lod === "close" && this.detailAlpha < 1) {
      this.world.setDetailAlpha(this.detailAlpha);
    }
    // ...and the current daylight (new sprites default to night=0; a daytime
    // sync would otherwise light their windows out of step).
    this.world.setDaylight(this.daylight);

    this.cardTiles.clear();
    this.buildingsById.clear();
    for (const e of entries) {
      this.cardTiles.set(e.building.cardId, e.tile);
      this.buildingsById.set(e.building.cardId, e.building);
    }
    this.prevDetailed = all;

    this.updateNameChips();
    this.updateCulling();
    this.requestRender();
  }

  setSelected(cardId: number | null): void {
    if (this.selectedCardId === cardId) return;
    if (this.selectedCardId !== null) {
      this.world.spriteFor(this.selectedCardId)?.setSelected(false);
    }
    this.selectedCardId = cardId;
    if (cardId !== null) {
      this.world.spriteFor(cardId)?.setSelected(true);
    }
    this.updateNameChips();
    this.requestRender();
  }

  /** Foreign (satellite) selection visuals — mirrors setSelected. */
  setSelectedForeign(sel: { owner: number; cardId: number } | null): void {
    this.satellites.setSelected(sel);
    this.requestRender();
  }

  /** Universe-city selection visuals (marker ring + HUD chip source). */
  setSelectedUniverseCity(username: string | null): void {
    this.universe.setSelected(username);
    this.requestRender();
  }

  /**
   * City-detail fetcher for lazy universe minis (public /api/city/[u]);
   * injected by the React shell so the scene itself never fetches.
   */
  setCityDetailFetcher(
    fetcher: (username: string) => Promise<CitySceneProjection | null>
  ): void {
    this.universe.setCityDetailFetcher(fetcher);
  }

  /**
   * Shared universe map sync (2026-09-28): cities placed on rank orbits
   * around the viewer's city. Stake usernames (the satellite owners) tint
   * violet; the viewer's own city is the home render and gets no marker.
   */
  syncUniverse(payload: UniversePayload | null, viewerUsername: string): void {
    if (this.destroyed) return;
    const stake = (this.lastProjection?.neighbors ?? []).map((n) => n.username);
    this.universe.sync(payload, viewerUsername, stake);
    const summary = this.universe.summary();
    cityWorldStore.getState().setUniverseSummary(
      summary
        ? {
            count: summary.count,
            myRank: summary.viewerRank <= summary.count ? summary.viewerRank : null,
          }
        : null
    );
    this.updateCulling();
    this.requestRender();
  }

  setReducedMotion(reduced: boolean): void {
    this.policy = resolveMotion(reduced);
    this.fx.setPolicy(this.policy);
    this.links.setPolicy(this.policy);
    this.rootLayer.setPolicy(this.policy);
    this.satellites.setPulseEnabled(!this.policy.reduced);
    this.universe.setReducedMotion(this.policy.reduced);
    if (this.policy.reduced) {
      // In-flight LOD fades and re-rank glides snap to their terminal state.
      for (const m of this.moving) m.sprite.position.set(m.toX, m.toY);
      this.moving.length = 0;
      this.detailFadeActive = false;
      this.detailAlpha = 1;
      this.world.setDetailAlpha(1);
      this.aggregate.cancelFade();
    }
    this.requestRender();
  }

  setLodForZoom(zoom: number): void {
    const lod = lodFor(zoom);
    if (lod === this.lod) return;
    const wasClose = this.lod === "close";
    this.lod = lod;
    this.world.setLod(lod);
    this.satellites.setLod(lod);
    this.universe.setLod(lod);
    this.paths.sync(this.lastTiles, HQ_TILE, lod);
    this.links.setLod(lod);
    this.syncBloom(); // world-LOD massing views skip the filter pass
    // Root beams/veil carry LOD-dependent alpha — redraw from the last state.
    this.applyRoot(false);
    if (this.lastProjection) {
      // Aggregate skyline budget changes with the LOD band — crossfade the
      // swap instead of snapping (instant under reduced motion).
      this.aggregate.sync(
        this.lastProjection.families,
        this.world.sectorCount,
        this.aggregateStartRing,
        (key) =>
          !this.world.isTileOccupied(key) && !this.world.landmarkMoat.has(key),
        lod,
        this.policy.lodFadeMs
      );
    }
    if (lod === "close" && !wasClose) {
      this.beginDetailFade(); // windows/identity fade in instead of snapping
    } else if (lod !== "close") {
      // Leaving close LOD hides the detail layers outright (they are a few
      // pixels tall at that zoom — fading 200 sprites out is not worth it).
      this.detailFadeActive = false;
      this.detailAlpha = 1;
    }
    this.requestRender();
  }

  /** A11y mirror focus → glide (or snap) the camera onto the building.
   *  Aims at BODY mid-height (the tower rises well above its tile), so the
   *  whole sprite + its name chip land in frame instead of the top edge. */
  focusCard(cardId: number): void {
    const tile = this.cardTiles.get(cardId);
    if (!tile) return;
    const p = worldPointOfTile(tile);
    this.rig.focusWorldPoint(p.x, p.y - 48);
  }

  /** Side-panel focus → glide (or snap) the camera onto a satellite city. */
  focusSatellite(slot: number): void {
    const p = this.satellites.anchorPointOf(slot);
    if (!p) return;
    this.rig.animateTo(
      clampCamera({ x: p.x, y: p.y - 30, zoom: Math.max(this.rig.state.zoom, 0.7) })
    );
  }

  zoomBy(delta: number): void {
    this.rig.zoomBy(delta);
  }

  resetCamera(): void {
    this.rig.reset();
  }

  // ── Root Sequence + landmarks (Phase E) ────────────────────────────────

  /**
   * Root Sequence state, derived by the shell from the AUTHORITATIVE
   * countdown (root-sequence.ts) and pushed here only when its change key
   * advances. Rising edge (idle→active) ignites the owned monuments; the
   * falling edge clears beams/veil/tint immediately — the client never
   * lingers a cancelled or reassigned sequence.
   */
  setRootSequence(state: RootSequenceVisualState): void {
    if (this.destroyed) return;
    const key = rootSequenceKey(state);
    if (key === this.lastRootKey) return;
    const rising = state.active && !this.lastRootState.active;
    this.lastRootState = state;
    this.lastRootKey = key;
    this.applyRoot(rising);
    this.requestRender();
  }

  /** Selection ring on a landmark (mirror list / panel focus). */
  setSelectedLandmark(index: number | null): void {
    this.world.setLandmarkSelected(index);
    this.requestRender();
  }

  /** Glide (or snap) the camera onto a goddess monument. */
  focusLandmark(index: number): void {
    const p = worldPointOfTile(landmarkTile(index));
    const hq = worldPointOfTile(HQ_TILE);
    // Two-thirds toward the monument, HQ kept in frame: centering a
    // perimeter monument alone parks the city in a corner of the canvas
    // (image-analyst Phase E: shot 03, ~60% empty).
    const tx = (p.x * 2 + hq.x) / 3;
    const ty = (p.y * 2 + hq.y) / 3 - 40;
    this.rig.animateTo(
      clampCamera({ x: tx, y: ty, zoom: Math.max(this.rig.state.zoom, 0.8) })
    );
  }

  /** Redraw the root visuals from the last pushed state. */
  private applyRoot(rising: boolean): void {
    const state = this.lastRootState;
    const hqPoint = worldPointOfTile(HQ_TILE);
    // M2 ruling (game-systems): while the sequence is active the COUNTDOWN is
    // the authority — beams originate from ALL six fixed ring positions, not
    // the owned flags (which can go stale when a goddess is lost without a
    // countdown cancel; the monuments themselves stay owned/dormant).
    const anchors = this.world
      .landmarkBeamPoints()
      .map((a) => ({ x: a.x, y: a.y }));
    this.rootLayer.sync(state, anchors, { x: hqPoint.x, y: hqPoint.y - 108 }, this.lod);
    // Data-path tint: the grid's "data paths transform" as the sequence runs.
    if (state.active) {
      const color = ROOT_PHASE_COLORS[state.phase] ?? null;
      this.paths.setRootMix(color ?? null, 0.35 + 0.6 * state.progress);
    } else {
      this.paths.setRootMix(null, 0);
    }
    if (rising && !this.policy.reduced) {
      // Ignition celebrates the OWNED monuments (acquisition moment).
      for (const a of this.world.landmarkBeamPoints()) {
        if (a.owned) this.fx.playLandmark(a.x, a.y);
      }
      this.fx.playLandmark(hqPoint.x, hqPoint.y - 108);
    }
  }

  /** Veil extents follow the (possibly grown) macro grid. */
  private updateVeilBounds(): void {
    const b = sectorWorldBounds(this.world.sectorCount, GRID_SIZE);
    this.rootLayer.setVeilBounds(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      (b.maxX - b.minX) / 2,
      (b.maxY - b.minY) / 2
    );
  }

  // ── re-rank glide (value-orbit placement) ─────────────────────────────

  /**
   * Buildings whose derived tile CHANGED between syncs (a value crossed
   * another's — overclocks, poaches, boss tax) drift from their previous
   * position to the new one instead of teleporting. Skipped under reduced
   * motion; capped so a mass re-rank snaps the tail instead of tweening a
   * hundred sprites at once. Called AFTER syncBuildings placed the sprites
   * at their new tiles; each glide re-seeds the sprite at its old position.
   */
  private beginMoves(
    entries: ReadonlyArray<{ building: CityBuilding }>,
    prevPositions: ReadonlyMap<number, { x: number; y: number }>
  ): void {
    this.moving.length = 0;
    if (this.policy.reduced) return;
    for (const entry of entries) {
      const from = prevPositions.get(entry.building.cardId);
      if (!from) continue;
      const sprite = this.world.spriteFor(entry.building.cardId);
      if (!sprite) continue;
      if (sprite.x === from.x && sprite.y === from.y) continue;
      if (this.moving.length >= MOVE_GLIDE_CAP) break;
      this.moving.push({
        sprite,
        fromX: from.x,
        fromY: from.y,
        toX: sprite.x,
        toY: sprite.y,
        start: performance.now(),
      });
      sprite.position.set(from.x, from.y);
    }
  }

  /** Advance the glides. True while any is in flight (keeps the ticker on). */
  private updateMoves(now: number): boolean {
    for (const m of this.moving) {
      const p = clamp01((now - m.start) / MOVE_GLIDE_MS);
      // smoothstep — deliberate ease-in/out for a readable drift.
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      m.sprite.position.set(
        m.fromX + (m.toX - m.fromX) * e,
        m.fromY + (m.toY - m.fromY) * e
      );
    }
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const m = this.moving[i];
      if (now - m.start >= MOVE_GLIDE_MS) {
        m.sprite.position.set(m.toX, m.toY);
        this.moving.splice(i, 1);
      }
    }
    return this.moving.length > 0;
  }

  // ── internals ─────────────────────────────────────────────────────────

  /**
   * WebGL2 capability (bloom fallback, study §B3). The raw GL context is
   * reached defensively — if it cannot be found, assume a modern device
   * rather than silently degrading everyone.
   */
  private detectWebGL2(): boolean {
    if (typeof WebGL2RenderingContext === "undefined") return false;
    const renderer = this.app.renderer as unknown as {
      gl?: unknown;
      ctx?: { gl?: unknown };
    };
    const gl = renderer.gl ?? renderer.ctx?.gl;
    return !gl || gl instanceof WebGL2RenderingContext;
  }

  /**
   * Attach/detach the fxRoot filter stack: threshold bloom only (env +
   * capability + LOD + probe gates). Day/night is carried by authored art
   * frames + scoped hero filters, not a global matrix.
   */
  private syncBloom(): void {
    const filters: Array<AdvancedBloomFilter> = [];
    this.bloomAttached =
      this.bloomSupported &&
      !this.bloomKilledByProbe &&
      this.lod !== "world";
    if (this.bloomAttached) filters.push(this.bloom);
    this.fxRoot.filters = filters;
  }

  /**
   * Frame-budget probe (study §B3): during CONTINUOUS render streaks (camera
   * moves, FX, fades), an EMA of the rAF interval above ~21ms means the
   * scene cannot hold ~45fps with the filter attached — drop bloom for the
   * session. Gaps >120ms (idle render-on-demand) reset the streak so sparse
   * renders never sample scheduling jitter.
   */
  private updateFrameProbe(now: number): void {
    if (!this.bloomSupported || this.bloomKilledByProbe) return;
    if (this.lastRenderAt > 0 && now - this.lastRenderAt < 120) {
      const dt = now - this.lastRenderAt;
      this.frameEma = this.frameEma > 0 ? this.frameEma * 0.9 + dt * 0.1 : dt;
      this.frameSamples += 1;
      if (this.frameSamples > 120 && this.frameEma > 21 && this.bloomAttached) {
        this.bloomKilledByProbe = true;
        this.syncBloom();
        console.info("[city] bloom disabled by frame-budget probe");
      }
    } else {
      this.frameEma = 0;
      this.frameSamples = 0;
    }
    this.lastRenderAt = now;
  }

  private viewportSize() {
    return {
      width: Math.max(1, this.host.clientWidth),
      height: Math.max(1, this.host.clientHeight),
    };
  }

  /**
   * Home framing (initial view + Reset): anchored on the HQ core — the
   * heart of the city where the landmark ring lives. Desktop holds the
   * calm district zoom; NARROW viewports (phones) instead fit the landmark
   * ring (image-analyst Phase E: a cropped ring read as "3 landmarks")
   * down to the zoom floor — world-LOD massing for the overview, one
   * pinch crosses into district detail. Nudged up so the tall HQ body
   * reads centered.
   */
  private homeCamera(): CameraState {
    const p = worldPointOfTile(HQ_TILE);
    const ringFit = (this.viewportSize().width * 0.96) / LANDMARK_RING_SPAN_PX;
    const zoom = Math.min(HOME_ZOOM, Math.max(ZOOM_MIN, ringFit));
    return clampCamera({ x: p.x, y: p.y - 48, zoom });
  }

  /**
   * Name chips are SELECTION-ONLY (2026-09-28 user ruling): the tapped
   * building gets the strong plate + leader line and every other building
   * stays unlabeled — ambient identity reads through the rooftop avatar
   * billboards instead. Runs on sync / selection change / camera settle —
   * never per frame.
   */
  private updateNameChips(): void {
    if (this.destroyed) return;
    for (const s of this.world.allSprites) {
      if (s.building.cardId === this.selectedCardId) {
        s.showLabel(this.strings.displayName(s.building.username), {
          strong: true,
        });
      } else {
        s.hideLabel();
      }
    }
    this.requestRender();
  }

  private applyCamera(cam: { x: number; y: number; zoom: number }): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.worldContainer.scale.set(cam.zoom);
    this.worldContainer.position.set(w / 2 - cam.x * cam.zoom, h / 2 - cam.y * cam.zoom);
    this.dirty = true;
  }

  private onCameraSettled(cam: { x: number; y: number; zoom: number }): void {
    const picked = pickTile(cam.x, cam.y, GRID_SIZE);
    const store = cityWorldStore.getState();
    store.setCameraSnapshot({ x: cam.x, y: cam.y, zoom: cam.zoom }, picked?.sector ?? -1);
    this.setLodForZoom(cam.zoom);
    store.setLod(this.lod); // world-summary overlay visibility (React shell)
    // Lazy universe minis: ensure the nearest cities load near THIS framing.
    this.universe.onCameraSettle(cam.x, cam.y, cam.zoom);
    // Chips follow the camera center — refresh after the (possible) LOD swap.
    this.updateNameChips();
    // Bounded rendering: cull off-viewport sprites (camera-settle only).
    this.updateCulling();
  }

  /**
   * Forgiving tap picking (2026-09-28 "easier selection"), in priority order:
   *   1. exact building tile (classic iso pick)
   *   2. satellite cluster (the layer hit-tests bodies + proximity itself)
   *   3. goddess monument body (big art on small tiles)
   *   4. building body-rect / nearest tower within a screen-px tolerance —
   *      towers rise above their tiles, so a rooftop tap used to hit the
   *      empty tile BEHIND the building
   *   5. locked-pad peek / deselect
   */
  private onTap(worldX: number, worldY: number): void {
    const state = cityWorldStore.getState();
    const hit = this.world.pickBuilding(worldX, worldY);
    if (hit && hit.cardId !== null) {
      if (state.selectedLandmark !== null) state.selectLandmark(null);
      state.selectForeign(null);
      this.callbacks.onSelectCard(hit.cardId);
      return;
    }
    // Satellite cities live outside the macro grid, where pickTile cannot
    // address tiles — the layer hit-tests its own clusters instead.
    const sat = this.satellites.pick(worldX, worldY);
    if (sat) {
      if (this.selectedCardId !== null) this.callbacks.onSelectCard(null);
      if (state.selectedLandmark !== null) state.selectLandmark(null);
      if (sat.kind === "hq") {
        // The relay IS a home-orbit building of this city — open the
        // normal inspector (overclock / profession) for it.
        state.selectForeign(null);
        this.callbacks.onSelectCard(sat.ownerCardId);
      } else {
        state.selectForeign({ owner: sat.ownerCardId, cardId: sat.cardId });
      }
      return;
    }
    // Shared universe (2026-09-28): a marker or lazy mini city selects that
    // city (HUD chip + visit link) — clears the other selections like the
    // satellite/landmark branches do.
    const universeCity = this.universe.pick(worldX, worldY);
    if (universeCity) {
      if (this.selectedCardId !== null) this.callbacks.onSelectCard(null);
      if (state.selectedLandmark !== null) state.selectLandmark(null);
      state.selectForeign(null);
      state.selectUniverseCity(universeCity);
      return;
    }
    // Goddess monument bodies tower over their tiles — tap the art anywhere.
    const landmarkIndex = this.world.landmarkHitAt(worldX, worldY);
    if (landmarkIndex >= 0) {
      if (this.selectedCardId !== null) this.callbacks.onSelectCard(null);
      state.selectForeign(null);
      state.selectLandmark(landmarkIndex);
      return;
    }
    // Nearest tower within a ~40 screen-px tolerance (zoom-aware).
    const tol = Math.max(TILE_W * 0.75, 40 / this.rig.state.zoom);
    const near = this.world.pickBuildingProximate(worldX, worldY, tol);
    if (near) {
      if (state.selectedLandmark !== null) state.selectLandmark(null);
      state.selectForeign(null);
      this.callbacks.onSelectCard(near.cardId);
      return;
    }
    if (!hit) {
      if (this.selectedCardId !== null) this.callbacks.onSelectCard(null);
      if (state.selectedLandmark !== null) state.selectLandmark(null);
      state.selectForeign(null);
      return;
    }
    // hit.cardId === null — an empty tile inside the grid.
    const picked = pickTile(worldX, worldY, GRID_SIZE);
    if (picked) {
      // Tapping a LOCKED pad peeks its unlock requirement into the HUD.
      if (picked.sector >= this.world.sectorCount) {
        state.setLockedPeek(picked.sector);
        return;
      }
    }
    if (this.selectedCardId !== null) this.callbacks.onSelectCard(null);
    if (state.selectedLandmark !== null) state.selectLandmark(null);
    state.selectForeign(null);
  }

  private onResize(): void {
    if (this.destroyed) return;
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.app.renderer.resize(w, h);
    this.fxRoot.filterArea = new Rectangle(0, 0, w, h);
    this.sky.destroy({ texture: true });
    this.sky = new Sprite(buildSkyTexture(this.app, w, h));
    this.skyDay.destroy({ texture: true });
    this.skyDay = new Sprite(buildDaySkyTexture(this.app, w, h));
    this.skyDay.alpha = this.daylight;
    this.dayWash.destroy();
    this.dayWash = new Graphics()
      .rect(0, 0, w, h)
      .fill({ color: DAY_WASH_COLOR, alpha: DAY_WASH_MAX_ALPHA });
    this.dayWash.blendMode = "screen";
    this.dayWash.alpha = this.daylight;
    this.app.stage.addChildAt(this.sky, 0);
    this.app.stage.addChildAt(this.skyDay, 1);
    this.app.stage.addChild(this.dayWash);
    this.rig.onResize();
    this.requestRender();
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost();
  };

  /**
   * Viewport culling pass (camera-settle / sync only — never per frame, no
   * allocations): hide buildings, HQ, landmarks and aggregate slabs whose
   * tile + body extents fall outside the visible world rect (+15% margin).
   * Paths/links/ground pads stay (cheap single Graphics each).
   */
  private updateCulling(): void {
    const rect = visibleWorldRect(this.rig.state, this.viewportSize());
    this.world.applyCull(rect);
    this.aggregate.applyCull(rect);
    this.satellites.applyCull(rect);
    this.universe.applyCull(rect);
  }

  /** Start the LOD-swap detail fade-in (reduced motion: instant). */
  private beginDetailFade(): void {
    if (this.policy.lodFadeMs <= 0) {
      this.detailFadeActive = false;
      this.detailAlpha = 1;
      this.world.setDetailAlpha(1);
      return;
    }
    this.detailFadeStart = performance.now();
    this.detailAlpha = 0;
    this.detailFadeActive = true;
    this.world.setDetailAlpha(0);
  }

  /** Advance the detail fade. True while active (keeps the ticker alive). */
  private updateDetailFade(now: number): boolean {
    if (!this.detailFadeActive) return false;
    const p = clamp01((now - this.detailFadeStart) / this.policy.lodFadeMs);
    this.detailAlpha = easeOutCubic(p);
    this.world.setDetailAlpha(this.detailAlpha);
    if (p >= 1) this.detailFadeActive = false;
    return true;
  }

  /**
   * Arm the one-shot wake timer for the next ramp boundary (dawn 05:00 /
   * dusk 17:00 game). Waking sets `daylightTracking` and nudges a render;
   * the tick loop then owns the ramp. Already inside a ramp
   * (nextDaylightBoundaryAt ≤ now) → track immediately.
   */
  private scheduleDaylightWake(): void {
    if (this.destroyed) return;
    if (this.daylightTimer !== null) {
      clearTimeout(this.daylightTimer);
      this.daylightTimer = null;
    }
    const delay = nextDaylightBoundaryAt(Date.now()) - Date.now();
    if (delay <= 0) {
      this.daylightTracking = true;
      this.requestRender();
      return;
    }
    this.daylightTimer = setTimeout(() => {
      this.daylightTimer = null;
      this.daylightTracking = true;
      this.requestRender();
    }, delay);
  }

  /**
   * Continuous daylight drift (2026-09-28 user ruling "feel the time
   * passing"): while a ramp runs, the displayed factor FOLLOWS the analytic
   * daylightAt per frame — a 250ms quantization on the applied step keeps
   * the render count sane (4 fps through a 150s ramp is visually seamless;
   * each step is ~0.17% of the wash). When the ramp settles back onto a
   * plateau (factor exactly 0 or 1), tracking stops and the next boundary
   * timer is armed — idle cost returns to zero.
   */
  private updateDaylight(perfNow: number): boolean {
    if (!this.daylightTracking) return false;
    const target = daylightAt(Date.now());
    const settled = (target === 0 || target === 1) && this.daylight === target;
    if (
      perfNow - this.daylightAppliedAt >= DAYLIGHT_STEP_MS &&
      Math.abs(target - this.daylight) > 0.0005
    ) {
      this.daylight = target;
      this.applyDaylight();
      this.daylightAppliedAt = perfNow;
      this.dirty = true;
    }
    if (settled) {
      this.daylightTracking = false;
      this.scheduleDaylightWake();
    }
    return true; // keep the ticker alive through the ramp
  }

  /**
   * Apply the current daylight factor: day-sky crossfade alpha, the
   * screen-blend wash, the world color-matrix lift (dark masses → shades of
   * white, lerped to identity by night), and a raised bloom threshold /
   * lowered bloom scale — the brighter daytime scene must not glow out, and
   * the night ambience (threshold 0.55, scale 0.85, no matrix) stays exactly
   * as it was once night returns.
   */
  private applyDaylight(): void {
    const v = this.daylight;
    this.skyDay.alpha = v;
    this.dayWash.alpha = v;
    this.bloom.threshold = 0.55 + 0.25 * v;
    this.bloom.bloomScale = 0.85 - 0.3 * v;
    // Buildings crossfade their day/night/lights ART frames (or, in the
    // procedural fallback, dim lit windows to a glass sheen) — same 250 ms
    // ramp cadence, alpha-only, no redraws. The terrain plate + hero
    // filters ride along inside IsoWorld.setDaylight.
    this.world.setDaylight(v);
    // Aggregate skyline: same soft daylight lerp as the hero layers.
    const scale = 1 + (0.68 - 1) * v;
    const offset = 0.3 * v;
    this.aggregateDay.matrix = [
      scale, 0, 0, 0, offset,
      0, scale, 0, 0, offset,
      0, 0, scale, 0, offset,
      0, 0, 0, 1, 0,
    ];
  }

  private requestRender(): void {
    if (this.destroyed) return;
    this.dirty = true;
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  /** Dev perf overlay push (≤2 Hz, only while frames actually render). */
  private lastPerfPush = 0;

  private pushPerfSnapshot(now: number): void {
    if (!PERF_OVERLAY || now - this.lastPerfPush < PERF_PUSH_MS) return;
    this.lastPerfPush = now;
    const stats = this.world.cullStats;
    cityWorldStore.getState().setPerf({
      fps: this.frameEma > 0 ? Math.round(1000 / this.frameEma) : 0,
      frameMs: Math.round(this.frameEma * 10) / 10,
      spritesTotal: stats.total,
      spritesVisible: stats.visible,
      lod: this.lod,
      bloom: this.bloomAttached,
      daylight: Math.round(this.daylight * 100) / 100,
      zoom: Math.round(this.rig.state.zoom * 100) / 100,
    });
  }

  private tick = (): void => {
    this.raf = 0;
    if (this.destroyed) return;
    let busy = false;
    if (this.rig.update()) busy = true;
    if (this.fx.update(performance.now())) busy = true;
    if (this.links.update(performance.now())) busy = true;
    if (this.rootLayer.update(performance.now())) busy = true;
    if (this.aggregate.update(performance.now())) busy = true;
    if (this.satellites.update(performance.now())) busy = true;
    if (this.universe.update(performance.now())) busy = true;
    if (this.updateMoves(performance.now())) busy = true;
    if (this.updateDetailFade(performance.now())) busy = true;
    if (this.updateDaylight(performance.now())) busy = true;
    if (this.dirty || busy) {
      this.dirty = false;
      this.updateFrameProbe(performance.now());
      // A throw inside app.render() (e.g. a bad GPU upload) must not kill
      // the render-on-demand loop forever — log it and let the next
      // requestRender retry (2026-09-28 zoom-blank postmortem).
      try {
        this.app.render();
      } catch (err) {
        console.error("[city] render failed", err);
      }
      this.pushPerfSnapshot(performance.now());
    }
    if (busy) this.requestRender();
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.daylightTracking = false;
    if (this.daylightTimer !== null) {
      clearTimeout(this.daylightTimer);
      this.daylightTimer = null;
    }
    this.ro.disconnect();
    this.rig.destroy();
    this.fx.clearShots();
    this.fxRoot.filters = []; // release the bloom framebuffers first
    this.app.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.avatarReadyTeardown?.();
    this.avatarReadyTeardown = null;
    this.pixelArtTeardown?.();
    this.pixelArtTeardown = null;
    // Mounted billboard textures died with the app; free the never-mounted
    // stragglers and empty the cache (a remount must reload, never reuse).
    resetAvatarTextures();
  }
}
