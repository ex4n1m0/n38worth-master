/**
 * Mainframe City — the player's HQ "core" (client-only Pixi).
 *
 * The owner's OWN card rendered as the sector-0 centerpiece (RTS plan §D4):
 * value/rank/profession come from the PUBLIC city payload only — the HQ
 * never counts toward ownedCount, portfolio, or family aggregates, is not
 * hireable/sellable/poachable, and is NOT a layout row (fixed position).
 * Profession only picks the fallback beacon color; nothing about the HQ
 * encodes economy state.
 *
 * PROCEDURAL HERO ART (2026-09-29, pixel-sheet retirement): three
 * value-driven stages of a CIVIC TOWER, all vector Graphics — stage 1 the
 * civic form, stage 2 the climbing tower (ring balcony + mast), stage 3 the
 * near-max megaform (stacked setbacks, twin balconies, crown diadem +
 * beacon). Server-derived stage via projection.ts heroStageOf; the client
 * only renders. The scoped ColorMatrix lift below is the hero's authored
 * day state (no scene-wide day matrix exists).
 */

import { ColorMatrixFilter, Container, Graphics, Text } from "pixi.js";
import {
  COLOR_SELECTION,
  drawIsoBox,
  drawPlatform,
  makeTextChip,
  professionMass,
  professionNeon,
  shade,
} from "./art";
import { haloBreathAt } from "@/lib/city/scene/lights";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

/** Art extent (px above the tile) per value stage 1..3 — tag/plate/FX anchor. */
const HQ_STAGE_HEIGHTS = [118, 152, 190] as const;

export class HqSprite extends Container {
  private drawnProfession: string | null | undefined;
  private tagText: Text | null = null;
  private drawnTag = "";
  /** Owner display-name plate above the CORE tag (always visible). */
  private ownerChip: Container | null = null;
  private drawnOwner = "";

  /** Concrete platform pair under the tower (like ordinary buildings). */
  private readonly platformNight = new Graphics();
  private readonly platformDay = new Graphics();
  private stageCurrent = 0;
  private daylightCurrent = 0;
  /** Procedural hero body + its scoped day lift (identity at night). */
  private readonly body = new Container();
  private readonly bodyDay = new ColorMatrixFilter();
  /**
   * Animated hero light (2026-09-29): a halo ring around the tip beacon
   * that breathes on the scene's quantized light clock (static under
   * reduced motion). Lives OUTSIDE `body` so the scoped day lift does not
   * wash it.
   */
  private readonly beaconPulse = new Graphics();
  private tipY = -112;
  /** Selection ring (2026-09-28 "select the core building"). */
  private readonly selRing = new Graphics();

  constructor(profession: string | null, stage = 1) {
    super();
    this.drawnProfession = profession;
    this.stageCurrent = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
    this.body.filters = [this.bodyDay];
    this.addChild(this.platformNight, this.platformDay, this.body, this.beaconPulse);
    // Command ring on the platform — marks the HQ as the camera reset anchor.
    const ring = new Graphics();
    ring.ellipse(0, 0, TILE_W * 0.62, TILE_H * 0.62).stroke({
      width: 1.5,
      color: COLOR_SELECTION,
      alpha: 0.35,
    });
    this.addChild(ring);
    // Selection ring — brighter, slightly larger, only while selected (the
    // tap target for "select the core building").
    this.selRing.ellipse(0, 0, TILE_W * 0.72, TILE_H * 0.72).stroke({
      width: 2.5,
      color: COLOR_SELECTION,
      alpha: 0.95,
    });
    this.selRing.visible = false;
    this.addChild(this.selRing);
    this.draw(profession);
    this.setDaylight(0);
  }

  /** Selection state (own HQ + foreign relay cores). */
  setSelected(selected: boolean): void {
    this.selRing.visible = selected;
  }

  /** New payload (profession may change on the public route). */
  setProfession(profession: string | null): void {
    if (profession === this.drawnProfession) return;
    this.drawnProfession = profession;
    this.draw(profession);
  }

  /** Value-stage swap (server-derived 1..3) — rebuilds the tower body.
   *  draw() resets the tag/plate caches; the shell always re-runs
   *  setTag/setOwnerName after a stage sync (IsoWorld.syncHq). */
  setStage(stage: number): void {
    const s = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
    if (s === this.stageCurrent) return;
    this.stageCurrent = s;
    this.draw(this.drawnProfession ?? null);
  }

