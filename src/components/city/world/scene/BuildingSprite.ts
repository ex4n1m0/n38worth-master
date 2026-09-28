/**
 * Mainframe City — one building sprite (client-only Pixi).
 *
 * Strictly a RENDERER: tier, protection, and identity all arrive from the
 * server projection and are only DRAWN here — no economy math, no local
 * recomputation (AGENTS.md §"Mainframe City building layer").
 *
 * Layers (each a child display object so LOD toggling and FX stay cheap):
 *   1 platform      wet slab + neon wash + reflection streak
 *   2 silhouette    tier-1 family silhouette (art.ts manifest)
 *   3 tierExt       tier 2..7 modular floors + shared tier features
 *   4 emissive      family lights (coils, beacons, LED strips) — bloom feed
 *   5 windows       close-LOD container: dark facade insets + LIT windows
 *                  (glow-modulated by daylight, setFacadeGlow) + micro-props
 *   6 identity      profession sigil (close LOD only)
 *   7 status        firewall cyan ring / hard-lock amber (DOM-tile colors)
 *   8 selection     corner brackets + emissive body edge
 *   9 label         floating name chip while selected (Phase C polish c)
 *  10 fx            slot owned by FxLayer one-shots
 *
 * Family + tier art comes exclusively from CITY_ART_MANIFEST via familyArt()
 * (art.ts) — future WebP atlases slot in there without touching this class.
 *
 * The sprite's origin (0,0) is the TILE CENTER; the body extends upward
 * (negative y). Depth = zIndex set by IsoWorld from the global (x+y), which
 * also drives the depth-fog tint (night atmosphere).
 */

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { UNASSIGNED_FAMILY, type CityBuilding } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import { facadeGlowAt } from "@/lib/city/scene/daylight";
import { avatarTexture, loadAvatarTexture } from "./avatars";
import { pixelFramesFor, type PixelArtFrames } from "./pixel-art";
import {
  COLOR_SELECTION,
  drawFacadeWindows,
  drawIdentityMarker,
  drawMicroProps,
  drawPlatform,
  drawSelectionBrackets,
  drawStatusRing,
  drawTierFeatures,
  familyArt,
  professionNeon,
  tierHeight,
} from "./art";

export class BuildingSprite extends Container {
  private _building: CityBuilding;

  private readonly platform: Graphics = new Graphics();
  /**
   * PIXEL-ART PATH (engine upgrade 2026-09-28): day/night/lights sprites
   * from the generated sheets, crossfaded by the daylight clock. While the
   * sheet loads (or if pixel art is disabled) they stay hidden and the
   * procedural layers below carry the building — zero pop-in regression.
   */
  private readonly artDay: Sprite = new Sprite();
  private readonly artNight: Sprite = new Sprite();
  /** Emissive-only frame, additive — alpha = facadeGlowAt(daylight). */
  private readonly artLights: Sprite = new Sprite();
  private pixelKey: string | null = null;
  private daylightCurrent = 0;
  private readonly silhouette: Graphics = new Graphics();
  private readonly tierExt: Graphics = new Graphics();
  /** Family emissives (coils/beacons/strips) — always visible, bloom feed. */
  private readonly emissive: Graphics = new Graphics();
  /** Close-LOD facade + clutter. Container alpha = LOD detail fade; the LIT
   *  child's alpha is daylight glow (setFacadeGlow) — the two compose. */
  private readonly windows = new Container();
  private readonly facadeBase: Graphics = new Graphics();
  private readonly facadeLit: Graphics = new Graphics();
  private readonly props: Graphics = new Graphics();
  /** Avatar billboard — single rooftop plate (see syncBillboards). */
  private readonly billboards = new Container();
  private readonly identity: Graphics = new Graphics();
  private readonly status: Graphics = new Graphics();
  private readonly selection: Graphics = new Graphics();
  /** Layer 9 — plated name chip (close-LOD ambient + the selected building). */
  private nameChip: Container | null = null;
  /** Leader line from the building top to the SELECTED chip (strong plate). */
  private labelLeader: Graphics | null = null;
  /** Layer 10 — FxLayer mounts one-shot effects here. */
  readonly fxSlot: Container = new Container();

