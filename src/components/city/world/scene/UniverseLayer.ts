/**
 * Mainframe City — the shared UNIVERSE layer (client-only Pixi).
 *
 * Every ranked city in the game on ONE map (2026-09-28 user ruling):
 * cities sit on clockwise rings around the universe center in
 * portfolio-rank order (pure placement in lib/city/universe.ts — rank 1
 * at the exact center, smaller cities spiraling outward). The viewer's
 * own city stays at their world origin, so the constellation is shared
 * and only translated per viewer — nobody can observe the difference.
 *
 * LOD ladder (bounded rendering):
 *   close zoom  — layer hidden (the home city + satellites are the world)
 *   district +  — MARKERS: batched Graphics dots sized by rank (≤ 500
 *                 circles in 4 chunks; the viewer's own city is skipped —
 *                 the real render IS the marker; stake cities glow violet)
 *   world zoom  — plus lazy MINI CITIES: the nearest handful of cities
 *                 load their public projection (the same CDN-cached
 *                 /api/city/[username] the public views use) and render as
 *                 full miniatures — relay core, six goddess monuments lit
 *                 per that city's ownership, top buildings on the orbit
 *                 rings — the home-city shape at 0.55 scale.
 *
 * Rank re-orders (new epoch, different ordering) GLIDE the markers to
 * their new ring (capped; reduced motion snaps). Data flows DOWN: the
 * layer renders what sync() receives and fetches nothing itself — city
 * detail comes through the fetcher callback the React shell injects.
 */

import { Container, Graphics } from "pixi.js";
import type { CityBuilding, CityProjection } from "@/lib/city/types";
import { CIVIC_KINDS } from "@/lib/city/types";

/** Public city projection + the route's owner.profession extra (relay art). */
type UniverseCityProjection = CityProjection & {
  owner: CityProjection["owner"] & { profession: string | null };
};
import type { Lod } from "@/lib/city/scene/lod";
import type { CullRect } from "@/lib/city/scene/culling";
import { TILE_W, tileToScreen } from "@/lib/city/scene/iso";
import { deriveStreets } from "@/lib/city/streets";
import {
  universeBaseRing,
  universeCityOffset,
  universeMarkerRadius,
  universeOffsetPx,
  universeViewerRank,
  type UniverseCity,
  type UniversePayload,
} from "@/lib/city/universe";
import { satelliteClusterTiles } from "@/lib/city/satellites";
import { NEIGHBOR_BUILDING_LIMIT } from "@/lib/city/neighbors";
import type { Point } from "@/lib/city/scene/iso";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { CIVIC_RING_OFFSETS } from "@/lib/city/placement";
import { HQ_TILE, landmarkTile, worldPointOfTile } from "./IsoWorld";
import { LandmarkSprite } from "./landmarks";
import { HqSprite } from "./HqSprite";
import { BuildingSprite } from "./BuildingSprite";
import { CivicSprite } from "./civic";
import { drawStreetTiles } from "./StreetsLayer";
import { makeTextChip } from "./art";

/** Distant-city ink: cool pale blue (stake cities use the satellite violet). */
const UNIVERSE_TINT = 0xbfd0e8;
/** Stake accent (matches SatelliteLayer's SATELLITE_ACCENT). */
const STAKE_ACCENT = 0x8b5cf6;
/** Top-3 constellation gold. */
const TOP_RANK_FILL = 0xf5c66b;

/** Mini-city uniform scale — same miniature language as the satellites. */
const MINI_CITY_SCALE = 0.55;
/** Markers per batched Graphics chunk (4 chunks cover the 500 cap). */
const MARKER_CHUNK = 128;
/** Rank glide duration (value re-rank at the city level). */
const EPOCH_GLIDE_MS = 700;
/** Above this many moved cities, snap everyone (re-rank storm). */
const EPOCH_GLIDE_CAP = 160;
/** Mini cities kept alive at once (LRU by camera distance). */
const MINI_LIVE_CAP = 14;
/** Nearest cities considered per camera settle (subset that may load). */
const MINI_REQUEST_CAP = 8;
/** Screen-px above a mini city kept for plates (culling margin). */
const MINI_ART_TOP_PX = 210;

