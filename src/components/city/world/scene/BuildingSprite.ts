/**
 * Mainframe City — one building sprite (client-only Pixi).
 *
 * Strictly a RENDERER: tier, protection, and identity all arrive from the
 * server projection and are only DRAWN here — no economy math, no local
 * recomputation (AGENTS.md §"Mainframe City building layer").
 *
 * Layers (each a child display object so LOD toggling and FX stay cheap):
 *   1 platform      concrete slab day/night pair (crossfaded by daylight)
 *   2 silhouette    family architecture: civic stack (T1–7) or the bespoke
 *                  grand megaform (T8–14, art.ts drawGrand)
 *   3 tierExt       civic modular floors + shared tier features (T1–7 only)
 *   4 emissive      family lights (coils, beacons, LED strips, glow bands)
 *                  + the warm lobby entrance glow (all LODs)
 *   5 lights        ANIMATED geometry (beacons/halo/rise/edge pulse) driven
 *                  alpha/position-only by the scene's light clock
 *   6 windows       lit-window channels A/B at EVERY LOD (the building's
 *                  light identity — 2026-09-29 "felt basic" fix) + the
 *                  close-LOD texture layer (dark insets, mullions, props)
 *   7 identity      profession sigil (close LOD only)
 *   8 status        firewall cyan ring / hard-lock amber (DOM-tile colors)
 *   9 selection     corner brackets + emissive body edge
 *  10 label         floating name chip while selected (Phase C polish c)
 *  11 fx            slot owned by FxLayer one-shots
 *
 * Family + tier art comes exclusively from CITY_ART_MANIFEST via familyArt()
 * (art.ts) — the ONE art system since the 2026-09-29 pixel-sheet retirement.
 *
 * The sprite's origin (0,0) is the TILE CENTER; the body extends upward
 * (negative y). Depth = zIndex set by IsoWorld from the global (x+y)
 * (painter's order — no fog tint since the 2026-09-28 bloom/gloom removal).
 */

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { CityBuilding } from "@/lib/city/types";
import type { BuildingTier } from "@/lib/city/types";
import type { Lod } from "@/lib/city/scene/lod";
import { facadeGlowAt } from "@/lib/city/scene/daylight";
import {
  beaconStrobeAt,
  edgePulseAt,
  haloBreathAt,
  spireRiseAt,
  windowFlickerAt,
} from "@/lib/city/scene/lights";
import { avatarTexture, loadAvatarTexture } from "./avatars";
import {
  COLOR_SELECTION,
  drawEntranceGlow,
  drawFacadeWindows,
  drawIdentityMarker,
  drawMicroProps,
  drawPlatform,
  drawSelectionBrackets,
  drawStatusRing,
  drawTierFeatures,
  familyArt,
  familyTopHeight,
  GRAND_MIN_TIER,
  PLATFORM_HALF_H,
  PLATFORM_HALF_W,
  professionNeon,
  shade,
} from "./art";

export class BuildingSprite extends Container {
  private _building: CityBuilding;

