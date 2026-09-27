/**
 * Mainframe City — one building sprite (client-only Pixi).
 *
 * Strictly a RENDERER: tier, protection, and identity all arrive from the
 * server projection and are only DRAWN here — no economy math, no local
 * recomputation (AGENTS.md §"Mainframe City building layer").
 *
 * Layers (each a child display object so LOD toggling and FX stay cheap):
 *   1 platform      flat inset diamond + family rim
 *   2 silhouette    tier-1 family silhouette (art.ts manifest)
 *   3 tierExt       tier 2..7 modular floors + shared tier features
 *   4 windows       lit window mask (close LOD only)
 *   5 identity      profession sigil (close LOD only)
 *   6 status        firewall cyan ring / hard-lock amber (DOM-tile colors)
 *   7 selection     corner brackets + emissive body edge
 *   8 label         floating name chip while selected (Phase C polish c)
 *   9 fx            slot owned by FxLayer one-shots
 *
 * Family + tier art comes exclusively from CITY_ART_MANIFEST via familyArt()
 * (art.ts) — future WebP atlases slot in there without touching this class.
 *
 * The sprite's origin (0,0) is the TILE CENTER; the body extends upward
 * (negative y). Depth = zIndex set by IsoWorld from the global (x+y).
 */

import { Container, Graphics, Text } from "pixi.js";
import { UNASSIGNED_FAMILY, type CityBuilding } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import {
  COLOR_SELECTION,
  drawIdentityMarker,
  drawPlatform,
  drawSelectionBrackets,
  drawStatusRing,
  drawTierFeatures,
  drawWindows,
  familyArt,
  professionColor,
  tierHeight,
} from "./art";

export class BuildingSprite extends Container {
  private _building: CityBuilding;

  private readonly platform: Graphics = new Graphics();
  private readonly silhouette: Graphics = new Graphics();
  private readonly tierExt: Graphics = new Graphics();
  private readonly windows: Graphics = new Graphics();
  private readonly identity: Graphics = new Graphics();
  private readonly status: Graphics = new Graphics();
  private readonly selection: Graphics = new Graphics();
  /** Layer 8 — plated name chip (close-LOD ambient + the selected building). */
  private nameChip: Container | null = null;
  /** Leader line from the building top to the SELECTED chip (strong plate). */
  private labelLeader: Graphics | null = null;
  /** Layer 9 — FxLayer mounts one-shot effects here. */
  readonly fxSlot: Container = new Container();

  private drawnKey = "";
  /** Last-built chip identity (text + strong flag) — avoids Text rebuilds. */
  private labelKey = "";
  /** Viewport-cull reason bit (see setCulled — culling owns `visible`). */
  private cullHidden = false;

  constructor(building: CityBuilding) {
    super();
    this._building = building;
    this.addChild(
      this.platform,
      this.silhouette,
      this.tierExt,
      this.windows,
      this.identity,
      this.status,
      this.selection,
      this.fxSlot
    );
    // SELECTION IS OFF BY DEFAULT (Pixi Graphics defaults to visible=true —
    // leaving it true made EVERY building wear the selection wireframe, so
    // selected vs unselected rendered pixel-identical).
    this.selection.visible = false;
    this.redraw();
  }

  get building(): CityBuilding {
    return this._building;
  }

  /** Apply a NEW server building state (diff layer decides what changed). */
  updateBuilding(next: CityBuilding): void {
    this._building = next;
    this.redraw();
  }

  setSelected(selected: boolean): void {
    this.selection.visible = selected;
  }

  /**
   * Plated name chip (zh/en resolved by the caller via cardDisplayName):
   * a dark rounded backing plate behind the text (like the HQ CORE tag) so
   * the name reads over any background. `strong` (the selected building)
   * adds a selection-blue plate border + a leader line from the body top.
   */
  showLabel(text: string, opts?: { strong?: boolean }): void {
    const strong = opts?.strong ?? false;
    // Reuse the existing chip when only visibility changed (camera-settle
    // passes re-run constantly — never rebuild an identical Text).
    const key = `${strong ? "S" : "-"}|${text}`;
    if (this.nameChip && this.labelKey === key) {
      this.nameChip.visible = true;
      if (this.labelLeader) this.labelLeader.visible = true;
      return;
    }
    this.labelKey = key;
    this.destroyLabel();

    const label = new Text({
      text,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontWeight: "bold",
        letterSpacing: 0.5,
        fill: 0xffffff,
      },
    });
    label.anchor.set(0.5);

