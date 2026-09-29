/**
 * Mainframe City — satellite cities layer (client-only Pixi).
 *
 * Renders the NEIGHBOR cities of the projection (owned cards that own
 * cards): one cluster per neighbor, outside the city's UNLOCKED sector pads
 * (geometry in lib/city/satellites.ts — the anchor ring is sized
 * DYNAMICALLY from the unlocked extent, so small cities keep their
 * satellites close).
 *
 * SAME SHAPE AS HOME (2026-09-28): each cluster is the home layout in
 * miniature — relay HQ core at the anchor, the SIX goddess monuments on the
 * same landmark hexagon (lit per the neighbor's `goddessOwned` flags,
 * dormant otherwise), and buildings on clockwise mini-rings from
 * ORBIT_START_RING out (priciest nearest the core). The whole mini city
 * lives in a 0.55-scaled `cityBox` so relative proportions match the home
 * city; the identity plate + data-link stay unscaled.
 *
 * CORE PULSE (2026-09-28): a small comet periodically travels each
 * data-link from the satellite's relay core to the player's HQ core —
 * value flowing home. Render-on-demand friendly: the layer keeps its own
 * wake timer so the idle gap between pulses costs zero rAF frames, and
 * reduced motion disables the pulse entirely.
 *
 * INTERACTION: satellite buildings are FOREIGN cards. Tapping one selects
 * it for the DOM inspector's steal (hire) action; tapping the relay selects
 * the neighbor's own home-orbit building (normal inspector). Picking is
 * forgiving — a body-rect/nearest match inside the cluster selects instead
 * of requiring the exact tile. RENDER-ONLY: tier/protection/value all
 * arrive from the public projection and are never recomputed here; the
 * steal itself goes through /api/game/purchase.
 */

import { Container, Graphics } from "pixi.js";
import type { CityNeighbor } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import type { CullRect } from "@/lib/city/scene/culling";
import {
  TILE_W,
  screenToTile,
  tileToScreen,
} from "@/lib/city/scene/iso";
import {
  SATELLITE_CLUSTER_RADIUS,
  satelliteAnchor,
  satelliteClusterBounds,
  satelliteClusterTiles,
  unionBounds,
  type WorldBounds,
} from "@/lib/city/satellites";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import type { TileRef } from "@/lib/city/placement";
import { drawDashedLine, makeTextChip } from "./art";
import { BuildingSprite } from "./BuildingSprite";
import { HqSprite } from "./HqSprite";
import { HQ_TILE, landmarkTile, worldPointOfTile } from "./IsoWorld";
import { LandmarkSprite } from "./landmarks";

/** Dim cool slate over satellite ink — reads "not your city" at a glance. */
const FOREIGN_TINT = 0xc7d0e4;
/** Identity/interaction accent for all satellite chrome (violet). */
const SATELLITE_ACCENT = 0x8b5cf6;

/**
 * Mini-city uniform scale. Internal geometry (tile distances, monument
 * scale, building art) is IDENTICAL to the home city; this one scale makes
 * it a miniature. Keep in sync with pick()'s local-space conversion.
 */
const MINI_CITY_SCALE = 0.55;

/** Screen-px kept above the pad for monument art + plates (bounds/culling). */
const CLUSTER_ART_TOP_PX = 210;

/** One core→core pulse cycle: travel window + idle gap (render-on-demand). */
const PULSE_TRAVEL_MS = 1500;
const PULSE_CYCLE_MS = 3400;
/** Stagger between clusters so pulses don't march in lockstep. */
const PULSE_STAGGER_MS = 430;

export type SatellitePick =
  | { kind: "hq"; ownerCardId: number; username: string }
  | { kind: "building"; ownerCardId: number; cardId: number };

interface Cluster {
  neighbor: CityNeighbor;
  /** Current slot (index in the neighbors array) — anchor + focus source. */
  slot: number;
  container: Container;
  /** The 0.55-scaled mini city (pad, monuments, relay, buildings). */
  cityBox: Container;
  relay: HqSprite;
  /** The Six mini monuments, roster order (created once, owned-flag synced). */
  monuments: LandmarkSprite[];
  /** Grass ground, day + night pair (crossfaded by setDaylight). */
  plate: Container | null;
  plateKey: string;
  /** Building sprites keyed by card id; local tiles keyed the same. */
  buildings: Map<number, { sprite: BuildingSprite; gx: number; gy: number }>;
  anchor: { x: number; y: number };
}

