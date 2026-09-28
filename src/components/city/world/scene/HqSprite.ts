/**
 * Mainframe City — the player's HQ "core" (client-only Pixi).
 *
 * The owner's OWN card rendered as the sector-0 centerpiece (RTS plan §D4):
 * value/rank/profession come from the PUBLIC city payload only — the HQ
 * never counts toward ownedCount, portfolio, or family aggregates, is not
 * hireable/sellable/poachable, and is NOT a layout row (fixed position).
 * Profession only picks the beacon color; nothing about the HQ encodes
 * economy state.
 */

import { Container, Graphics, Text } from "pixi.js";
import {
  COLOR_SELECTION,
  drawIsoBox,
  makeTextChip,
  professionMass,
  professionNeon,
  shade,
} from "./art";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

export class HqSprite extends Container {
  private drawnProfession: string | null | undefined;
  private tagText: Text | null = null;
  private drawnTag = "";
  /** Owner display-name plate above the CORE tag (always visible). */
  private ownerChip: Container | null = null;
  private drawnOwner = "";

  constructor(profession: string | null) {
    super();
    this.drawnProfession = profession;
    this.draw(profession);
  }

  /** New payload (profession may change on the public route). */
  setProfession(profession: string | null): void {
    if (profession === this.drawnProfession) return;
    this.drawnProfession = profession;
    this.draw(profession);
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
    this.tagText.position.set(0, -128);
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
    chip.position.set(0, -154);
    this.addChild(chip);
    this.ownerChip = chip;
  }

  private draw(profession: string | null): void {
    const neon = professionNeon(profession);
    const mass = professionMass(profession);
    this.removeChildren();
    // removeChildren wipes the CORE tag + owner plate with the art — reset
    // their caches so the next setTag/setOwnerName (syncHq always re-runs
    // both after sync) rebuilds them.
    this.tagText = null;
    this.drawnTag = "";
    this.ownerChip = null;
    this.drawnOwner = "";

    // NORMAL-CITY v2 (2026-09-28): the HQ reads as a civic tower — stone
    // pedestal, concrete massing, warm lit windows — the profession hue only
    // survives in the tiny beacon ring. (Daylight comes from the hqLayer's
    // soft lerp filter; this palette is the night base.)

    // Wide stone pedestal (one and a half tiles across).
    const ground = new Graphics();
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .fill({ color: 0x3d424b, alpha: 0.95 });
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .stroke({ width: 2, color: 0x84806f, alpha: 0.7 });
    this.addChild(ground);

    // Central tower: three stacked massing boxes.
    const core = new Graphics();
    drawIsoBox(core, 0, 0, 44, 22, 46, mass);
    drawIsoBox(core, 0, -46, 30, 15, 34, shade(mass, 1.5));
    drawIsoBox(core, 0, -80, 16, 8, 26, shade(mass, 1.9));
    this.addChild(core);

    // Warm lit window rows (the tower at night — feeds the bloom softly).
    const lit = new Graphics();
    for (let i = 0; i < 5; i++) {
      const y = -10 - i * 16;
      lit.rect(-26, y, 52, 2).fill({ color: 0xffd27a, alpha: 0.8 });
    }
    this.addChild(lit);

    // Beacon at the tower tip — white lamp with a faint profession-hued ring.
    const beacon = new Graphics();
    beacon.circle(0, -112, 4).fill({ color: 0xffffff, alpha: 0.9 });
    beacon.circle(0, -112, 7).stroke({ width: 1.5, color: neon, alpha: 0.5 });
    this.addChild(beacon);

    // Two side annexes.
    const pylons = new Graphics();
    drawIsoBox(pylons, -54, 6, 12, 6, 30, shade(mass, 0.85));
    drawIsoBox(pylons, 54, 6, 12, 6, 30, shade(mass, 0.85));
    this.addChild(pylons);

    // Command ring on the platform — marks the HQ as the camera reset anchor.
    const ring = new Graphics();
    ring.ellipse(0, 0, TILE_W * 0.62, TILE_H * 0.62).stroke({
      width: 1.5,
      color: COLOR_SELECTION,
      alpha: 0.35,
    });
    this.addChild(ring);
  }
}
