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
  professionMass,
  professionNeon,
  shade,
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
    const neon = professionNeon(profession);
    const mass = professionMass(profession);
    this.removeChildren();

    // Wide pedestal platform (one and a half tiles across) — wet slab.
    const ground = new Graphics();
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .fill({ color: 0x0a0e1a, alpha: 0.95 });
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .fill({ color: neon, alpha: 0.08 });
    ground
      .poly([0, -TILE_H * 0.75, TILE_W * 0.75, 0, 0, TILE_H * 0.75, -TILE_W * 0.75, 0])
      .stroke({ width: 2, color: neon, alpha: 0.7 });
    this.addChild(ground);

    // Central spire: three stacked massing boxes, neon-rimmed.
    const core = new Graphics();
    drawIsoBox(core, 0, 0, 44, 22, 46, mass, 1, neon);
    drawIsoBox(core, 0, -46, 30, 15, 34, shade(mass, 1.5), 1, neon);
    drawIsoBox(core, 0, -80, 16, 8, 26, shade(mass, 1.9), 1, neon);
    this.addChild(core);

    // Emissive strip rows on the spire (bloom feed, the HQ's lit windows).
    const lit = new Graphics();
    for (let i = 0; i < 5; i++) {
      const y = -10 - i * 16;
      lit.rect(-26, y, 52, 2).fill({ color: shade(neon, 1.4), alpha: 0.75 });
    }
    this.addChild(lit);

    // Beacon ring at the spire tip.
    const beacon = new Graphics();
    beacon.circle(0, -112, 5).fill({ color: 0xffffff, alpha: 0.95 });
    beacon.circle(0, -112, 9).stroke({ width: 1.5, color: neon, alpha: 0.8 });
    this.addChild(beacon);

    // Two side pylons (server racks) — dark massing.
    const pylons = new Graphics();
    drawIsoBox(pylons, -54, 6, 12, 6, 30, shade(mass, 0.85), 1, neon);
    drawIsoBox(pylons, 54, 6, 12, 6, 30, shade(mass, 0.85), 1, neon);
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