export interface SatelliteSyncFx {
  seeded: boolean;
  added: Array<{ x: number; y: number }>;
  removed: Array<{ x: number; y: number }>;
}

export class SatelliteLayer extends Container {
  private readonly clusters = new Map<number, Cluster>();
  /** One Graphics for ALL home↔satellite data-links (redrawn per sync). */
  private readonly links = new Graphics();
  /** One Graphics for the core→core pulse comets (redrawn per frame). */
  private readonly pulses = new Graphics();
  /** Player HQ core world point — pulse destination, set per sync. */
  private corePoint: { x: number; y: number } | null = null;
  /** Reduced motion → no pulse at all. */
  private pulseEnabled = true;
  /** Idle-gap wake timer (keeps the pulse looping without a live rAF). */
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onWake: () => void;
  private displayName: ((username: string) => string) | null = null;
  private moreLabel: ((count: number) => string) | null = null;
  private prevForeignKeys: Set<string> | null = null;
  private lastFx: SatelliteSyncFx = { seeded: true, added: [], removed: [] };
  private selected: { owner: number; cardId: number } | null = null;

  constructor(onWake: () => void = () => {}) {
    super();
    this.onWake = onWake;
    this.addChild(this.links, this.pulses);
    this.sortableChildren = false;
  }

  destroy(): void {
    this.clearWake();
    super.destroy();
  }