  private drawnKey = "";
  /** Last-built chip identity (text + strong flag) — avoids Text rebuilds. */
  private labelKey = "";
  /** Current lit-window glow (1 = night) — reapplied on redraw/LOD swaps. */
  private facadeGlowCurrent = 1;
  /** Viewport-cull reason bit (see setCulled — culling owns `visible`). */
  private cullHidden = false;
  /** Current LOD band (billboards mount only in "close"). */
  private lodCurrent: Lod = "district";
  /** Mounted billboard identity (username|tier|profession — avoids remounts). */
  private billboardsKey = "";

  constructor(building: CityBuilding) {
    super();
    this._building = building;
    this.windows.addChild(this.facadeBase, this.facadeLit, this.props);
    this.addChild(
      this.platform,
      this.artDay,
      this.artNight,
      this.artLights,
      this.silhouette,
      this.tierExt,
      this.emissive,
      this.windows,
      this.billboards,
      this.identity,
      this.status,
      this.selection,
      this.fxSlot
    );
    this.artLights.blendMode = "add";
    this.artDay.visible = false;
    this.artNight.visible = false;
    this.artLights.visible = false;
    // SELECTION IS OFF BY DEFAULT (Pixi Graphics defaults to visible=true —
    // leaving it true made EVERY building wear the selection wireframe, so
    // selected vs unselected rendered pixel-identical). Billboards likewise
    // stay dark until a close-LOD setLod mounts them.
    this.selection.visible = false;
    this.billboards.visible = false;
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

  /** LOD: windows + identity markers at close zoom; avatar billboards from
   * DISTRICT zoom up (bounded rendering — the plates are the card-identity
   * read at the default framing too, 2026-09-28 user ruling). Alpha resets
   * to 1 so the scene's detail fade restarts cleanly per swap; the fade
   * itself is driven by CityScene (one tween for ALL sprites). */
  setLod(lod: Lod): void {
    this.lodCurrent = lod;
    const close = lod === "close";
    // Pixel-art buildings bake windows/props into the frames — the procedural
    // windows layer only exists for the fallback path.
    this.windows.visible = close && this.pixelKey === null;
    this.identity.visible = close;
    this.windows.alpha = 1;
    this.identity.alpha = 1;
    this.billboards.alpha = 1;
    if (lod !== "world") {
      this.syncBillboards();
    } else {
      this.billboards.visible = false;
    }
  }

  /**
   * Detail-layer alpha for the LOD-swap fade-in (the whole windows container
   * + identity layers — the silhouette never fades, and billboards stay at
   * full alpha: they are already on screen at district zoom, so re-fading
   * them on every close-LOD entry would blink plates that never left).
   * Composes with setFacadeGlow (which owns only the LIT child's alpha).
   * Applied by the scene's single tween.
   */
  setDetailAlpha(alpha: number): void {
    this.windows.alpha = alpha;
    this.identity.alpha = alpha;
  }

  /**
   * Lit-window glow (engine-audit §3.1): 1 at night (full seeded window
   * bloom), ~0.15 at full day (glass sheen — architecture reads by day,
   * lights by night). Alpha-only; insets + micro-props stay constant. The
   * value is remembered so redraws and LOD swaps reapply it.
   */
  setFacadeGlow(glow: number): void {
    this.facadeGlowCurrent = glow;
    this.facadeLit.alpha = glow;
  }

  /**
   * Daylight factor 0..1 (PIXEL-ART day/night, engine upgrade 2026-09-28):
   * the day frame fades over the night frame and the additive lights layer
   * dims to the glass-sheen floor — real art states, not vector tinting.
   * Procedural fallback buildings keep the facade-glow path above.
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    if (this.pixelKey !== null) {
      this.artDay.alpha = daylight;
      this.artLights.alpha = facadeGlowAt(daylight);
    } else {
      this.setFacadeGlow(facadeGlowAt(daylight));
    }
  }

  /**
   * Mount (or fall back from) the generated pixel-art frames for this
   * building's (family, tier, cardId-variant). Called from redraw() and from
   * the scene's texture-ready pass — a sheet that arrives late swaps the
   * procedural layers out in place (same tile, same layers above).
   */
  syncPixelArt(): void {
    const frames = pixelFramesFor(
      this.building.profession,
      this.building.tier,
      this.building.cardId
    );
    if (!frames) {
      // null = disabled/failed, undefined = still loading — either way the
      // procedural layers stay visible until a later ready-pass retries.
      if (this.pixelKey !== null) {
        this.pixelKey = null;
        this.setPixelLayersVisible(false);
        this.setProceduralLayersVisible(true);
      }
      return;
    }
    const key = `${frames.day.source.uid}|${this.building.profession}|${this.building.tier}`;
    if (key !== this.pixelKey) {
      this.pixelKey = key;
      this.mountPixelFrames(frames);
    }
  }

  private mountPixelFrames(frames: PixelArtFrames): void {
    for (const [sprite, tex] of [
      [this.artDay, frames.day],
      [this.artNight, frames.night],
      [this.artLights, frames.lights],
    ] as const) {
      sprite.texture = tex;
      sprite.anchor.set(frames.anchorX / frames.frameW, frames.anchorY / frames.frameH);
      sprite.position.set(0, 0);
      sprite.visible = true;
    }
    this.artDay.alpha = this.daylightCurrent;
    this.artLights.alpha = facadeGlowAt(this.daylightCurrent);
    // The art carries windows + micro-props + family emissives: hide the
    // procedural duplicates (identity sigil, status ring, selection, label
    // and billboards stay — they are state overlays, not art).
    this.setProceduralLayersVisible(false);
  }

  private setProceduralLayersVisible(on: boolean): void {
    this.silhouette.visible = on;
    this.tierExt.visible = on;
    this.emissive.visible = on;
    this.windows.visible = on && this.lodCurrent === "close";
  }

  private setPixelLayersVisible(on: boolean): void {
    this.artDay.visible = on;
    this.artNight.visible = on;
    this.artLights.visible = on;
  }

  /**
   * Viewport culling (Phase D bounded rendering). Culling owns `visible`
   * EXCLUSIVELY: setLod never hides a whole sprite (only the windows/
   * identity/billboard sublayers), so a single `cullHidden` reason cannot
   * fight the LOD system. Re-entering the viewport at close zoom resumes
   * billboard loading (off-screen sprites never start loads).
   */
  setCulled(hidden: boolean): void {
    if (this.cullHidden === hidden) return; // idempotent — no dirty churn
    this.cullHidden = hidden;
    this.visible = !hidden;
    if (!hidden && this.lodCurrent !== "world") this.syncBillboards();
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
    // Skip redundant redraws: the visual depends only on these fields.
    const key = `${this.building.profession ?? ""}|${this.building.tier}|${this.building.protection}`;
    if (key === this.drawnKey) return;
    this.drawnKey = key;
    // Tier changed → chip/leader heights + billboard plates are stale; force
    // a rebuild on the next showLabel / syncBillboards (the scene re-runs
    // both passes after every sync).
    this.labelKey = "";
    this.billboardsKey = "";

    const spec = familyArt(this.building.profession);
    const neon = professionNeon(this.building.profession);
    const tier = this.building.tier;
    const professioned =
      !!this.building.profession && this.building.profession !== UNASSIGNED_FAMILY;

    this.platform.clear();
    drawPlatform(this.platform, neon, professioned);

    this.silhouette.clear();
    this.emissive.clear();
    spec.drawBase(this.silhouette, this.emissive);

    this.tierExt.clear();
    for (let floor = 2; floor <= tier; floor++) {
      spec.drawFloor(this.tierExt, this.emissive, floor);
    }
    drawTierFeatures(this.tierExt, this.emissive, this.building.profession, tier);
    spec.drawRooftop(this.tierExt, this.emissive, tier);

    this.windows.visible = this.lodCurrent === "close";
    this.facadeBase.clear();
    this.facadeLit.clear();
    drawFacadeWindows(this.facadeLit, this.facadeBase, this.building.cardId, tier, this.building.profession);
    this.facadeLit.alpha = this.facadeGlowCurrent;
    // Rooftop clutter joins the same close-LOD layer (hidden at distance).
    this.props.clear();
    drawMicroProps(this.props, this.building.cardId, tier, this.building.profession);

    this.identity.clear();
    drawIdentityMarker(this.identity, this.building.profession, tier);

    this.status.clear();
    drawStatusRing(this.status, this.building.protection);

    const wasSelected = this.selection.visible;
    this.selection.clear();
    drawSelectionBrackets(this.selection, this.building.profession, tier);
    this.selection.visible = wasSelected;

    if (this.lodCurrent !== "world") this.syncBillboards();
    this.syncPixelArt();
  }

  /**
   * Avatar billboard (2026-09-28): ONE avatar plate centered above the
   * rooftop — the card identifies by FACE at district zoom and closer
   * without covering the building shape. (The original four facade-edge
   * plates always showed 2–3 at once in iso and read as clutter — user
   * ruling.) Textures load lazily and dedupe per username (avatars.ts); a
   * failed load is final and simply renders no plate. Only viewport sprites
   * ever start a load (bounded rendering).
   */
  private syncBillboards(): void {
    if (this.cullHidden) return;
    const tex = avatarTexture(this._building.username);
    if (tex === undefined) {
      // Not cached yet: start (or join) the load; the scene's ready-listener
      // re-renders on arrival and this continuation mounts it if the sprite
      // is still on-screen at a plate-bearing LOD.
      void loadAvatarTexture(this._building.username).then((loaded) => {
        if (
          loaded &&
          !this.destroyed &&
          this.lodCurrent !== "world" &&
          !this.cullHidden
        ) {
          this.mountBillboards(loaded);
        }
      });
      return;
    }
    if (tex === null) return; // failed avatar — no billboards for this card
    this.mountBillboards(tex);
  }

  /** Build (or reuse) the single rooftop plate — identity-keyed, tier-scaled. */
  private mountBillboards(tex: Texture): void {
    const key = `${this._building.username}|${this._building.tier}|${this._building.profession ?? ""}`;
    if (key === this.billboardsKey && this.billboards.children.length > 0) {
      this.billboards.visible = true;
      return;
    }
    this.billboardsKey = key;
    for (const child of this.billboards.removeChildren()) child.destroy();

    // Plate size grows mildly with tier (T1 16px → T7 22px): readable at the
    // default district framing, never wide enough to swallow the silhouette.
    const size = 15 + this._building.tier;
    const half = size / 2;
    const neon = professionNeon(this._building.profession);
    // Centered ON TOP of the building (user ruling): floating just above the
    // rooftop art, clear of the tier features beneath it.
    const y = -tierHeight(this._building.tier) - half - 5;

    // OPAQUE plate (2026-09-28 user ruling "make the floor not transparent"):
    // the avatar photo reads as a solid billboard over the scene instead of
    // washing into it.
    const frame = new Graphics();
    frame
      .roundRect(-half - 1.5, y - half - 1.5, size + 3, size + 3, 3)
      .fill({ color: 0x0b1220, alpha: 1 });
    frame
      .roundRect(-half - 1.5, y - half - 1.5, size + 3, size + 3, 3)
      .stroke({ width: 1.5, color: neon, alpha: 1 });
    this.billboards.addChild(frame);
    const plate = new Sprite(tex);
    plate.anchor.set(0.5);
    plate.width = size;
    plate.height = size;
    plate.position.set(0, y);
    this.billboards.addChild(plate);
    this.billboards.visible = true;
  }

  /** Tier label height (FX anchor point). */
  get topY(): number {
    return -tierHeight(this.building.tier);
  }
}