  /**
   * Daylight factor 0..1: the day platform crossfades over the night one
   * and the hero body lerps its own scoped lift (no authored frame pair to
   * crossfade — this IS the hero's day state).
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    this.platformDay.alpha = daylight;
    const scale = 1 + (0.68 - 1) * daylight;
    const offset = 0.3 * daylight;
    this.bodyDay.matrix = [
      scale, 0, 0, 0, offset,
      0, scale, 0, 0, offset,
      0, 0, scale, 0, offset,
      0, 0, 0, 1, 0,
    ];
  }

  /** Small "CORE/HQ" tag over the beacon (i18n label, Phase C polish e). */
  setTag(tag: string): void {
    if (tag === this.drawnTag) return;
    this.drawnTag = tag;
    if (this.tagText) {
      this.tagText.destroy();
      this.removeChild(this.tagText);
      this.tagText = null;
    }
    if (!tag) return;
    this.tagText = new Text({
      text: tag,
      style: {
        fontFamily: "Arial, sans-serif",
        fontSize: 11,
        fontWeight: "bold",
        letterSpacing: 2,
        fill: 0x9be8ff,
        stroke: { color: 0x05070d, width: 3 },
      },
    });
    this.tagText.anchor.set(0.5);
    this.tagText.position.set(0, -(this.artExtentPx() + 20));
    this.addChild(this.tagText);
  }

  /**
   * Owner name plate (2026-09-28): the CITY OWNER's display name sits above
   * the CORE tag at EVERY zoom — the home city reads like the satellite
   * clusters, which carry their owner's plate. Locale resolved by the shell.
   */
  setOwnerName(name: string): void {
    if (name === this.drawnOwner && this.ownerChip) return;
    this.drawnOwner = name;
    if (this.ownerChip) {
      this.removeChild(this.ownerChip);
      this.ownerChip.destroy({ children: true });
      this.ownerChip = null;
    }
    if (!name) return;
    const chip = makeTextChip(name, {
      fontSize: 12,
      borderColor: COLOR_SELECTION,
    });
    chip.position.set(0, -(this.artExtentPx() + 46));
    this.addChild(chip);
    this.ownerChip = chip;
  }

  /** Body height above the tile — tag, owner plate and FX anchors hang here. */
  artExtentPx(): number {
    return HQ_STAGE_HEIGHTS[this.stageCurrent - 1] ?? HQ_STAGE_HEIGHTS[0];
  }

  /** One light-clock sample: the tip halo breathes (alpha-only). */
  updateLights(tMs: number): void {
    this.beaconPulse.alpha = haloBreathAt(tMs, 17);
  }

