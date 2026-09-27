/**
 * Mainframe City — satellite cities layer (client-only Pixi).
 *
 * Renders the NEIGHBOR cities of the projection (owned cards that own
 * cards): one compact cluster per neighbor, far outside the 3×3 macro grid
 * (geometry in lib/city/satellites.ts — anchors can never overlap the home
 * city or each other). Each cluster is a miniature of the home rule set:
 * a relay HQ (the neighbor card) at the anchor, its owned buildings on
 * clockwise mini-rings (priciest nearest the relay), a violet identity
 * plate, and a dim dashed data-link back to the neighbor's OWN building in
 * the home orbit — "this tower is why that city is here".
 *
 * INTERACTION: satellite buildings are FOREIGN cards. Tapping one selects
 * it for the DOM inspector's steal (hire) action; tapping the relay selects
 * the neighbor's own home-orbit building (normal inspector). RENDER-ONLY:
 * tier/protection/value all arrive from the public projection and are never
 * recomputed here; the steal itself goes through /api/game/purchase.
 */

import { Container, Graphics } from "pixi.js";
import type { CityNeighbor } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import type { CullRect } from "@/lib/city/scene/culling";
import {
  TILE_H,
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
import type { TileRef } from "@/lib/city/placement";
import { drawDashedLine, makeTextChip } from "./art";
import { BuildingSprite } from "./BuildingSprite";
import { HqSprite } from "./HqSprite";
import { worldPointOfTile } from "./IsoWorld";

/** Dim cool slate over satellite ink — reads "not your city" at a glance. */
const FOREIGN_TINT = 0xc7d0e4;
/** Identity/interaction accent for all satellite chrome (violet). */
const SATELLITE_ACCENT = 0x8b5cf6;

/** Screen-px kept above the pad for relay art + plates (bounds/culling). */
const CLUSTER_ART_TOP_PX = 150;

export type SatellitePick =
  | { kind: "hq"; ownerCardId: number }
  | { kind: "building"; ownerCardId: number; cardId: number };

interface Cluster {
  neighbor: CityNeighbor;
  /** Current slot (index in the neighbors array) — anchor + focus source. */
  slot: number;
  container: Container;
  relay: HqSprite;
  pad: Graphics;
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
  private displayName: ((username: string) => string) | null = null;
  private moreLabel: ((count: number) => string) | null = null;
  private prevForeignKeys: Set<string> | null = null;
  private lastFx: SatelliteSyncFx = { seeded: true, added: [], removed: [] };
  private selected: { owner: number; cardId: number } | null = null;

  constructor() {
    super();
    this.addChild(this.links);
    this.sortableChildren = false;
  }

  /**
   * Full projection sync. `anchorTileOf` resolves a neighbor card id to its
   * CURRENT home-orbit tile (the data-link origin); a missing tile (card
   * beyond the detailed window cannot happen — satellites derive from the
   * detailed set — but a stale mid-sync miss is simply skipped).
   */
  sync(
    neighbors: readonly CityNeighbor[],
    anchorTileOf: (cardId: number) => TileRef | undefined,
    lod: Lod
  ): SatelliteSyncFx {
    const added: Array<{ x: number; y: number }> = [];
    const removed: Array<{ x: number; y: number }> = [];
    const nextKeys = new Set<string>();
    const seen = new Set<number>();

    neighbors.forEach((neighbor, slot) => {
      seen.add(neighbor.cardId);
      let cluster = this.clusters.get(neighbor.cardId);
      if (!cluster) {
        const container = new Container();
        container.sortableChildren = true;
        const anchor = satelliteAnchor(slot);
        const p = tileToScreen(anchor.x, anchor.y);
        container.position.set(p.x, p.y);
        const pad = new Graphics();
        container.addChild(pad);
        const relay = new HqSprite(neighbor.profession);
        relay.scale.set(0.5);
        relay.setTag(""); // the identity plate below replaces the CORE tag
        relay.tint = FOREIGN_TINT;
        relay.zIndex = 9_000; // above the ring buildings, below the plate
        container.addChild(relay);
        this.addChild(container);
        cluster = {
          neighbor,
          slot,
          container,
          relay,
          pad,
          plate: null,
          plateKey: "",
          buildings: new Map(),
          anchor,
        };
        this.clusters.set(neighbor.cardId, cluster);
        this.drawPad(cluster);
      } else if (cluster.neighbor.profession !== neighbor.profession) {
        cluster.relay.setProfession(neighbor.profession);
      }
      cluster.neighbor = neighbor;
      cluster.slot = slot;

      // Slot drift (a richer neighbor displaced this one): snap the cluster
      // to its new anchor — rare, and a glide across the void would read as
      // noise rather than intent.
      const anchor = satelliteAnchor(slot);
      if (anchor.x !== cluster.anchor.x || anchor.y !== cluster.anchor.y) {
        cluster.anchor = anchor;
        const p = tileToScreen(anchor.x, anchor.y);
        cluster.container.position.set(p.x, p.y);
        this.drawPad(cluster);
      }

      this.syncPlate(cluster);

      // Buildings: reuse sprites by card id, place on fresh mini-ring tiles.
      const tiles = satelliteClusterTiles(anchor, neighbor.buildings.length);
      const nextIds = new Set(neighbor.buildings.map((b) => b.cardId));
      for (const [cardId, entry] of cluster.buildings) {
        if (!nextIds.has(cardId)) {
          removed.push({ x: cluster.container.x + entry.sprite.x, y: cluster.container.y + entry.sprite.y });
          cluster.container.removeChild(entry.sprite);
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
          cluster.container.addChild(sprite);
          entry = { sprite, gx: tile.gx, gy: tile.gy };
          cluster.buildings.set(building.cardId, entry);
          added.push({
            x: cluster.container.x + tileToScreen(tile.gx - anchor.x, tile.gy - anchor.y).x,
            y: cluster.container.y + tileToScreen(tile.gx - anchor.x, tile.gy - anchor.y).y,
          });
        } else {
          entry.sprite.updateBuilding(building);
          entry.gx = tile.gx;
          entry.gy = tile.gy;
        }
        const local = tileToScreen(tile.gx - anchor.x, tile.gy - anchor.y);
        entry.sprite.position.set(local.x, local.y);
        entry.sprite.zIndex = local.x + local.y; // iso painter order
      });
    });

    // Neighbors that lost their city (all cards poached) go away entirely.
    for (const [cardId, cluster] of this.clusters) {
      if (seen.has(cardId)) continue;
      for (const entry of cluster.buildings.values()) {
        removed.push({ x: cluster.container.x + entry.sprite.x, y: cluster.container.y + entry.sprite.y });
      }
      this.removeChild(cluster.container);
      cluster.container.destroy({ children: true });
      this.clusters.delete(cardId);
    }

    this.redrawLinks(anchorTileOf);

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
   * tile first, then the relay's own anchor tile. Cluster-proximate misses
   * (pad, gaps) return null — same rule as the home grid's empty tiles.
   */
  pick(worldX: number, worldY: number): SatellitePick | null {
    const t = screenToTile(worldX, worldY);
    const gx = Math.floor(t.x);
    const gy = Math.floor(t.y);
    for (const [ownerCardId, cluster] of this.clusters) {
      const a = cluster.anchor;
      const cheb = Math.max(Math.abs(t.x - a.x), Math.abs(t.y - a.y));
      if (cheb > SATELLITE_CLUSTER_RADIUS + 1) continue;
      for (const [cardId, entry] of cluster.buildings) {
        if (entry.gx === gx && entry.gy === gy) {
          return { kind: "building", ownerCardId, cardId };
        }
      }
      if (gx === a.x && gy === a.y) {
        return { kind: "hq", ownerCardId };
      }
    }
    return null;
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

  // ── internals ─────────────────────────────────────────────────────────

  /** Faint violet pad diamond under one cluster (radius + skirt). */
  private drawPad(cluster: Cluster): void {
    const g = cluster.pad;
    g.clear();
    const e = SATELLITE_CLUSTER_RADIUS + 1.5;
    const corners: ReadonlyArray<[number, number]> = [
      [0, -e * TILE_H],
      [e * TILE_W, 0],
      [0, e * TILE_H],
      [-e * TILE_W, 0],
    ];
    g.poly(corners.flat()).fill({ color: 0x0a0e1a, alpha: 0.55 });
    const stroke = { width: 1.5, color: SATELLITE_ACCENT, alpha: 0.28 };
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = corners[i];
      const [x2, y2] = corners[(i + 1) % 4];
      drawDashedLine(g, x1, y1, x2, y2, 22, 14, stroke);
    }
  }

  /** Identity plate (+ "+N more" when truncated) above the relay spire. */
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
    plate.position.set(0, -92);
    plate.zIndex = 10_000;
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