export interface UniverseLayerStrings {
  displayName: (username: string) => string;
}

/** Rich universe tap: the relay core (HQ panel), one building, or a marker
 *  dot (city chip + visit link). */
export type UniversePick =
  | { kind: "hq"; username: string }
  | { kind: "building"; username: string; cardId: number }
  | { kind: "city"; username: string };

interface MiniBuildingEntry {
  sprite: BuildingSprite;
  gx: number;
  gy: number;
}

interface MiniCity {
  city: UniverseCity;
  container: Container;
  cityBox: Container;
  relay: HqSprite;
  monuments: LandmarkSprite[];
  civicSprites: CivicSprite[];
  buildings: Map<number, MiniBuildingEntry>;
  /** Mini street grid, day + night pair (below the relay in painter order). */
  streetsNight: Graphics;
  streetsDay: Graphics;
  /** Grass ground, day + night pair (crossfaded by setDaylight). */
  plate: Container | null;
  plateKey: string;
  /** World-px anchor (recomputed per epoch; minis snap). */
  world: Point;
}

export class UniverseLayer extends Container {
  private payload: UniversePayload | null = null;
  private epoch = "";
  /**
   * Viewer's universe base ring (2026-09-29 dynamic distance): derived from
   * their sectorCount — the first foreign city sits just past their stake
   * clusters, receding only as the home grid grows.
   */
  private viewerBase = universeBaseRing(1);
  private viewerUsername = "";
  private viewerRank = 1;
  private readonly stake = new Set<string>();
  private readonly failed = new Set<string>();
  /** Viewer HQ world point — the translation origin of the constellation. */
  private readonly hqWorld: Point = worldPointOfTile(HQ_TILE);
  private readonly markerChunks: Graphics[] = [];
  private readonly minis = new Map<string, MiniCity>();
  /** LRU order of live minis (most recently needed last). */
  private readonly miniOrder: string[] = [];
  private displayName: ((username: string) => string) | null = null;
  private lod: Lod = "district";
  private reduced = false;
  private selected: string | null = null;
  /** In-flight epoch glide (markers lerp from old to new anchors). */
  private glide: { from: Map<string, Point>; start: number } | null = null;
  /** City-detail fetcher injected by the React shell (returns null on 404). */
  private fetchCityDetail:
    | ((username: string) => Promise<UniverseCityProjection | null>)
    | null = null;

  constructor() {
    super();
    this.sortableChildren = false;
  }

  setCityDetailFetcher(
    fetcher: (username: string) => Promise<UniverseCityProjection | null>
  ): void {
    this.fetchCityDetail = fetcher;
  }

  setLabels(displayName: (username: string) => string): void {
    this.displayName = displayName;
    for (const mini of this.minis.values()) mini.plateKey = "";
    this.syncPlates();
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    if (reduced && this.glide) {
      this.glide = null;
      this.redrawMarkers(null);
    }
  }

  setLod(lod: Lod): void {
    this.lod = lod;
    this.visible = lod !== "close";
    for (const mini of this.minis.values()) {
      for (const entry of mini.buildings.values()) entry.sprite.setLod(lod);
      for (const civic of mini.civicSprites) civic.setLod(lod);
    }
  }