  /**
   * Full projection sync. `anchorTileOf` resolves a neighbor card id to its
   * CURRENT home-orbit tile (the data-link origin); `sectorCount` sizes the
   * dynamic anchor ring; `corePoint` is the player's HQ core (pulse target).
   */
  sync(
    neighbors: readonly CityNeighbor[],
    anchorTileOf: (cardId: number) => TileRef | undefined,
    lod: Lod,
    sectorCount: number,
    corePoint: { x: number; y: number }
  ): SatelliteSyncFx {
    const added: Array<{ x: number; y: number }> = [];
    const removed: Array<{ x: number; y: number }> = [];
    const nextKeys = new Set<string>();
    const seen = new Set<number>();
    this.corePoint = corePoint;

    neighbors.forEach((neighbor, slot) => {
      seen.add(neighbor.cardId);
      let cluster = this.clusters.get(neighbor.cardId);
      if (!cluster) {
        const container = new Container();
        const cityBox = new Container();
        cityBox.sortableChildren = true;
        cityBox.scale.set(MINI_CITY_SCALE);
        container.addChild(cityBox);
        const anchor = satelliteAnchor(slot, undefined, sectorCount);
        const p = tileToScreen(anchor.x, anchor.y);
        container.position.set(p.x, p.y);
        // The Six mini monuments — the home landmark hexagon, roster order.
        // Never labeled (the identity plate speaks for the cluster). zIndex
        // = the tile-depth sum (local gx+gy deltas), mirroring the home
        // layering: everything in ONE painter order — a ring building in
        // front of a monument covers its base, a monument in front of the
        // relay covers the core (2026-09-29 "landmarks on top" fix).
        const monuments: LandmarkSprite[] = [];
        for (let i = 0; i < GODDESS_USERNAMES.length; i++) {
          const monument = new LandmarkSprite(i, false);
          monument.tint = FOREIGN_TINT;
          const lt = landmarkTile(i);
          const local = tileToScreen(
            lt.x - HQ_TILE.x,
            lt.y - HQ_TILE.y
          );
          monument.position.set(local.x, local.y);
          monument.zIndex = lt.x - HQ_TILE.x + (lt.y - HQ_TILE.y);
          cityBox.addChild(monument);
          monuments.push(monument);
        }
        const relay = new HqSprite(neighbor.profession, neighbor.hqStage ?? 1);
        relay.setTag(""); // the identity plate below replaces the CORE tag
        relay.tint = FOREIGN_TINT;
        relay.setDaylight(this.daylightCurrent);
        relay.zIndex = 0; // tile-depth sum of the anchor itself
        cityBox.addChild(relay);
        this.addChild(container);
        cluster = {
          neighbor,
          slot,
          container,
          cityBox,
          relay,
          monuments,
          plate: null,
          plateKey: "",
          buildings: new Map(),
          anchor,
        };
        this.clusters.set(neighbor.cardId, cluster);
      } else {
        cluster.relay.setProfession(neighbor.profession);
        cluster.relay.setStage(neighbor.hqStage ?? 1);
      }
      cluster.neighbor = neighbor;
      cluster.slot = slot;
      // Mini monument owned flags (stale CDN payloads may omit the field).
      const flags = neighbor.goddessOwned ?? [];
      cluster.monuments.forEach((m, i) => m.setOwned(flags[i] === true));

      // Slot drift or a sector unlock re-sizes the anchor ring: snap the
      // cluster to its new anchor — rare, and a glide across the void would
      // read as noise rather than intent.
      const anchor = satelliteAnchor(slot, undefined, sectorCount);
      if (anchor.x !== cluster.anchor.x || anchor.y !== cluster.anchor.y) {
        cluster.anchor = anchor;
        const p = tileToScreen(anchor.x, anchor.y);
        cluster.container.position.set(p.x, p.y);
      }

      this.syncPlate(cluster);

      // Buildings: reuse sprites by card id, place on fresh mini-ring tiles
      // (world = anchor + local·scale, so FX anchor on the visible art).
      const tiles = satelliteClusterTiles(anchor, neighbor.buildings.length);
      const nextIds = new Set(neighbor.buildings.map((b) => b.cardId));
      for (const [cardId, entry] of cluster.buildings) {
        if (!nextIds.has(cardId)) {
          removed.push({
            x: cluster.container.x + entry.sprite.x * MINI_CITY_SCALE,
            y: cluster.container.y + entry.sprite.y * MINI_CITY_SCALE,
          });
          cluster.cityBox.removeChild(entry.sprite);
          entry.sprite.destroy({ children: true });
          cluster.buildings.delete(cardId);
        }
      }
      neighbor.buildings.forEach((building, i) => {
        const tile = tiles[i];
        if (!tile) return;
        nextKeys.add(`${neighbor.cardId}:${building.cardId}`);
        let entry = cluster.buildings.get(building.cardId);
        if (!entry) {
          const sprite = new BuildingSprite(building);
          sprite.tint = FOREIGN_TINT;
          sprite.setLod(lod);
          cluster.cityBox.addChild(sprite);
          entry = { sprite, gx: tile.gx, gy: tile.gy };
          cluster.buildings.set(building.cardId, entry);
          added.push({
            x:
              cluster.container.x +
              tileToScreen(tile.gx - anchor.x, tile.gy - anchor.y).x * MINI_CITY_SCALE,
            y:
              cluster.container.y +
              tileToScreen(tile.gx - anchor.x, tile.gy - anchor.y).y * MINI_CITY_SCALE,
          });
        } else {
          entry.sprite.updateBuilding(building);
          entry.gx = tile.gx;
          entry.gy = tile.gy;
        }
        const local = tileToScreen(tile.gx - anchor.x, tile.gy - anchor.y);
        entry.sprite.position.set(local.x, local.y);
        // Iso painter order — the TILE-depth sum (a screen-px sum mixes the
        // (gx−gy) axis in and sorts depth-equal tiles wrong).
        entry.sprite.zIndex = tile.gx - anchor.x + (tile.gy - anchor.y);
      });
    });

    // Neighbors that lost their city (all cards poached) go away entirely.
    for (const [cardId, cluster] of this.clusters) {
      if (seen.has(cardId)) continue;
      for (const entry of cluster.buildings.values()) {
        removed.push({
          x: cluster.container.x + entry.sprite.x * MINI_CITY_SCALE,
          y: cluster.container.y + entry.sprite.y * MINI_CITY_SCALE,
        });
      }
      this.removeChild(cluster.container);
      cluster.container.destroy({ children: true });
      this.clusters.delete(cardId);
    }

    this.redrawLinks(anchorTileOf);
    this.clearWake(); // cluster set changed — re-evaluate pulse scheduling

    const seeded = this.prevForeignKeys === null;
    this.lastFx = seeded
      ? { seeded: true, added: [], removed: [] }
      : { seeded: false, added, removed };
    this.prevForeignKeys = nextKeys;
    this.applySelection();
    return this.lastFx;
  }

