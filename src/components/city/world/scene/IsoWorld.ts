/**
 * Mainframe City — the isometric world (client-only Pixi).
 *
 * Owns:
 * - sector ground containers on the 3×3 macro grid: s0..s{sectorCount-1}
 *   draw as live pads; the REMAINING sectors from the server's sectorInfo
 *   draw as dimmed, dashed LOCKED pads with a static lock marker (Phase D).
 *   Sector unlock authority is the mission ladder via the payload — the
 *   world only renders what sectorInfo/sectorsUnlocked say;
 * - ONE identity label chip per UNLOCKED sector pad (world/district LOD;
 *   text resolved by the React shell — never i18n in the scene);
 * - the tile occupancy map (derived value-orbit placements, rings.ts);
 * - the buildings layer, depth-sorted by global (x + y) on layout change;
 * - the HQ core (sector 0 center, §D4) and the six goddess landmark pylons
 *   at fixed ring tiles (§D7 — landmarks are never layout rows);
 * - viewport culling (applyCull) for buildings, HQ and landmarks.
 *
 * RENDER-ONLY: every state it displays (tier, protection, placement, sector
 * unlock) is server-sent; this class never computes economy values.
 */

import { Container, Graphics } from "pixi.js";
import { GRID_SIZE } from "@/lib/city/layout-schema";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import type { CityBuilding, CityLandmark, CitySectorInfo } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import { pointVisible, type CullRect } from "@/lib/city/scene/culling";
import {
  SECTOR_MACRO,
  TILE_H,
  TILE_W,
  globalTile,
  pickTile,
  tileToScreen,
} from "@/lib/city/scene/iso";
import { tileRefKey, type TileRef } from "@/lib/city/placement";
import { HqSprite } from "./HqSprite";
import { BuildingSprite } from "./BuildingSprite";
import { drawDashedLine, drawLockMarker, makeTextChip } from "./art";
import {
  LandmarkSprite,
  landmarkArtHeight,
  landmarkBeamAnchor,
} from "./landmarks";

/** One building + the tile it renders on (persisted or visual auto-tile). */
export interface SceneBuildingEntry {
  building: CityBuilding;
  tile: TileRef;
}

/** HQ tile: sector 0 center. */
export const HQ_TILE: TileRef = { sector: "s0", x: GRID_SIZE >> 1, y: GRID_SIZE >> 1 };

/**
 * Fixed goddess landmark hexagon (roster order), hugging the HQ core at
 * Chebyshev radius ~3 — every city therefore reads with the SAME layout:
 * core in the middle, the Six tight around it, value rings beyond
 * (2026-09-28 user ruling: less empty space between core and goddesses).
 */
const LANDMARK_RING: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 3, dy: 0 },
  { dx: 2, dy: 2 },
  { dx: 0, dy: 3 },
  { dx: -3, dy: 0 },
  { dx: -2, dy: -2 },
  { dx: 0, dy: -3 },
];

export function landmarkTile(index: number): TileRef {
  const ring = LANDMARK_RING[index % LANDMARK_RING.length];
  return {
    sector: "s0",
    x: HQ_TILE.x + ring.dx,
    y: HQ_TILE.y + ring.dy,
  };
}

/**
 * Corner-to-corner SCREEN width of the landmark ring (plus monument-art
 * margin) — the span a viewport must fit for all six monuments to be
 * identifiable at the home framing (CityScene.homeCamera).
 */
export const LANDMARK_RING_SPAN_PX =
  Math.max(...LANDMARK_RING.map((r) => Math.abs(r.dx - r.dy))) * TILE_W + 176;

/** All fixture tiles the placement preview must treat as reserved. */
export function reservedTileKeys(): Set<string> {
  const keys = new Set<string>([tileRefKey(HQ_TILE)]);
  for (let i = 0; i < GODDESS_USERNAMES.length; i++) {
    keys.add(tileRefKey(landmarkTile(i)));
  }
  return keys;
}