  private readonly platformNight: Graphics = new Graphics();
  /** Day concrete slab — crossfaded over the night one by daylight. */
  private readonly platformDay: Graphics = new Graphics();
  private daylightCurrent = 0;
  private readonly silhouette: Graphics = new Graphics();
  private readonly tierExt: Graphics = new Graphics();
  /** Family emissives (coils/beacons/strips) — always visible, bloom feed. */
  private readonly emissive: Graphics = new Graphics();
  /**
   * ANIMATED LIGHTS (2026-09-29): prebuilt geometry whose ALPHA/POSITION the
   * scene's quantized light clock drives (see lib/city/scene/lights.ts) —
   * a strobing rooftop beacon (seeded red/white) with a second micro-beacon
   * on high tiers, a breathing halo ring, the (grand league) ascending
   * crown dot and the (civic tier 2+) descending edge data-pulse. Never
   * redrawn per frame; reduced motion simply leaves the static alphas.
   */
  private readonly beaconGlow = new Graphics();
  private readonly beaconCore = new Graphics();
  private readonly beaconTwo = new Graphics();
  private readonly haloPulse = new Graphics();
  private readonly riseDot = new Graphics();
  private readonly edgeDot = new Graphics();
  /** Cached anchors for the light layer (rebuilt with the art). */
  private lightsH = 0;
  private lightsGrand = false;
  /** Civic edge pulse enabled (tier 2+ non-grand) + its fixed edge x. */
  private edgePulseOn = false;
  private edgeX = 0;
  /**
   * Windows container — ALWAYS visible (the lit mosaic is the building's
   * light identity at every LOD, 2026-09-29 "felt basic and static" fix).
   * `facadeDetail` (dark insets, mullions, rooftop props) is close-LOD; the
   * lit channels A/B dim toward the glass-sheen floor by daylight
   * (setFacadeGlow) and churn out of phase on the light clock
   * (windowFlickerAt) — occupancy changes without a single redraw.
   */
  private readonly windows = new Container();
  private readonly facadeBase = new Graphics();
  private readonly facadeLitA = new Graphics();
  private readonly facadeLitB = new Graphics();
  private readonly props = new Graphics();
  /** Current lit-channel multipliers (last light-clock sample). */
  private flickerA = 1;
  private flickerB = 1;
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
    this.windows.addChild(
      this.facadeBase,
      this.facadeLitA,
      this.facadeLitB,
      this.props
    );
    this.addChild(
      this.platformNight,
      this.platformDay,
      this.silhouette,
      this.tierExt,
      this.emissive,
      this.beaconGlow,
      this.beaconCore,
      this.beaconTwo,
      this.haloPulse,
      this.riseDot,
      this.edgeDot,
      this.windows,
      this.billboards,
      this.identity,
      this.status,
      this.selection,
      this.fxSlot
    );
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
    const top = -this.bodyTopHeight();
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

  /** LOD: the lit-window mosaic stays visible at EVERY zoom (it is the
   * building's light identity — hiding it at the default district framing
   * is what made the city read "basic and static", 2026-09-29); dark
   * insets/mullions + rooftop clutter are close-LOD texture; avatar
   * billboards mount from DISTRICT zoom up (bounded rendering — the plates
   * are the card-identity read at the default framing too). Alpha resets
   * to 1 so the scene's detail fade restarts cleanly per swap; the fade
   * itself is driven by CityScene (one tween for ALL sprites). */
  setLod(lod: Lod): void {
    this.lodCurrent = lod;
    const close = lod === "close";
    this.windows.visible = true;
    this.facadeBase.visible = close;
    this.props.visible = close;
    this.identity.visible = close;
    this.facadeBase.alpha = 1;
    this.props.alpha = 1;
    this.identity.alpha = 1;
    this.billboards.alpha = 1;
    if (lod !== "world") {
      this.syncBillboards();
    } else {
      this.billboards.visible = false;
    }
  }

  /**
   * Detail-layer alpha for the LOD-swap fade-in (the close-LOD texture
   * layers — dark insets/mullions, rooftop props and the identity sigil;
   * the silhouette and the lit windows never fade, and billboards stay at
   * full alpha: they are already on screen at district zoom, so re-fading
   * them on every close-LOD entry would blink plates that never left).
   * Composes with setFacadeGlow (which owns the LIT channels' alphas).
   * Applied by the scene's single tween.
   */
  setDetailAlpha(alpha: number): void {
    this.facadeBase.alpha = alpha;
    this.props.alpha = alpha;
    this.identity.alpha = alpha;
  }

  /**
   * Lit-window glow (engine-audit §3.1): 1 at night (full seeded window
   * bloom), ~0.15 at full day (glass sheen — architecture reads by day,
   * lights by night). Alpha-only, composed with the flicker channels;
   * insets + micro-props stay constant. The value is remembered so
   * redraws and light-clock samples reapply it.
   */
  setFacadeGlow(glow: number): void {
    this.facadeGlowCurrent = glow;
    this.applyLitAlphas();
  }