    const padX = 9;
    const padY = 4;
    const w = label.width + padX * 2;
    const h = Math.max(label.height, 12) + padY * 2;
    const plate = new Graphics();
    plate
      .roundRect(-w / 2, -h / 2, w, h, 5)
      .fill({ color: 0x0b1220, alpha: 0.88 });
    plate.roundRect(-w / 2, -h / 2, w, h, 5).stroke({
      width: strong ? 2 : 1,
      color: strong ? COLOR_SELECTION : 0x64748b,
      alpha: strong ? 1 : 0.85,
    });

    const chip = new Container();
    chip.addChild(plate, label);
    const top = -tierHeight(this._building.tier);
    chip.y = top - 36;
    chip.visible = true;
    this.addChild(chip);
    this.nameChip = chip;

    if (strong) {
      // Leader line: building top → chip plate (the selection tell).
      const leader = new Graphics();
      leader
        .moveTo(0, top - 4)
        .lineTo(0, chip.y + h / 2 + 2)
        .stroke({ width: 1.5, color: COLOR_SELECTION, alpha: 0.9 });
      this.addChild(leader);
      this.labelLeader = leader;
    }
  }

  hideLabel(): void {
    if (this.nameChip) this.nameChip.visible = false;
    if (this.labelLeader) this.labelLeader.visible = false;
  }

  private destroyLabel(): void {
    if (this.nameChip) {
      this.removeChild(this.nameChip);
      this.nameChip.destroy({ children: true });
      this.nameChip = null;
    }
    if (this.labelLeader) {
      this.removeChild(this.labelLeader);
      this.labelLeader.destroy();
      this.labelLeader = null;
    }
  }

  /** LOD: windows + identity markers only at close zoom (bounded rendering).
   * Alpha resets to 1 so the scene's detail fade restarts cleanly per swap;
   * the fade itself is driven by CityScene (one tween for ALL sprites). */
  setLod(lod: Lod): void {
    const close = lod === "close";
    this.windows.visible = close;
    this.identity.visible = close;
    this.windows.alpha = 1;
    this.identity.alpha = 1;
  }

  /**
   * Detail-layer alpha for the LOD-swap fade-in (windows + identity layers
   * only — the silhouette never fades). Applied by the scene's single tween.
   */
  setDetailAlpha(alpha: number): void {
    this.windows.alpha = alpha;
    this.identity.alpha = alpha;
  }

  /**
   * Viewport culling (Phase D bounded rendering). Culling owns `visible`
   * EXCLUSIVELY: setLod never hides a whole sprite (only the windows/identity
   * sublayers), so a single `cullHidden` reason cannot fight the LOD system.
   * If a future LOD band hides whole sprites, add a second reason bit here.
   */
  setCulled(hidden: boolean): void {
    if (this.cullHidden === hidden) return; // idempotent — no dirty churn
    this.cullHidden = hidden;
    this.visible = !hidden;
  }

  /**
   * Semi-transparent duplicate used as the placement ghost. Faint on
   * purpose: the ghost must NOT mask the valid/invalid tile FILL beneath it
   * (green/red footprint verdict — the fill is the primary signal).
   */
  setGhostAlpha(): void {
    this.alpha = 0.45;
  }

  private redraw(): void {
    // Skip redundant redraws: the visual depends only on these three fields.
    const key = `${this.building.profession ?? ""}|${this.building.tier}|${this.building.protection}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    // Tier changed → chip/leader heights are stale; force a rebuild on the
    // next showLabel (the scene re-runs the chip pass after every sync).
    this.labelKey = "";

    const spec = familyArt(this.building.profession);
    const color = professionColor(this.building.profession);
    const tier = this.building.tier;
    const professioned =
      !!this.building.profession && this.building.profession !== UNASSIGNED_FAMILY;

    this.platform.clear();
    drawPlatform(this.platform, color, professioned);

    this.silhouette.clear();
    spec.drawBase(this.silhouette);

    this.tierExt.clear();
    for (let floor = 2; floor <= tier; floor++) {
      spec.drawFloor(this.tierExt, floor);
    }
    drawTierFeatures(this.tierExt, this.building.profession, tier);
    spec.drawRooftop(this.tierExt, tier);

    this.windows.clear();
    drawWindows(this.windows, tier, color, this.building.profession);

    this.identity.clear();
    drawIdentityMarker(this.identity, this.building.profession, tier);

    this.status.clear();
    drawStatusRing(this.status, this.building.protection);

    const wasSelected = this.selection.visible;
    this.selection.clear();
    drawSelectionBrackets(this.selection, this.building.profession, tier);
    this.selection.visible = wasSelected;
  }

  /** Tier label height (FX anchor point). */
  get topY(): number {
    return -tierHeight(this.building.tier);
  }
}