  /** Locale-aware identity plates (called on locale change + after sync). */
  setLabels(
    displayName: (username: string) => string,
    moreLabel: (count: number) => string
  ): void {
    this.displayName = displayName;
    this.moreLabel = moreLabel;
    for (const cluster of this.clusters.values()) {
      cluster.plateKey = ""; // force plate rebuild
      this.syncPlate(cluster);
    }
  }

  /** Selection ring + strong chip on the tapped satellite building. */
  setSelected(sel: { owner: number; cardId: number } | null): void {
    this.selected = sel;
    this.applySelection();
  }

  setLod(lod: Lod): void {
    for (const cluster of this.clusters.values()) {
      for (const { sprite } of cluster.buildings.values()) sprite.setLod(lod);
    }
  }

  /**
   * Daylight factor for the hero sprites (relay + monuments scoped lifts)
   * AND the grass pads (day variant crossfades over the night one).
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    for (const cluster of this.clusters.values()) {
      cluster.relay.setDaylight(daylight);
      for (const m of cluster.monuments) m.setDaylight(daylight);
    }
  }
  private daylightCurrent = 0;

  /** Light-clock sample: fan out to the mini cities' sprites + heroes. */
  updateLights(tMs: number): void {
    for (const cluster of this.clusters.values()) {
      cluster.relay.updateLights(tMs);
      for (const m of cluster.monuments) m.updateLights(tMs);
      for (const { sprite } of cluster.buildings.values()) sprite.updateLights(tMs);
    }
  }


  /** Reduced-motion policy change: pulses stop entirely when reduced. */
  setPulseEnabled(enabled: boolean): void {
    this.pulseEnabled = enabled;
    if (!enabled) {
      this.pulses.clear();
      this.clearWake();
    }
  }

  /** Coarse culling: whole clusters in/out (≤ 8, pads are cheap). */
  applyCull(rect: CullRect): void {
    for (const cluster of this.clusters.values()) {
      const b = this.clusterCullBounds(cluster);
      cluster.container.visible =
        b.maxX >= rect.minX && b.minX <= rect.maxX && b.maxY >= rect.minY && b.minY <= rect.maxY;
    }
  }