  /** Compose daylight glow × per-channel flicker onto the lit channels. */
  private applyLitAlphas(): void {
    this.facadeLitA.alpha = this.facadeGlowCurrent * this.flickerA;
    this.facadeLitB.alpha = this.facadeGlowCurrent * this.flickerB;
  }

  /**
   * Daylight factor 0..1: the day platform crossfades over the night one
   * and the lit windows dim to the glass-sheen floor — the body masses are
   * authored mid-tone and stay constant (no scene-wide day matrix).
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    this.platformDay.alpha = daylight;
    this.setFacadeGlow(facadeGlowAt(daylight));
  }

  /**
   * Build the animated-light geometry for the CURRENT art (called from
   * redraw). Static pleasant alphas — the scene's light clock then drives
   * them via updateLights; under reduced motion these values simply stay.
   */
  private buildLights(tier: BuildingTier): void {
    const spec = familyArt(this.building.profession);
    const neon = spec.color;
    const grand = tier >= GRAND_MIN_TIER;
    const H = familyTopHeight(this.building.profession, tier);
    this.lightsH = H;
    this.lightsGrand = grand;

    // Rooftop beacon: one card in three flies the RED aircraft-warning
    // lamp instead of white — the strobing skyline reads varied, not
    // uniform (2026-09-29 detail pass).
    const by = -H - 5;
    const r = grand ? 2.4 : 1.8;
    const red = this.building.cardId % 3 === 0;
    this.beaconCore.clear();
    this.beaconCore.circle(0, by, r).fill({ color: red ? 0xff5a5a : 0xffffff, alpha: 0.95 });
    this.beaconCore.alpha = 0.9;
    this.beaconGlow.clear();
    this.beaconGlow.circle(0, by, r * 3.2).fill({ color: red ? 0xff5a5a : neon, alpha: 0.4 });
    this.beaconGlow.alpha = 0.45;

    // Second micro-beacon (tier 6+): an offset lamp on its own strobe phase.
    this.beaconTwo.clear();
    if (tier >= 6) {
      this.beaconTwo.circle(7, by + 2, 1.3).fill({ color: 0xffffff, alpha: 0.95 });
    }
    this.beaconTwo.alpha = 0.8;

    // Breathing halo: tiers 5+ civic (where the static halo lives) and all
    // grand megaforms — one ring breathing at the upper third.
    this.haloPulse.clear();
    if (tier >= 5) {
      const ry = -H * (grand ? 0.62 : 0.55);
      this.haloPulse
        .ellipse(0, ry, PLATFORM_HALF_W * 0.85, PLATFORM_HALF_H * 0.85)
        .stroke({ width: 1.5, color: spec.color, alpha: 0.6 });
    }
    this.haloPulse.alpha = 0.35;

    // Grand league: the ascending energy dot (position animated).
    this.riseDot.clear();
    if (grand) {
      this.riseDot.circle(0, 0, 2).fill({ color: 0xffffff, alpha: 0.9 });
      this.riseDot.circle(0, 0, 4).stroke({ width: 1, color: spec.color, alpha: 0.7 });
      this.riseDot.y = -H * 0.72;
      this.riseDot.alpha = 0.6;
    }

    // Civic edge data-pulse (tier 2+): a light dot descending the tower's
    // right edge — the ordinary buildings' counterpart to the grand ascent,
    // so even modest towers carry motion.
    this.edgeDot.clear();
    this.edgePulseOn = !grand && tier >= 2;
    if (this.edgePulseOn) {
      this.edgeX = PLATFORM_HALF_W * 0.52;
      this.edgeDot.circle(0, 0, 1.7).fill({ color: shade(neon, 1.5), alpha: 0.9 });
      this.edgeDot.y = -H * 0.8;
      this.edgeDot.alpha = 0.2;
    }
  }