/**
 * One-tile visual moat around each monument (8 neighbors, ring tiles and HQ
 * excluded). AUTO-ARRANGE avoids these so unplaced buildings never crowd the
 * monuments into illegibility; the PLAYER may still place there (only the
 * ring/HQ tiles themselves are truly reserved).
 */
export function moatTileKeys(): Set<string> {
  const reserved = reservedTileKeys();
  const keys = new Set<string>();
  for (let i = 0; i < GODDESS_USERNAMES.length; i++) {
    const t = landmarkTile(i);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const key = tileRefKey({ sector: "s0", x: t.x + dx, y: t.y + dy });
        if (!reserved.has(key)) keys.add(key);
      }
    }
  }
  return keys;
}

/** World-pixel center of a tile (any sector). */
export function worldPointOfTile(tile: TileRef): { x: number; y: number } {
  const sectorIndex = Number(tile.sector.replace(/^s/, "")) || 0;
  const g = globalTile(sectorIndex, tile.x, tile.y, GRID_SIZE);
  return tileToScreen(g.x, g.y);
}

/**
 * DEPTH FOG (night atmosphere, study §A5): iso depth = global (x + y), the
 * same signal as zIndex. The tint is normalized over the city's OCCUPIED
 * depth span (buildings ∪ HQ ∪ monument ring, floored at ~3 tiles) so the
 * fade is visible even in a small single-sector city — far rows melt into
 * the void while the near edge stays bright. Tint-only (alpha stays 1) so
 * painter's-order overlap never double-composites.
 */
function fogTint(depth: number, depthMin: number, depthSpan: number): number {
  const f = Math.max(0, Math.min(1, (depth - depthMin) / Math.max(1, depthSpan)));
  // Dim to ~55% at the far edge, cooling slightly less in blue → bluish fog.
  const r = Math.round(255 * (1 - 0.5 * f));
  const g = Math.round(255 * (1 - 0.47 * f));
  const b = Math.round(255 * (1 - 0.42 * f));
  return (r << 16) | (g << 8) | b;
}

export class IsoWorld extends Container {
  private _sectorCount: number;
  private readonly groundLayer = new Container();
  /** Ground-level overlays (data paths, district links) — beneath buildings. */
  readonly beneathBuildings = new Container();
  private readonly buildingsLayer = new Container();
  private readonly landmarkLayer = new Container();
  /**
   * HQ sits ABOVE the landmarks (2026-09-28 tight goddess ring): the screen-north
   * monument now grounds directly behind the HQ spire, and the near object must
   * paint over the far one. Ordinary towers stay under the monuments (moat keeps
   * them off the plinths anyway).
   */
  private readonly hqLayer = new Container();
  /** Sector identity chips — ABOVE buildings so they read over rooftops. */
  private readonly sectorLabelLayer = new Container();
  private hq: HqSprite | null = null;
  /** The Six goddess monuments, roster order (created once, updated in place). */
  private readonly landmarkSprites: LandmarkSprite[] = [];
  /** Server sector descriptors (locked pad count + label identities). */
  private sectorInfoList: readonly CitySectorInfo[] = [];
  private labelResolver: ((info: CitySectorInfo) => string) | null = null;
  private groundKey = "";
  private labelKey = "";

  private readonly sprites = new Map<number, BuildingSprite>();
  private readonly spriteTiles = new Map<number, TileRef>();
  /** tileKey → cardId occupying that tile. */
  private readonly occupancy = new Map<string, number>();

  constructor(sectorCount: number) {
    super();
    this._sectorCount = Math.max(1, Math.min(9, sectorCount));
    this.buildingsLayer.sortableChildren = true; // depth = zIndex (x+y)
    // landmarkLayer sits ABOVE buildingsLayer deliberately: the six monuments
    // are the sector's key landmarks — ordinary towers must never occlude
    // them (image-analyst Phase E gate: buildings stacked on monument
    // plinths made landmarks unreadable in dense cities).
    this.addChild(
      this.groundLayer,
      this.beneathBuildings,
      this.buildingsLayer,
      this.landmarkLayer,
      this.hqLayer,
      this.sectorLabelLayer
    );
    this.rebuildGround();
  }

  get sectorCount(): number {
    return this._sectorCount;
  }

