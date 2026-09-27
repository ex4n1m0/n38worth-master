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
  drawIsoBox,
  professionColor,
  shade,
  COLOR_SELECTION,
} from "./art";
import { TILE_H, TILE_W } from "@/lib/city/scene/iso";

export class HqSprite extends Container {
  private drawnProfession: string | null | undefined;
  private tagText: Text | null = null;
  private drawnTag = "";

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

  private draw(profession: string | null): void {
    const color = professionColor(profession);
    this.removeChildren();

    // Wide pedestal platform (one and a half tiles across).
    const ground = new Graphics();
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .fill({ color: 0x0d1526, alpha: 0.95 });
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .stroke({ width: 2, color, alpha: 0.6 });
    this.addChild(ground);

    // Central spire: three stacked boxes, profession-colored.
    const core = new Graphics();
    drawIsoBox(core, 0, 0, 44, 22, 46, color);
    drawIsoBox(core, 0, -46, 30, 15, 34, shade(color, 1.15));
    drawIsoBox(core, 0, -80, 16, 8, 26, shade(color, 1.3));
    this.addChild(core);

    // Beacon ring at the spire tip.
    const beacon = new Graphics();
    beacon.circle(0, -112, 5).fill({ color: 0xffffff, alpha: 0.95 });
    beacon.circle(0, -112, 9).stroke({ width: 1.5, color, alpha: 0.7 });
    this.addChild(beacon);

    // Two side pylons (server racks) — static placeholder massing.
    const pylons = new Graphics();
    drawIsoBox(pylons, -54, 6, 12, 6, 30, shade(color, 0.8));
    drawIsoBox(pylons, 54, 6, 12, 6, 30, shade(color, 0.8));
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