  private draw(profession: string | null): void {
    const neon = professionNeon(profession);
    const mass = professionMass(profession);
    const stage = this.stageCurrent;
    this.body.removeChildren();
    // removeChildren wipes the CORE tag + owner plate with the art — reset
    // their caches so the next setTag/setOwnerName (syncHq always re-runs
    // both after sync) rebuilds them.
    this.tagText = null;
    this.drawnTag = "";
    this.ownerChip = null;
    this.drawnOwner = "";

    this.platformNight.clear();
    drawPlatform(this.platformNight, "night");
    this.platformDay.clear();
    drawPlatform(this.platformDay, "day");
    this.platformDay.alpha = this.daylightCurrent;

    // NORMAL-CITY v2 (2026-09-28): the HQ reads as a civic tower — stone
    // pedestal, concrete massing, warm lit windows — the profession hue only
    // survives in the tiny beacon ring. (Scoped day lift above.)

    // Wide stone pedestal (one and a half tiles across).
    const ground = new Graphics();
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .fill({ color: 0x3d424b, alpha: 0.95 });
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .stroke({ width: 2, color: 0x84806f, alpha: 0.7 });
    this.body.addChild(ground);

    const core = new Graphics();
    const lit = new Graphics();

    if (stage === 1) {
      // Civic tower: three stacked massing boxes.
      drawIsoBox(core, 0, 0, 44, 22, 46, mass);
      drawIsoBox(core, 0, -46, 30, 15, 34, shade(mass, 1.5));
      drawIsoBox(core, 0, -80, 16, 8, 26, shade(mass, 1.9));
      for (let i = 0; i < 5; i++) {
        const y = -10 - i * 16;
        lit.rect(-26, y, 52, 2).fill({ color: 0xffd27a, alpha: 0.8 });
      }
    } else if (stage === 2) {
      // Climbing tower: four setbacks + a ring balcony + mast beacon.
      drawIsoBox(core, 0, 0, 46, 23, 46, mass);
      drawIsoBox(core, 0, -46, 34, 17, 36, shade(mass, 1.4));
      drawIsoBox(core, 0, -82, 22, 11, 28, shade(mass, 1.7));
      drawIsoBox(core, 0, -110, 14, 7, 16, shade(mass, 2.0));
      lit.ellipse(0, -70, 42, 21).stroke({ width: 1.5, color: shade(neon, 1.3), alpha: 0.75 });
      for (let i = 0; i < 7; i++) {
        const y = -10 - i * 15;
        const w = i < 3 ? 28 : i < 5 ? 20 : 12;
        lit.rect(-w, y, w * 2, 2).fill({ color: 0xffd27a, alpha: 0.8 });
      }
      lit.moveTo(0, -126).lineTo(0, -138).stroke({ width: 2, color: shade(neon, 1.2) });
    } else {
      // Near-max megaform: five setbacks, twin balconies, crown diadem +
      // beacon mast — the skyline's civic crown.
      drawIsoBox(core, 0, 0, 48, 24, 46, mass);
      drawIsoBox(core, 0, -46, 36, 18, 38, shade(mass, 1.35));
      drawIsoBox(core, 0, -84, 26, 13, 30, shade(mass, 1.6));
      drawIsoBox(core, 0, -114, 18, 9, 22, shade(mass, 1.85));
      drawIsoBox(core, 0, -136, 12, 6, 14, shade(mass, 2.1));
      lit.ellipse(0, -56, 44, 22).stroke({ width: 1.5, color: shade(neon, 1.3), alpha: 0.7 });
      lit.ellipse(0, -104, 30, 15).stroke({ width: 1.5, color: shade(neon, 1.4), alpha: 0.7 });
      for (let i = 0; i < 8; i++) {
        const y = -10 - i * 15;
        const w = i < 3 ? 30 : i < 5 ? 22 : i < 7 ? 15 : 9;
        lit.rect(-w, y, w * 2, 2).fill({ color: 0xffd27a, alpha: 0.8 });
      }
      // Crown diadem: wide cap + corner pins.
      drawIsoBox(core, 0, -150, 22, 11, 8, shade(mass, 2.2), 1, neon);
      for (const [px, py] of [[-18, 0], [18, 0], [0, -9], [0, 9]] as const) {
        lit.circle(px, -158 + py * 0.4, 1.8).fill({ color: shade(neon, 1.6) });
      }
      lit.ellipse(0, -166, 28, 10).stroke({ width: 1.5, color: shade(neon, 1.5), alpha: 0.8 });
      lit.moveTo(0, -158).lineTo(0, -174).stroke({ width: 2, color: shade(neon, 1.3) });
    }
    this.body.addChild(core);
    this.body.addChild(lit);

    // Beacon at the tower tip — white lamp with a faint profession-hued ring.
    const tipY = stage === 1 ? -112 : stage === 2 ? -141 : -178;
    this.tipY = tipY;
    const beacon = new Graphics();
    beacon.circle(0, tipY, stage === 3 ? 4.5 : 4).fill({ color: 0xffffff, alpha: 0.9 });
    beacon.circle(0, tipY, stage === 3 ? 8 : 7).stroke({ width: 1.5, color: neon, alpha: 0.5 });
    this.body.addChild(beacon);

    // Breathing halo for the animated light clock (drawn OUTSIDE the body's
    // day lift; static alpha until/unless updateLights drives it).
    this.beaconPulse.clear();
    this.beaconPulse
      .circle(0, tipY, stage === 3 ? 13 : 11)
      .stroke({ width: 1.5, color: neon, alpha: 0.6 });
    this.beaconPulse.alpha = 0.35;

    // Side annexes (pylons grow with the stage).
    const pylons = new Graphics();
    const pylonH = stage === 1 ? 30 : stage === 2 ? 40 : 48;
    drawIsoBox(pylons, -54, 6, 12, 6, pylonH, shade(mass, 0.85));
    drawIsoBox(pylons, 54, 6, 12, 6, pylonH, shade(mass, 0.85));
    if (stage >= 2) {
      // Pylon caps light up as the HQ climbs.
      pylons.circle(-54, 6 - pylonH - 3, 1.8).fill({ color: shade(neon, 1.6) });
      pylons.circle(54, 6 - pylonH - 3, 1.8).fill({ color: shade(neon, 1.6) });
    }
    if (stage === 3) {
      // Podium annex pods flank the pedestal at near-max.
      drawIsoBox(pylons, -76, 10, 10, 5, 18, shade(mass, 0.8));
      drawIsoBox(pylons, 76, 10, 10, 5, 18, shade(mass, 0.8));
    }
    this.body.addChild(pylons);
  }
}