  /** Occupied depth span for fog normalization (updated per sync). */
  private depthMin = 0;
  private depthSpan = 96;

  /** Sector count changed (mission completed) → rebuild the ground pads. */
  setSectorCount(count: number): void {
    const next = Math.max(1, Math.min(9, count));
    if (next === this._sectorCount) return;
    this._sectorCount = next;
    this.rebuildGround();
  }

  /**
   * Server sector descriptors + the locale-aware label resolver (the React
   * shell resolves cityBootSector / missionLabel / finalGoddessLabel — the
   * scene never imports i18n). Drives locked pads AND identity chips.
   */
  syncSectorInfo(
    info: readonly CitySectorInfo[],
    resolveLabel: (info: CitySectorInfo) => string
  ): void {
    this.sectorInfoList = info;
    this.labelResolver = resolveLabel;
    this.rebuildGround();
    this.rebuildSectorLabels();
  }

  /** How many LOCKED pads exist beyond the unlocked sector count. */
  private get lockedPadCount(): number {
    const known = Math.min(this.sectorInfoList.length, SECTOR_MACRO.length);
    return Math.max(0, known - this._sectorCount);
  }

  private rebuildGround(): void {
    const key = `${this._sectorCount}#${this.lockedPadCount}`;
    if (key === this.groundKey) return;
    this.groundKey = key;
    this.groundLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const total = this._sectorCount + this.lockedPadCount;
    for (let s = 0; s < total; s++) {
      const locked = s >= this._sectorCount;
      const origin = worldPointOfTile({ sector: `s${s}`, x: 0, y: 0 });
      const pad = new Container();
      pad.position.set(origin.x, origin.y);
      pad.addChild(this.drawSectorGround(s, locked));
      this.groundLayer.addChild(pad);
    }
  }

  private drawSectorGround(sectorIndex: number, locked: boolean): Graphics {
    const g = new Graphics();
    const n = GRID_SIZE;
    // Filled diamond pad.
    const far = tileToScreen(n, n);
    const corners: ReadonlyArray<[number, number]> = [
      [0, 0],
      [far.x / 2 + TILE_W / 4, far.y / 2 - TILE_H / 4],
      [far.x, far.y],
      [far.x / 2 - TILE_W / 4, far.y / 2 + TILE_H / 4],
    ];
    // OPAQUE pad (2026-09-28 user ruling "the floor still shows the stars"):
    // at 0.9 the baked starfield bled through the city floor — unlocked pads
    // must fully cover the sky. Locked pads stay near-transparent (dim voids).
    g.poly(corners.flat()).fill({
      color: sectorIndex === 0 ? 0x0a0e1a : 0x080b14,
      alpha: locked ? 0.06 : 1,
    });

    // Grid lines: constant-x and constant-y tile edges (fainter when locked).
    const gridAlpha = locked ? 0.035 : sectorIndex === 0 ? 0.16 : 0.1;
    for (let i = 0; i <= n; i++) {
      const a = tileToScreen(i, 0);
      const b = tileToScreen(i, n);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({
        width: 1,
        color: 0x22d3ee,
        alpha: gridAlpha,
      });
      const c = tileToScreen(0, i);
      const d = tileToScreen(n, i);
      g.moveTo(c.x, c.y).lineTo(d.x, d.y).stroke({
        width: 1,
        color: 0x22d3ee,
        alpha: gridAlpha,
      });
    }

    if (locked) {
      // Dashed boundary + static lock marker (no pulse — reduced-motion safe).
      const stroke = { width: 1.5, color: 0x22d3ee, alpha: 0.25 };
      for (let e = 0; e < 4; e++) {
        const [x1, y1] = corners[e];
        const [x2, y2] = corners[(e + 1) % 4];
        drawDashedLine(g, x1, y1, x2, y2, 18, 12, stroke);
      }
      drawLockMarker(g, 0, far.y / 2);
    }
    return g;
  }