  /**
   * Hit-test a world point against the satellite clusters: exact building
   * tile first (in the mini city's LOCAL tile space — the cityBox is scaled,
   * so world→local divides by MINI_CITY_SCALE), then a forgiving pass —
   * body-rect hits on tower art (bodies rise above their tiles) and the
   * nearest tile within ~1 platform select too, so dense clusters stay
   * tappable at miniature size.
   */
  pick(worldX: number, worldY: number): SatellitePick | null {
    // Pass 1 — exact tile hits (previous behaviour, unchanged priority).
    for (const [ownerCardId, cluster] of this.clusters) {
      const a = cluster.anchor;
      const local = this.worldToMiniLocal(cluster, worldX, worldY);
      const t = screenToTile(local.x, local.y);
      const gx = Math.floor(a.x + t.x);
      const gy = Math.floor(a.y + t.y);
      const cheb = Math.max(Math.abs(t.x), Math.abs(t.y));
      if (cheb > SATELLITE_CLUSTER_RADIUS + 1) continue;
      for (const [cardId, entry] of cluster.buildings) {
        if (entry.gx === gx && entry.gy === gy) {
          return { kind: "building", ownerCardId, cardId };
        }
      }
      if (gx === a.x && gy === a.y) {
        return { kind: "hq", ownerCardId, username: cluster.neighbor.username };
      }
    }
    // Pass 2 — forgiving: nearest candidate inside the cluster (local px,
    // threshold converted back from world so the touch target tracks the
    // on-screen miniature, not the internal tile scale).
    let bestPick: SatellitePick | null = null;
    let bestD = Infinity;
    const tolLocal = (TILE_W * 0.95) / MINI_CITY_SCALE;
    for (const [ownerCardId, cluster] of this.clusters) {
      if (!cluster.container.visible) continue;
      const local = this.worldToMiniLocal(cluster, worldX, worldY);
      const t = screenToTile(local.x, local.y);
      const cheb = Math.max(Math.abs(t.x), Math.abs(t.y));
      if (cheb > SATELLITE_CLUSTER_RADIUS + 1.6) continue;
      // The relay gets a small distance penalty so buildings win ties
      // against the (wide) relay art.
      const dRelay = Math.hypot(local.x, local.y) + 18;
      if (dRelay < bestD) {
        bestD = dRelay;
        bestPick = { kind: "hq", ownerCardId, username: cluster.neighbor.username };
      }
      for (const [cardId, entry] of cluster.buildings) {
        // Tower bodies rise above the tile — measure toward the body middle
        // so tapping the shaft hits this building, not the void behind it.
        const d = Math.hypot(
          local.x - entry.sprite.x,
          local.y - (entry.sprite.y + entry.sprite.topY * 0.5)
        );
        if (d < bestD) {
          bestD = d;
          bestPick = { kind: "building", ownerCardId, cardId };
        }
      }
    }
    return bestD <= tolLocal ? bestPick : null;
  }

  /** World px → mini-city local px (undoes the anchor + cityBox scale). */
  private worldToMiniLocal(
    cluster: Cluster,
    worldX: number,
    worldY: number
  ): { x: number; y: number } {
    return {
      x: (worldX - cluster.container.x) / MINI_CITY_SCALE,
      y: (worldY - cluster.container.y) / MINI_CITY_SCALE,
    };
  }

  /** Screen point of a cluster anchor (camera focus for the side panel). */
  anchorPointOf(slot: number): { x: number; y: number } | null {
    for (const cluster of this.clusters.values()) {
      if (cluster.slot === slot) return { x: cluster.container.x, y: cluster.container.y };
    }
    return null;
  }

  /** World-px extent of every cluster (relay/plate art included), or null. */
  worldBounds(): WorldBounds | null {
    let bounds: WorldBounds | null = null;
    for (const cluster of this.clusters.values()) {
      bounds = unionBounds(bounds, this.clusterCullBounds(cluster));
    }
    return bounds;
  }

  // ── core pulse ────────────────────────────────────────────────────────

  /**
   * Advance the core→core pulse comets. True while any comet is in its
   * travel window (the scene keeps rendering); during the idle gap a one-shot
   * timer re-wakes the render loop at the next departure — zero idle cost.
   */
  update(now: number): boolean {
    if (!this.pulseEnabled || !this.corePoint || this.clusters.size === 0) {
      this.pulses.clear();
      return false;
    }
    let traveling = false;
    let nextDeparture = Infinity;
    for (let s = 0; s < this.clusters.size; s++) {
      const phase = (now + s * PULSE_STAGGER_MS) % PULSE_CYCLE_MS;
      if (phase < PULSE_TRAVEL_MS) traveling = true;
      else nextDeparture = Math.min(nextDeparture, PULSE_CYCLE_MS - phase);
    }
    if (!traveling) {
      this.pulses.clear();
      this.scheduleWake(nextDeparture);
      return false;
    }
    this.clearWake();
    const g = this.pulses;
    g.clear();
    let i = 0;
    for (const cluster of this.clusters.values()) {
      const phase = (now + i * PULSE_STAGGER_MS) % PULSE_CYCLE_MS;
      i++;
      if (phase >= PULSE_TRAVEL_MS) continue;
      const p = phase / PULSE_TRAVEL_MS;
      // ease-in-out so the comet visibly leaves and arrives.
      const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
      const fade = Math.min(1, Math.min(p / 0.18, (1 - p) / 0.18));
      const ax = cluster.container.x;
      const ay = cluster.container.y;
      const cx = this.corePoint.x;
      const cy = this.corePoint.y - 40; // aim at the spire, not the pad
      const at = (tt: number) => ({
        x: ax + (cx - ax) * tt,
        y: ay + (cy - ay) * tt,
      });
      // Comet: bright head + violet tail trailing back toward the satellite.
      for (let k = 0; k < 4; k++) {
        const tt = Math.max(0, e - k * 0.055);
        const pos = at(tt);
        const r = k === 0 ? 5 : 4.5 - k;
        g.circle(pos.x, pos.y, r).fill({
          color: k === 0 ? 0xffffff : SATELLITE_ACCENT,
          alpha: (k === 0 ? 0.95 : 0.55 - k * 0.12) * fade,
        });
      }
    }
    return true;
  }

