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
 * HERO PIXEL ART (2026-09-28): three value-driven stages mount the
 * generated HQ-s{1..3} sheets (day/night/lights, same contract as ordinary
 * buildings — server-derived stage via projection.ts heroStageOf, the
 * client only renders). The procedural tower below is the fallback (pixel
 * art disabled/failed) and carries its own scoped day-lift filter.
 */

import { ColorMatrixFilter, Container, Graphics, Sprite, Text } from "pixi.js";
import {
  COLOR_SELECTION,
  drawIsoBox,
  drawPlatform,
  makeTextChip,
  professionMass,
  professionNeon,
  shade,
} from "./art";
import { facadeGlowAt } from "@/lib/city/scene/daylight";
import { hqFramesFor, type PixelArtFrames } from "./pixel-art";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

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
  /** Pixel-art day/night/lights frames (hero stages). */
  private readonly artDay = new Sprite();
  private readonly artNight = new Sprite();
  private readonly artLights = new Sprite();
  private pixelKey: string | null = null;
  private stageCurrent = 0;
  private daylightCurrent = 0;
  /**
   * Procedural fallback body + its scoped day lift (identity at night).
   * Hidden entirely while pixel frames are mounted.
   */
  private readonly body = new Container();
  private readonly bodyDay = new ColorMatrixFilter();
  /** Selection ring (2026-09-28 "select the core building"). */
  private readonly selRing = new Graphics();

  constructor(profession: string | null, stage = 1) {
    super();
    this.drawnProfession = profession;
    this.stageCurrent = stage;
    this.body.filters = [this.bodyDay];
    this.addChild(this.platformNight, this.platformDay, this.artDay, this.artNight, this.artLights, this.body);
    this.artLights.blendMode = "add";
    this.artDay.visible = false;
    this.artNight.visible = false;
    this.artLights.visible = false;
    // Command ring on the platform — marks the HQ as the camera reset anchor
    // (outside `body` so it survives the pixel-art swap).
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
    this.syncPixelArt();
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

  /** Value-stage swap (server-derived 1..3) — remounts the pixel frames. */
  setStage(stage: number): void {
    const s = stage >= 3 ? 3 : stage <= 1 ? 1 : 2;
    if (s === this.stageCurrent) return;
    this.stageCurrent = s;
    this.syncPixelArt();
  }

  /**
   * Daylight factor 0..1 (authored frames, mirrors BuildingSprite): day
   * frame crossfades over night, additive lights dim to the glass sheen.
   * The fallback body lerps its own scoped lift instead.
   */
  setDaylight(daylight: number): void {
    this.daylightCurrent = daylight;
    this.platformDay.alpha = daylight;
    if (this.pixelKey !== null) {
      this.artDay.alpha = daylight;
      this.artLights.alpha = facadeGlowAt(daylight);
    } else {
      const scale = 1 + (0.68 - 1) * daylight;
      const offset = 0.3 * daylight;
      this.bodyDay.matrix = [
        scale, 0, 0, 0, offset,
        0, scale, 0, 0, offset,
        0, 0, scale, 0, offset,
        0, 0, 0, 1, 0,
      ];
    }
  }

  /** Mount (or fall back from) the generated hero frames for the stage. */
  syncPixelArt(): void {
    const frames = hqFramesFor(this.stageCurrent);
    if (!frames) {
      if (this.pixelKey !== null) {
        this.pixelKey = null;
        this.artDay.visible = false;
        this.artNight.visible = false;
        this.artLights.visible = false;
        this.body.visible = true;
        this.setDaylight(this.daylightCurrent);
      }
      return;
    }
    const key = `${frames.day.source.uid}|${this.stageCurrent}`;
    if (key === this.pixelKey) return;
    this.pixelKey = key;
    this.mountFrames(frames);
  }

  private mountFrames(frames: PixelArtFrames): void {
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
    this.body.visible = false;
    // Stage art changes the body height — rehang the tag/plate on it.
    if (this.tagText) this.tagText.position.set(0, -(this.artExtentPx() + 20));
    if (this.ownerChip) this.ownerChip.position.set(0, -(this.artExtentPx() + 46));
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

  /** Body height above the tile (pixel stage art or fallback tower) — tag,
   *  owner plate and FX anchors hang off this. */
  artExtentPx(): number {
    if (this.pixelKey !== null) {
      const frames = hqFramesFor(this.stageCurrent);
      if (frames) return frames.artHeight;
    }
    return 118;
  }

  private draw(profession: string | null): void {
    const neon = professionNeon(profession);
    const mass = professionMass(profession);
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

    // NORMAL-CITY v2 (2026-09-28): the fallback HQ reads as a civic tower —
    // stone pedestal, concrete massing, warm lit windows — the profession
    // hue only survives in the tiny beacon ring. (Scoped day lift above.)

    // Wide stone pedestal (one and a half tiles across).
    const ground = new Graphics();
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .fill({ color: 0x3d424b, alpha: 0.95 });
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .stroke({ width: 2, color: 0x84806f, alpha: 0.7 });
    this.body.addChild(ground);

    // Central tower: three stacked massing boxes.
    const core = new Graphics();
    drawIsoBox(core, 0, 0, 44, 22, 46, mass);
    drawIsoBox(core, 0, -46, 30, 15, 34, shade(mass, 1.5));
    drawIsoBox(core, 0, -80, 16, 8, 26, shade(mass, 1.9));
    this.body.addChild(core);

    // Warm lit window rows (the tower at night).
    const lit = new Graphics();
    for (let i = 0; i < 5; i++) {
      const y = -10 - i * 16;
      lit.rect(-26, y, 52, 2).fill({ color: 0xffd27a, alpha: 0.8 });
    }
    this.body.addChild(lit);

    // Beacon at the tower tip — white lamp with a faint profession-hued ring.
    const beacon = new Graphics();
    beacon.circle(0, -112, 4).fill({ color: 0xffffff, alpha: 0.9 });
    beacon.circle(0, -112, 7).stroke({ width: 1.5, color: neon, alpha: 0.5 });
    this.body.addChild(beacon);

    // Two side annexes.
    const pylons = new Graphics();
    drawIsoBox(pylons, -54, 6, 12, 6, 30, shade(mass, 0.85));
    drawIsoBox(pylons, 54, 6, 12, 6, 30, shade(mass, 0.85));
    this.body.addChild(pylons);

    this.body.visible = this.pixelKey === null;
  }
}