  /**
   * ONE identity chip per UNLOCKED sector pad, near the pad's south vertex
   * (sparse rim — the pad center is the densest building area). Visible at
   * world/district LOD only (setLod); ≤ 9 chips so no culling needed.
   */
  private rebuildSectorLabels(): void {
    const resolver = this.labelResolver;
    // Key = the resolved TEXTS, so a locale switch (new resolver, new labels)
    // rebuilds the chips while identical syncs are free.
    const key = resolver
      ? this.sectorInfoList
          .filter((i) => i.index < this._sectorCount && i.index < SECTOR_MACRO.length)
          .map(resolver)
          .join("¦")
      : "";
    if (key === this.labelKey) return;
    this.labelKey = key;
    this.sectorLabelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!resolver) return;
    for (const info of this.sectorInfoList) {
      // Locked pads (and anything beyond the 3×3 macro grid) get no chip.
      if (info.index >= this._sectorCount || info.index >= SECTOR_MACRO.length) {
        continue;
      }
      const text = resolver(info);
      if (!text) continue;
      const chip = makeTextChip(text, { borderColor: 0x22d3ee });
      const origin = worldPointOfTile({ sector: info.key, x: 0, y: 0 });
      chip.position.set(origin.x, origin.y + GRID_SIZE * TILE_H - 18);
      this.sectorLabelLayer.addChild(chip);
    }
  }

  /** Persisted + fixture tiles no placement may use. */
  readonly reserved = reservedTileKeys();
  /** Monument moat — auto-arrange avoids; player placement allowed. */
  readonly landmarkMoat = moatTileKeys();

  isTileOccupied(key: string): boolean {
    return this.occupancy.has(key) || this.reserved.has(key);
  }

  occupancySnapshot(): ReadonlyMap<string, number> {
    return this.occupancy;
  }

  /** Full building sync — add/update/remove sprites + rebuild occupancy.
   * Removed entries carry their last tile so the FX layer can anchor the
   * loss effect after the sprite is gone. */
  syncBuildings(entries: readonly SceneBuildingEntry[]): {
    added: BuildingSprite[];
    removed: Array<{ building: CityBuilding; tile: TileRef }>;
  } {
    const nextIds = new Set(entries.map((e) => e.building.cardId));
    const removed: Array<{ building: CityBuilding; tile: TileRef }> = [];
    for (const [cardId, sprite] of this.sprites) {
      if (!nextIds.has(cardId)) {
        this.buildingsLayer.removeChild(sprite);
        sprite.destroy({ children: true });
        this.sprites.delete(cardId);
        removed.push({ building: sprite.building, tile: this.spriteTiles.get(cardId) ?? HQ_TILE });
      }
      this.spriteTiles.delete(cardId);
    }

    const added: BuildingSprite[] = [];
    this.occupancy.clear();
    // Occupied depth extent (fog normalization): buildings ∪ HQ ∪ monuments.
    let dMin = Infinity;
    let dMax = -Infinity;
    const noteDepth = (gx: number, gy: number) => {
      const d = gx + gy;
      if (d < dMin) dMin = d;
      if (d > dMax) dMax = d;
    };
    for (const landmark of LANDMARK_RING) {
      noteDepth(HQ_TILE.x + landmark.dx, HQ_TILE.y + landmark.dy);
    }
    noteDepth(HQ_TILE.x, HQ_TILE.y);
    for (const entry of entries) {
      const key = tileRefKey(entry.tile);
      this.occupancy.set(key, entry.building.cardId);
      let sprite = this.sprites.get(entry.building.cardId);
      if (!sprite) {
        sprite = new BuildingSprite(entry.building);
        this.sprites.set(entry.building.cardId, sprite);
        this.buildingsLayer.addChild(sprite);
        added.push(sprite);
      } else {
        sprite.updateBuilding(entry.building);
      }
      const p = worldPointOfTile(entry.tile);
      sprite.position.set(p.x, p.y);
      this.spriteTiles.set(entry.building.cardId, entry.tile);
      const sectorIndex = Number(entry.tile.sector.replace(/^s/, "")) || 0;
      const g = globalTile(sectorIndex, entry.tile.x, entry.tile.y, GRID_SIZE);
      sprite.zIndex = g.x + g.y; // iso depth: painters order by (x + y)
      noteDepth(g.x, g.y);
    }
    if (dMax > dMin) {
      this.depthMin = dMin;
      // Floor the span (~3 macro tiles) so tiny cities still get a gentle fade.
      this.depthSpan = Math.max(48, dMax - dMin);
    }
    const min = this.depthMin;
    const span = this.depthSpan;
    for (const sprite of this.sprites.values()) {
      sprite.tint = fogTint(sprite.zIndex, min, span);
    }
    return { added, removed };
  }

  /**
   * Goddess landmarks at their fixed ring tiles (roster order). Sprites are
   * created once and updated in place (owned flips + locale labels) — the
   * monument identity never changes. Returns the OWNED-flag list for the
   * scene's acquisition-FX edge detection.
   */
  syncLandmarks(
    landmarks: readonly CityLandmark[],
    displayName?: (username: string) => string
  ): boolean[] {
    landmarks.forEach((landmark, i) => {
      let sprite = this.landmarkSprites[i];
      if (!sprite) {
        sprite = new LandmarkSprite(i, landmark.owned);
        const p = worldPointOfTile(landmarkTile(i));
        sprite.position.set(p.x, p.y);
        const g = globalTile(0, landmarkTile(i).x, landmarkTile(i).y, GRID_SIZE);
        sprite.zIndex = g.x + g.y;
        sprite.tint = fogTint(g.x + g.y, this.depthMin, this.depthSpan);
        this.landmarkSprites[i] = sprite;
        this.landmarkLayer.addChild(sprite);
      } else {
        sprite.setOwned(landmark.owned);
      }
      sprite.setLabel(displayName ? displayName(landmark.username) : null);
    });
    this.landmarkLayer.sortableChildren = true;
    return this.landmarkSprites.map((s) => s.owned);
  }

  /** Beam anchors (monument tips, roster order) for the Root Sequence. */
  landmarkBeamPoints(): Array<{ x: number; y: number; owned: boolean; index: number }> {
    return this.landmarkSprites.map((s) => {
      const a = landmarkBeamAnchor(s.index);
      return { x: s.x + a.dx, y: s.y + a.dy, owned: s.owned, index: s.index };
    });
  }

  /** Mirror-list/panel selection ring on a landmark. */
  setLandmarkSelected(index: number | null): void {
    this.landmarkSprites.forEach((s, i) => s.setSelected(i === index));
  }

  /** HQ core at sector 0 center (own-card representation, §D4). */
  syncHq(profession: string | null, coreTag: string, ownerName: string): void {
    if (!this.hq) {
      this.hq = new HqSprite(profession);
      const p = worldPointOfTile(HQ_TILE);
      this.hq.position.set(p.x, p.y);
      const g = globalTile(0, HQ_TILE.x, HQ_TILE.y, GRID_SIZE);
      this.hq.zIndex = g.x + g.y;
      this.hq.tint = fogTint(g.x + g.y, this.depthMin, this.depthSpan);
      this.hqLayer.addChild(this.hq);
    } else {
      this.hq.setProfession(profession);
    }
    this.hq.setTag(coreTag);
    this.hq.setOwnerName(ownerName);
  }

  spriteFor(cardId: number): BuildingSprite | undefined {
    return this.sprites.get(cardId);
  }

  get allSprites(): Iterable<BuildingSprite> {
    return this.sprites.values();
  }

  /** Pick the building occupying a world point, if any.
   *  LOCKED sector pads are not interactive — taps there change nothing. */
  pickBuilding(worldX: number, worldY: number): { tile: TileRef; cardId: number | null } | null {
    const picked = pickTile(worldX, worldY, GRID_SIZE);
    if (!picked) return null;
    if (picked.sector >= this._sectorCount) return null; // locked pad
    const tile: TileRef = { sector: `s${picked.sector}`, x: picked.x, y: picked.y };
    return { tile, cardId: this.occupancy.get(tileRefKey(tile)) ?? null };
  }

  /**
   * Forgiving building pick (2026-09-28 "easier selection"): first a body-rect
   * hit (towers rise well above their tile, so tapping a rooftop used to hit
   * the tile BEHIND the building) — topmost painter order wins — then the
   * nearest building tile within `tolWorld` world px. Returns null when
   * nothing is close enough; exact-tile picking stays pickBuilding's job.
   */
  pickBuildingProximate(
    worldX: number,
    worldY: number,
    tolWorld: number
  ): { tile: TileRef; cardId: number } | null {
    let bestRect: { sprite: BuildingSprite; z: number } | null = null;
    let bestNear: { sprite: BuildingSprite; d: number } | null = null;
    for (const sprite of this.sprites.values()) {
      if (!sprite.visible) continue;
      const dx = worldX - sprite.x;
      const dy = worldY - sprite.y;
      // Body rect: platform halfwidth + a little slack, rooftop down to the
      // tile's front edge.
      if (
        Math.abs(dx) <= TILE_W * 0.55 &&
        dy >= sprite.topY - 8 &&
        dy <= TILE_H * 0.75
      ) {
        if (!bestRect || sprite.zIndex > bestRect.z) bestRect = { sprite, z: sprite.zIndex };
        continue;
      }
      // Distance to the body's vertical middle — nearest tower wins ties.
      const d = Math.hypot(dx, dy + sprite.topY * 0.5);
      if (d <= tolWorld && (!bestNear || d < bestNear.d)) bestNear = { sprite, d };
    }
    const sprite = bestRect?.sprite ?? bestNear?.sprite;
    if (!sprite) return null;
    const tile = this.spriteTiles.get(sprite.building.cardId);
    if (!tile) return null;
    return { tile, cardId: sprite.building.cardId };
  }

  /**
   * Forgiving monument pick: the Six are big art on small tiles — tap anywhere
   * on the monument body (pad to art tip, monument-scaled width) to select it.
   * Roster index, or -1.
   */
  landmarkHitAt(worldX: number, worldY: number): number {
    for (let i = 0; i < this.landmarkSprites.length; i++) {
      const s = this.landmarkSprites[i];
      if (!s.visible) continue;
      const dx = Math.abs(worldX - s.x);
      const dy = worldY - s.y;
      if (dx <= TILE_W * 0.62 && dy >= -(landmarkArtHeight(i) + 12) && dy <= TILE_H * 0.8) {
        return i;
      }
    }
    return -1;
  }

  setLod(lod: Lod): void {
    for (const sprite of this.sprites.values()) sprite.setLod(lod);
    for (const landmark of this.landmarkSprites) landmark.setLod(lod);
    // Sector identity chips: world/district LOD only.
    this.sectorLabelLayer.visible = lod !== "close";
  }

  /** Detail-layer alpha for the scene's LOD-swap fade (see BuildingSprite). */
  setDetailAlpha(alpha: number): void {
    for (const sprite of this.sprites.values()) sprite.setDetailAlpha(alpha);
  }

  /**
   * Viewport culling pass (runs on camera-settle / sync only — never per
   * frame). Sprites keep their body height + platform extents; the HQ and
   * landmark pylons use their fixed art heights. Ground pads, paths, links
   * and sector chips stay unculled (≤ 9 sectors — cheap static Graphics).
   */
  applyCull(rect: CullRect): void {
    for (const sprite of this.sprites.values()) {
      // topY is negative (bodies rise in −y): margin = body height + tile.
      sprite.setCulled(
        !pointVisible(rect, sprite.x, sprite.y, -sprite.topY + TILE_H, TILE_W / 2)
      );
    }
    if (this.hq) {
      this.hq.visible = pointVisible(rect, this.hq.x, this.hq.y, 150, TILE_W * 0.75);
    }
    // Landmarks use their per-monument art heights (landmarks.ts). Dormant
    // monuments stay hidden even in-viewport (setOwned rules them invisible;
    // the viewport pass must never un-hide one).
    this.landmarkSprites.forEach((landmark, i) => {
      landmark.visible =
        landmark.owned &&
        pointVisible(
          rect,
          landmark.x,
          landmark.y,
          landmarkArtHeight(i),
          TILE_W * 0.62
        );
    });
  }
}