  /** Daylight factor for the mini cities' hero sprites (relay + monuments +
   *  civic + street pair) and their grass pads (day crossfades over night). */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    for (const mini of this.minis.values()) {
      mini.relay.setDaylight(daylight);
      mini.streetsDay.alpha = daylight;
      for (const m of mini.monuments) m.setDaylight(daylight);
      for (const civic of mini.civicSprites) civic.setDaylight(daylight);
    }
  }
  private daylightCurrent = 0;

  /** Light-clock sample: fan out to the mini cities' sprites + heroes. */
  updateLights(tMs: number): void {
    for (const mini of this.minis.values()) {
      mini.relay.updateLights(tMs);
      for (const m of mini.monuments) m.updateLights(tMs);
      for (const civic of mini.civicSprites) civic.updateLights(tMs);
      for (const entry of mini.buildings.values()) entry.sprite.updateLights(tMs);
    }
  }


  /** Selection ring on a universe city's marker + mini relay plate border. */
  setSelected(username: string | null): void {
    this.selected = username;
    this.redrawMarkers(null);
  }

  /**
   * Selection ring + strong name chip on one BUILDING inside a universe mini
   * city (2026-09-28 "select buildings on other cities"). Re-applied after
   * every mini (re)build so an arriving city honors a live selection.
   */
  setSelectedBuilding(sel: { username: string; cardId: number } | null): void {
    this.selectedBuilding = sel;
    this.applyBuildingSelection();
  }

  /** Selection ring on a mini city's relay core (HQ panel anchor). */
  setSelectedHq(username: string | null): void {
    this.selectedHq = username;
    for (const [u, mini] of this.minis) mini.relay.setSelected(u === username);
  }

  private selectedBuilding: { username: string; cardId: number } | null = null;
  private selectedHq: string | null = null;

  private applyBuildingSelection(): void {
    for (const [username, mini] of this.minis) {
      for (const [cardId, entry] of mini.buildings) {
        const isSel =
          this.selectedBuilding !== null &&
          this.selectedBuilding.username === username &&
          this.selectedBuilding.cardId === cardId;
        entry.sprite.setSelected(isSel);
        if (isSel && this.displayName) {
          entry.sprite.showLabel(this.displayName(entry.sprite.building.username), {
            strong: true,
          });
        } else {
          entry.sprite.hideLabel();
        }
      }
    }
  }

  /**
   * Full universe sync (React shell pushes the payload + viewer identity).
   * A changed EPOCH (same universe, new ordering) glides the markers;
   * everything else (stake set, viewer) just redraws.
   */
  sync(
    payload: UniversePayload | null,
    viewerUsername: string,
    stakeUsernames: ReadonlyArray<string>,
    sectorCount: number
  ): void {
    const baseChanged = this.viewerBase !== universeBaseRing(sectorCount);
    this.viewerBase = universeBaseRing(sectorCount);
    const stake = new Set(stakeUsernames);
    const stakeChanged =
      stake.size !== this.stake.size ||
      [...stake].some((u) => !this.stake.has(u));
    this.stake.clear();
    for (const u of stake) this.stake.add(u);

    if (!payload || payload.cities.length === 0) {
      this.payload = null;
      this.epoch = "";
      this.clearMinis();
      this.clearMarkerChunks();
      return;
    }

    const prevOffsets = this.payload ? this.markerOffsetsByUser() : null;
    this.payload = payload;
    this.viewerUsername = viewerUsername;
    const viewerRankChanged =
      this.viewerRank !== universeViewerRank(payload, viewerUsername);
    this.viewerRank = universeViewerRank(payload, viewerUsername);

    // Minis snap to their new anchors (rank drift of a whole city across
    // the void would read as noise; markers glide because they're dots).
    for (const mini of this.minis.values()) {
      const city = payload.cities.find((c) => c.username === mini.city.username);
      if (!city) {
        this.destroyMini(mini.city.username);
        continue;
      }
      mini.city = city;
      mini.world = this.worldOf(city);
      mini.container.position.set(mini.world.x, mini.world.y);
    }

    const orderChanged =
      payload.epoch !== this.epoch || viewerRankChanged || baseChanged;
    this.epoch = payload.epoch;
    if (orderChanged && prevOffsets && !this.reduced) {
      const next = this.markerOffsetsByUser();
      const moved: Array<[string, Point]> = [];
      for (const [username, to] of next) {
        const from = prevOffsets.get(username);
        if (from && (from.x !== to.x || from.y !== to.y)) moved.push([username, from]);
      }
      if (moved.length > 0 && moved.length <= EPOCH_GLIDE_CAP) {
        this.glide = { from: new Map(moved), start: performance.now() };
      } else {
        this.glide = null;
      }
    } else {
      this.glide = null;
    }
    this.redrawMarkers(null);
    if (stakeChanged) this.syncPlates();
  }

  /**
   * Camera-settle hook (never per frame): when the universe is visible,
   * ensure the nearest MINI_REQUEST_CAP cities have minis (fetching their
   * public projections through the injected fetcher) and evict far ones
   * beyond MINI_LIVE_CAP. The viewer + stake cities never get minis (the
   * home city is fully rendered; stake cities live in the satellite layer).
   */
  onCameraSettle(centerX: number, centerY: number, zoom: number): void {
    if (!this.payload || zoom >= 1.0 || this.visible === false) return;
    const ranked = this.payload.cities
      .filter(
        (c) =>
          c.username !== this.viewerUsername &&
          !this.stake.has(c.username) &&
          !this.failed.has(c.username)
      )
      .map((c) => {
        const p = this.worldOf(c);
        return { city: c, d: Math.hypot(p.x - centerX, p.y - centerY) };
      })
      .sort((a, b) => a.d - b.d);
    const wanted = ranked.slice(0, MINI_REQUEST_CAP).map((r) => r.city.username);
    for (const username of wanted) this.ensureMini(username);
    // Evict beyond the live cap (farthest-first by LRU position).
    while (this.miniOrder.length > MINI_LIVE_CAP) {
      const username = this.miniOrder.shift();
      if (username === undefined) break;
      if (wanted.includes(username)) {
        // keep wanted ones alive — push back to the end
        this.miniOrder.push(username);
        if (this.miniOrder[0] === username) break; // all wanted — stop
        continue;
      }
      this.destroyMini(username);
    }
  }

  /** Advance the epoch glide. True while animating (render loop stays on). */
  update(now: number): boolean {
    if (!this.glide) return false;
    const t = (now - this.glide.start) / EPOCH_GLIDE_MS;
    if (t >= 1) {
      this.glide = null;
      this.redrawMarkers(null);
      return false;
    }
    this.redrawMarkers(t);
    return true;
  }

  /**
   * Hit-test a world point: a mini city's relay core or one of its BUILDINGS
   * (forgiving, in the mini's local space — 2026-09-28 "select buildings on
   * other cities"), or a marker dot (city chip). Relay first: the core is the
   * mini's biggest, most deliberate target.
   */
  pick(worldX: number, worldY: number): UniversePick | null {
    for (const [username, mini] of this.minis) {
      if (!mini.container.visible) continue;
      const local = {
        x: (worldX - mini.container.x) / MINI_CITY_SCALE,
        y: (worldY - mini.container.y) / MINI_CITY_SCALE,
      };
      // Relay zone (±1.2 platforms) → the city's core building.
      if (Math.hypot(local.x, local.y) <= TILE_W * 0.62) {
        return { kind: "hq", username };
      }
      for (const [cardId, entry] of mini.buildings) {
        if (
          Math.abs(local.x - entry.sprite.x) <= TILE_W * 0.55 &&
          local.y >= entry.sprite.y + entry.sprite.topY - 8 &&
          local.y <= entry.sprite.y + 40
        ) {
          return { kind: "building", username, cardId };
        }
      }
    }
    if (!this.payload) return null;
    // Markers: nearest dot within its radius + slack (zoom-aware).
    let best: { username: string; d: number } | null = null;
    for (const city of this.payload.cities) {
      if (city.username === this.viewerUsername) continue;
      const p = this.worldOf(city);
      const d = Math.hypot(worldX - p.x, worldY - p.y);
      if (!best || d < best.d) best = { username: city.username, d };
    }
    if (best) {
      const city = this.payload.cities.find((c) => c.username === best!.username)!;
      const slack = 14;
      if (best.d <= universeMarkerRadius(city.rank) + slack) {
        return { kind: "city", username: best.username };
      }
    }
    return null;
  }

  /** Coarse culling: whole minis in/out; markers stay (batched, cheap). */
  applyCull(rect: CullRect): void {
    for (const mini of this.minis.values()) {
      const half = (6.5 * TILE_W) / 2 * MINI_CITY_SCALE;
      mini.container.visible =
        mini.world.x + half >= rect.minX &&
        mini.world.x - half <= rect.maxX &&
        mini.world.y + half >= rect.minY &&
        mini.world.y - half - MINI_ART_TOP_PX * MINI_CITY_SCALE <= rect.maxY;
    }
  }

  /** How many cities the map holds + the viewer's rank (HUD chip source). */
  summary(): { count: number; viewerRank: number } | null {
    if (!this.payload) return null;
    return { count: this.payload.cities.length, viewerRank: this.viewerRank };
  }

  // ── internals ─────────────────────────────────────────────────────────

  /** World-px position of a city (translated onto the viewer's origin). */
  private worldOf(city: Pick<UniverseCity, "rank">): Point {
    const delta = universeCityOffset(city.rank, this.viewerRank, this.viewerBase);
    const px = universeOffsetPx(delta);
    return { x: this.hqWorld.x + px.x, y: this.hqWorld.y + px.y };
  }

  /** Current marker offsets (username → world px), glide-aware. */
  private markerOffsetsByUser(): Map<string, Point> {
    const out = new Map<string, Point>();
    if (!this.payload) return out;
    for (const city of this.payload.cities) {
      if (city.username === this.viewerUsername) continue;
      out.set(city.username, this.worldOf(city));
    }
    return out;
  }

  /**
   * Redraw the batched marker chunks. `glideT` (0..1) interpolates each
   * moved marker from its pre-epoch anchor toward the current one; null
   * draws the resting state.
   */
  private redrawMarkers(glideT: number | null): void {
    if (!this.payload) {
      this.clearMarkerChunks();
      return;
    }
    while (this.markerChunks.length < 4) {
      const g = new Graphics();
      this.markerChunks.push(g);
      this.addChild(g);
    }
    const e =
      glideT === null
        ? null
        : glideT < 0.5
          ? 2 * glideT * glideT
          : 1 - (-2 * glideT + 2) ** 2 / 2;
    let drawn = 0;
    this.payload.cities.forEach((city, i) => {
      if (city.username === this.viewerUsername) return;
      const g = this.markerChunks[Math.floor(drawn / MARKER_CHUNK)];
      const to = this.worldOf(city);
      let x = to.x;
      let y = to.y;
      if (e !== null && this.glide) {
        const from = this.glide.from.get(city.username);
        if (from) {
          x = from.x + (to.x - from.x) * e;
          y = from.y + (to.y - from.y) * e;
        }
      }
      const r = universeMarkerRadius(city.rank, this.payload!.cities.length);
      const isStake = this.stake.has(city.username);
      const isSel = this.selected === city.username;
      if (i < 3) {
        g.circle(x, y, r).fill({ color: TOP_RANK_FILL, alpha: 0.85 });
        g.circle(x, y, r + 2.5).stroke({ color: 0xfff3d0, alpha: 0.5, width: 1 });
      } else {
        g.circle(x, y, r).fill({
          color: isStake ? STAKE_ACCENT : UNIVERSE_TINT,
          alpha: isStake ? 0.9 : 0.42,
        });
      }
      if (isSel) {
        g.circle(x, y, r + 4).stroke({ color: 0x9be8ff, alpha: 0.95, width: 2 });
      }
      drawn++;
    });
    // Trailing chunks from a smaller universe disappear.
    for (
      let c = Math.ceil(drawn / MARKER_CHUNK);
      c < this.markerChunks.length;
      c++
    ) {
      this.markerChunks[c].clear();
    }
  }

  private clearMarkerChunks(): void {
    for (const g of this.markerChunks) g.clear();
  }

  /** Load (or touch) the mini city for a username via the injected fetcher. */
  private ensureMini(username: string): void {
    const existing = this.minis.get(username);
    if (existing) {
      const i = this.miniOrder.indexOf(username);
      if (i >= 0) this.miniOrder.splice(i, 1);
      this.miniOrder.push(username);
      return;
    }
    const city = this.payload?.cities.find((c) => c.username === username);
    if (!city || !this.fetchCityDetail) return;
    this.fetchCityDetail(username)
      .then((projection) => {
        if (!projection || this.destroyed) return;
        if (!this.payload?.cities.some((c) => c.username === username)) return;
        this.buildMini(city, projection);
      })
      .catch(() => {
        this.failed.add(username);
      });
  }

  /** Build one lazy mini city from its public projection (home-city shape). */
  private buildMini(city: UniverseCity, projection: UniverseCityProjection): void {
    if (this.minis.has(city.username)) return;
    const container = new Container();
    const cityBox = new Container();
    cityBox.sortableChildren = true;
    cityBox.scale.set(MINI_CITY_SCALE);
    container.addChild(cityBox);

    // NO GROUND PAD (2026-09-29 user ruling "remove the large floors around
    // buildings"): the old 13-tile grass diamonds covered neighbouring
    // cities' buildings at the new close packing, and the world floor
    // already renders continuous grass land — mini cities sit directly on
    // it. Identity lives in the owner name plate.

    // The Six mini monuments — owned flags + value stages from that city's
    // landmarks (stale CDN payloads may lack stage → default 1).
    const landmarksByUsername = new Map(
      projection.landmarks.map((l) => [l.username, l] as const)
    );
    const monuments: LandmarkSprite[] = [];
    for (let i = 0; i < GODDESS_USERNAMES.length; i++) {
      const lm = landmarksByUsername.get(GODDESS_USERNAMES[i]);
      const monument = new LandmarkSprite(
        i,
        lm?.owned === true,
        lm?.stage ?? 1
      );
      monument.tint = UNIVERSE_TINT;
      monument.setDaylight(this.daylightCurrent);
      const lt = landmarkTile(i);
      const local = tileToScreen(lt.x - HQ_TILE.x, lt.y - HQ_TILE.y);
      monument.position.set(local.x, local.y);
      // Tile-depth painter order (same rule as the home city + satellites).
      monument.zIndex = lt.x - HQ_TILE.x + (lt.y - HQ_TILE.y);
      cityBox.addChild(monument);
      monuments.push(monument);
    }

    // Relay core (that city's own HQ — its value stage rides the payload).
    const relay = new HqSprite(projection.owner.profession, projection.hqStage ?? 1);
    relay.setTag("");
    relay.tint = UNIVERSE_TINT;
    relay.setDaylight(this.daylightCurrent);
    relay.zIndex = 0; // tile-depth sum of the anchor itself
    cityBox.addChild(relay);

    // Civic landmarks (that city's own tier; stale payloads default 0).
    const civicTier = Math.max(0, Math.min(3, projection.civic?.tier ?? 0));
    const civicFormTier = (civicTier >= 1 ? Math.min(3, civicTier) : 1) as 1 | 2 | 3;
    const civicSprites: CivicSprite[] = [];
    for (let i = 0; i < CIVIC_KINDS.length; i++) {
      const civic = new CivicSprite(CIVIC_KINDS[i], civicFormTier);
      civic.tint = UNIVERSE_TINT;
      civic.setDaylight(this.daylightCurrent);
      civic.visible = civicTier >= 1;
      const off = CIVIC_RING_OFFSETS[i];
      const local = tileToScreen(off.dx, off.dy);
      civic.position.set(local.x, local.y);
      civic.zIndex = off.dx + off.dy;
      cityBox.addChild(civic);
      civicSprites.push(civic);
    }

    // Top buildings by value on the orbit rings (display-only ordering of
    // server values — the same budget + policy the satellite mini cities
    // use: NEIGHBOR_BUILDING_LIMIT buildings on the SPACED mini orbit).
    const all: CityBuilding[] = [];
    for (const family of projection.families) {
      for (const b of family.buildings) all.push(b);
    }
    all.sort((a, b) => b.value - a.value || a.cardId - b.cardId);
    const buildings = new Map<number, MiniBuildingEntry>();
    const cap = Math.min(NEIGHBOR_BUILDING_LIMIT, all.length);
    const tiles = satelliteClusterTiles({ x: 0, y: 0 }, cap);
    all.slice(0, cap).forEach((building, i) => {
      const tile = tiles[i];
      if (!tile) return;
      const sprite = new BuildingSprite(building);
      sprite.tint = UNIVERSE_TINT;
      sprite.setLod(this.lod);
      const local = tileToScreen(tile.gx, tile.gy);
      sprite.position.set(local.x, local.y);
      sprite.zIndex = tile.gx + tile.gy; // tile-depth painter order
      cityBox.addChild(sprite);
      buildings.set(building.cardId, { sprite, gx: tile.gx, gy: tile.gy });
    });

    // Mini street grid (anchor-relative coords; same organic rule as the
    // home city — blocked: relay, monuments + moat, locked civic lots).
    const buildingTiles: Array<{ gx: number; gy: number }> = [
      ...buildings.values(),
    ].map((e) => ({ gx: e.gx, gy: e.gy }));
    if (civicTier >= 1) {
      for (const off of CIVIC_RING_OFFSETS) {
        buildingTiles.push({ gx: off.dx, gy: off.dy });
      }
    }
    const blocked = new Set<string>(["0,0"]);
    for (let i = 0; i < GODDESS_USERNAMES.length; i++) {
      const lt = landmarkTile(i);
      const cx = lt.x - HQ_TILE.x;
      const cy = lt.y - HQ_TILE.y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          blocked.add(`${cx + dx},${cy + dy}`);
        }
      }
    }
    if (civicTier < 1) {
      for (const off of CIVIC_RING_OFFSETS) blocked.add(`${off.dx},${off.dy}`);
    }
    const streetsNight = new Graphics();
    const streetsDay = new Graphics();
    streetsNight.zIndex = -1000;
    streetsDay.zIndex = -999;
    streetsDay.alpha = this.daylightCurrent;
    cityBox.addChild(streetsNight, streetsDay);
    const streets = buildingTiles.length
      ? deriveStreets(buildingTiles, (gx, gy) => blocked.has(`${gx},${gy}`))
      : [];
    drawStreetTiles(streetsNight, streets, "night", (gx, gy) => tileToScreen(gx, gy));
    drawStreetTiles(streetsDay, streets, "day", (gx, gy) => tileToScreen(gx, gy));

    const world = this.worldOf(city);
    container.position.set(world.x, world.y);
    this.addChild(container);
    this.minis.set(city.username, {
      city,
      container,
      cityBox,
      relay,
      monuments,
      civicSprites,
      streetsNight,
      streetsDay,
      buildings,
      plate: null,
      plateKey: "",
      world,
    });
    this.miniOrder.push(city.username);
    this.syncPlates();
    // Honor a live HQ/building selection in the freshly built city.
    relay.setSelected(this.selectedHq === city.username);
    this.applyBuildingSelection();
  }

  private destroyMini(username: string): void {
    const mini = this.minis.get(username);
    if (!mini) return;
    this.removeChild(mini.container);
    mini.container.destroy({ children: true });
    this.minis.delete(username);
    const i = this.miniOrder.indexOf(username);
    if (i >= 0) this.miniOrder.splice(i, 1);
  }

  private clearMinis(): void {
    for (const username of [...this.minis.keys()]) this.destroyMini(username);
    this.miniOrder.length = 0;
  }

  /** Identity plates over live minis (locale changes rebuild). */
  private syncPlates(): void {
    for (const mini of this.minis.values()) {
      if (!this.displayName) continue;
      const name = this.displayName(mini.city.username);
      const key = name;
      if (key === mini.plateKey && mini.plate) continue;
      mini.plateKey = key;
      if (mini.plate) {
        mini.container.removeChild(mini.plate);
        mini.plate.destroy({ children: true });
        mini.plate = null;
      }
      const plate = makeTextChip(name, { fontSize: 12 });
      plate.position.set(0, -188);
      mini.container.addChild(plate);
      mini.plate = plate;
    }
  }

  destroy(): void {
    this.clearMinis();
    this.clearMarkerChunks();
    super.destroy();
  }
}