  private scheduleWake(delayMs: number): void {
    if (this.wakeTimer !== null || !Number.isFinite(delayMs)) return;
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.onWake();
    }, Math.max(16, delayMs));
  }

  private clearWake(): void {
    if (this.wakeTimer !== null) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  // NO GROUND PAD (2026-09-29 user ruling "remove the large floors around
  // buildings"): the 11-tile grass diamonds under the mini cities were
  // covering NEIGHBOURING cities' buildings at the new close packing, and
  // the world floor already renders continuous grass land — the mini cities
  // sit directly on it. Identity lives in the owner name plate.

  /** World-px anchors of every cluster (country-road endpoints). */
  roadAnchors(): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (const cluster of this.clusters.values()) {
      out.push({ x: cluster.container.x, y: cluster.container.y });
    }
    return out;
  }

  /** Identity plate (+ "+N more" when truncated) above the mini city. */
  private syncPlate(cluster: Cluster): void {
    if (!this.displayName) return;
    const name = this.displayName(cluster.neighbor.username);
    const more =
      cluster.neighbor.truncated && this.moreLabel
        ? this.moreLabel(cluster.neighbor.visibleOwnedCount - cluster.neighbor.buildings.length)
        : "";
    const key = `${name}¦${more}`;
    if (key === cluster.plateKey && cluster.plate) return;
    cluster.plateKey = key;
    if (cluster.plate) {
      cluster.container.removeChild(cluster.plate);
      cluster.plate.destroy({ children: true });
      cluster.plate = null;
    }
    const plate = new Container();
    const chip = makeTextChip(name, {
      borderColor: SATELLITE_ACCENT,
      fontSize: 13,
    });
    plate.addChild(chip);
    if (more) {
      const moreChip = makeTextChip(more, {
        fontSize: 10,
        fill: 0x9ca3af,
        borderColor: 0x374151,
      });
      moreChip.position.set(0, 17);
      plate.addChild(moreChip);
    }
    // Above the tallest mini-monument art (unscaled — text stays readable).
    plate.position.set(0, -188);
    cluster.container.addChild(plate);
    cluster.plate = plate;
  }

  /** Dim dashed data-links: home-orbit building → its satellite cluster. */
  private redrawLinks(anchorTileOf: (cardId: number) => TileRef | undefined): void {
    const g = this.links;
    g.clear();
    for (const [cardId, cluster] of this.clusters) {
      const tile = anchorTileOf(cardId);
      if (!tile) continue;
      const start = worldPointOfTile(tile);
      drawDashedLine(
        g,
        start.x,
        start.y,
        cluster.container.x,
        cluster.container.y,
        26,
        20,
        { width: 1.5, color: SATELLITE_ACCENT, alpha: 0.24 }
      );
    }
  }

  /** Cluster bounds incl. relay/plate art (culling + camera merge source). */
  private clusterCullBounds(cluster: Cluster): WorldBounds {
    const b = satelliteClusterBounds(cluster.anchor);
    return { ...b, minY: b.minY - CLUSTER_ART_TOP_PX };
  }

  /** Re-apply the current selection after a sync rebuilt sprites. */
  private applySelection(): void {
    for (const [ownerCardId, cluster] of this.clusters) {
      for (const [cardId, entry] of cluster.buildings) {
        const isSel =
          this.selected !== null &&
          this.selected.owner === ownerCardId &&
          this.selected.cardId === cardId;
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
}