  /**
   * One light-clock sample (see lib/city/scene/lights.ts): alpha/position
   * only, no redraws. Phases derive from the cardId so the skyline
   * strobes desynchronized.
   */
  updateLights(tMs: number): void {
    if (this.cullHidden) return;
    const seed = this._building.cardId;
    const strobe = beaconStrobeAt(tMs, seed);
    this.beaconCore.alpha = strobe;
    this.beaconGlow.alpha = strobe * 0.45;
    this.beaconTwo.alpha = beaconStrobeAt(tMs, seed + 7) * 0.8;
    this.haloPulse.alpha = haloBreathAt(tMs, seed);
    if (this.lightsGrand) {
      const { progress, alpha } = spireRiseAt(tMs, seed);
      this.riseDot.y = -this.lightsH * (0.72 + 0.26 * progress);
      this.riseDot.alpha = alpha;
    }
    if (this.edgePulseOn) {
      const { progress, alpha } = edgePulseAt(tMs, seed);
      this.edgeDot.y = -6 - this.lightsH * 0.86 * (1 - progress);
      this.edgeDot.alpha = alpha;
    }
    // Window-occupancy churn: dim the two lit channels on their drifting
    // phases — a share of the lit panes goes dark and returns, forever.
    const fa = windowFlickerAt(tMs, seed, 0);
    const fb = windowFlickerAt(tMs, seed, 1);
    if (fa !== this.flickerA || fb !== this.flickerB) {
      this.flickerA = fa;
      this.flickerB = fb;
      this.applyLitAlphas();
    }
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
    const tier = this.building.tier;

    this.platformNight.clear();
    drawPlatform(this.platformNight, "night");
    this.platformDay.clear();
    drawPlatform(this.platformDay, "day");
    this.platformDay.alpha = this.daylightCurrent;

    if (tier >= GRAND_MIN_TIER) {
      // GRAND league — the family's bespoke megaform IS the art.
      this.silhouette.clear();
      this.emissive.clear();
      spec.drawGrand(this.silhouette, this.emissive, tier - GRAND_MIN_TIER, this.building.cardId);
    } else {
      // CIVIC league — modular family stack + shared tier features.
      this.silhouette.clear();
      this.emissive.clear();
      spec.drawBase(this.silhouette, this.emissive);

      this.tierExt.clear();
      for (let floor = 2; floor <= tier; floor++) {
        spec.drawFloor(this.tierExt, this.emissive, floor);
      }
      drawTierFeatures(this.tierExt, this.emissive, this.building.profession, tier);
      spec.drawRooftop(this.tierExt, this.emissive, tier);
    }
    // Warm lobby entrance on the base (all LODs — detail pass 2026-09-29).
    drawEntranceGlow(this.emissive, this.building.profession);

    // Windows: the lit channels ride at EVERY LOD; the close-LOD texture
    // (dark insets + mullions) and rooftop clutter toggle with the LOD.
    this.windows.visible = true;
    this.facadeBase.visible = this.lodCurrent === "close";
    this.props.visible = this.lodCurrent === "close";
    this.facadeBase.clear();
    this.facadeLitA.clear();
    this.facadeLitB.clear();
    drawFacadeWindows(
      this.facadeLitA,
      this.facadeLitB,
      this.facadeBase,
      this.building.cardId,
      tier,
      this.building.profession
    );
    this.applyLitAlphas();
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

    this.buildLights(tier);
    if (this.lodCurrent !== "world") this.syncBillboards();
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
    const y = -this.bodyTopHeight() - half - 5;

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

  /** Real body top — the family's architecture at its CURRENT tier. */
  private bodyTopHeight(): number {
    return familyTopHeight(this._building.profession, this._building.tier);
  }

  /** Tier label height (FX anchor point). */
  get topY(): number {
    return -this.bodyTopHeight();
  }
}

