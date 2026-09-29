"use client";

/**
 * Buildings Catalog — production art catalog (2026-09-28, user request: add
 * the buildings collection to the profile menu as "Buildings Catalog";
 * 2026-09-29: 14 levels, ONE procedural art system).
 *
 * Renders the REAL in-game sprites so the catalog always matches the city:
 * 7 families × 14 tiers in TWO grids — the civic architecture league at
 * T1–T7 and the grand spectacular league at T8–14 (each family's bespoke
 * procedural megaform) — plus the three protection states, the HQ core's
 * three value stages and the Six goddess monuments (procedural stage
 * elaborations, + the unowned ghost). All strings arrive PRE-RESOLVED via
 * props (LanguageContext lives in React land — the Pixi code never imports
 * i18n; same contract as CitySceneStrings).
 *
 * Day/night is the same authored-state system the city uses: platform and
 * terrain day/night pairs crossfade, lit windows dim to the glass sheen
 * (BuildingSprite.setDaylight) and the hero bodies (HQ/landmarks) carry
 * their scoped ColorMatrix lifts. Render-on-demand (ticker stopped;
 * re-renders on build and toggles only).
 */

import { useEffect, useRef } from "react";
import { Application, Container, Text } from "pixi.js";
import { BuildingSprite } from "@/components/city/world/scene/BuildingSprite";
import { HqSprite } from "@/components/city/world/scene/HqSprite";
import { LandmarkSprite } from "@/components/city/world/scene/landmarks";
import { professionNeon } from "@/components/city/world/scene/art";
import { LANDMARK_COLORS } from "@/lib/city/landmark-colors";
import type { CityBuilding, BuildingTier } from "@/lib/city/types";

/** Pre-resolved, locale-aware labels (built by the page via useLanguage). */
export interface CatalogStrings {
  sectionFamiliesCivic: string;
  sectionFamiliesGrand: string;
  sectionProtection: string;
  sectionHq: string;
  sectionLandmarks: string;
  /** 7 row labels: professions in roster order + unassigned last. */
  familyNames: string[];
  /** DB profession per row (null = unassigned) — drives the neon accent. */
  familyProfessions: Array<string | null>;
  protectionLabels: [string, string, string];
  /** HQ value-stage captions (stage 1..3). */
  hqStageLabels: string[];
  /** Monument value-stage captions (stage 1..3). */
  stageLabels: string[];
  landmarkNames: string[];
  unownedLabel: string;
}

const LEFT = 170;
const COL_W = 150;
/** Civic rows: T7 bodies reach ~134px above the platform. */
const ROW_H_CIVIC = 182;
/** Grand rows: T14 bodies reach ~234px (Server Marshal megaform). */
const ROW_H_GRAND = 268;
/** HQ stage 3 reaches 190px; monuments scale to ~278px at stage 3. */
const HQ_SECTION_H = 320;
const LANDMARK_ROW_H = 340;
/** 14 progression levels, two leagues of ONE art system: civic (T1–T7)
 *  then the grand spectacular megaforms (T8–T14) — one 7-column grid each. */
const TIER_TAGS_CIVIC = ["T1 · 1×", "T2 · 2×", "T3 · 4×", "T4 · 8×", "T5 · 16×", "T6 · 32×", "T7 · 64×"];
const TIER_TAGS_GRAND = ["T8 · 128×", "T9 · 256×", "T10 · 512×", "T11 · 1024×", "T12 · 2048×", "T13 · 4096×", "T14 · 8192×+"];

/** Canvas backdrop: soft day-sky blue vs the scene's night navy. */
const BG_DAY = 0x8fb4d6;
const BG_NIGHT = 0x0a0e1a;

/** Text roles → day/night fills (light text washes out on the day sky). */
type Role = "section" | "sub" | "family" | "name" | "muted";
const ROLE_FILLS: Record<Role, { day: number; night: number }> = {
  section: { day: 0x1e293b, night: 0xe2e8f0 },
  sub: { day: 0x475569, night: 0x94a3b8 },
  family: { day: 0x334155, night: 0x94a3b8 },
  name: { day: 0x1e293b, night: 0xe2e8f0 },
  muted: { day: 0x64748b, night: 0x64748b },
};

function fakeBuilding(
  cardId: number,
  profession: string | null,
  tier: BuildingTier,
  protection: CityBuilding["protection"] = null
): CityBuilding {
  return {
    cardId,
    username: "catalog",
    profession,
    isNpc: 1,
    tier,
    value: 1000 * 2 ** (tier - 1),
    protection,
  };
}

interface LabelEntry {
  text: Text;
  role: Role;
  nightFill?: number;
}

export default function BuildingsCatalogMount({
  strings,
  daylight,
}: {
  strings: CatalogStrings;
  daylight: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Current daylight for (re)builds — updated only inside effects. */
  const daylightRef = useRef(daylight);
  /** Built by the mount effect; the toggle effect re-applies through it. */
  const applyRef = useRef<((v: number) => void) | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let app: Application | null = null;
    const labels: LabelEntry[] = [];
    const buildingSprites: BuildingSprite[] = [];
    const hqSprites: HqSprite[] = [];
    const landmarkSprites: LandmarkSprite[] = [];

    const label = (
      text: string,
      x: number,
      y: number,
      role: Role,
      anchor = 0,
      nightFill?: number
    ): Text => {
      const t = new Text({
        text,
        style: {
          fontFamily: "Arial, sans-serif",
          fontSize: role === "section" ? 14 : 12,
          fontWeight: "bold",
          letterSpacing: 0.4,
          fill: 0xe2e8f0,
        },
      });
      t.anchor.set(anchor, 0.5);
      t.position.set(x, y);
      labels.push({ text: t, role, nightFill });
      return t;
    };

    /** Apply a daylight factor to everything already built + render once.
     *  Platforms/terrain crossfade their authored pairs; hero bodies lerp
     *  their scoped lifts inside the sprites. */
    const applyDaylight = (v: number) => {
      for (const s of buildingSprites) s.setDaylight(v);
      for (const h of hqSprites) h.setDaylight(v);
      for (const m of landmarkSprites) m.setDaylight(v);
      const day = v >= 0.5;
      if (app) app.renderer.background.color = day ? BG_DAY : BG_NIGHT;
      for (const { text, role, nightFill } of labels) {
        text.style.fill = day ? ROLE_FILLS[role].day : (nightFill ?? ROLE_FILLS[role].night);
      }
      app?.render();
    };

    (async () => {
      const s = strings;
      const W = LEFT + 7 * COL_W + 20;

      // Section vertical layout (measured before the canvas is sized).
      let y = 96; // header + tier column labels
      const civicTop = y;
      y += s.familyNames.length * ROW_H_CIVIC + 26;
      const grandTop = y + 56; // section header + tier labels again
      y = grandTop + s.familyNames.length * ROW_H_GRAND + 30;
      const protTop = y;
      y += 200;
      const hqTop = y;
      y += HQ_SECTION_H;
      const landmarkTop = y;
      y += 6 * LANDMARK_ROW_H + 30;
      const H = y;

      const application = new Application();
      await application.init({
        background: BG_NIGHT,
        antialias: true,
        resolution: 2,
        autoDensity: true,
        width: W,
        height: H,
        preference: "webgl",
      });
      if (cancelled) {
        application.destroy(true);
        return;
      }
      app = application;
      applyRef.current = applyDaylight;
      application.canvas.setAttribute("aria-hidden", "true");
      // Responsive: full width up to the logical size.
      application.canvas.style.width = "100%";
      application.canvas.style.maxWidth = `${W}px`;
      application.canvas.style.height = "auto";
      application.canvas.style.display = "block";
      application.canvas.style.margin = "0 auto";
      host.appendChild(application.canvas);

      // Render-on-demand (same policy as the city scene).
      application.ticker.stop();

      const root = new Container();
      application.stage.addChild(root);

      const colX = (col: number) => LEFT + col * COL_W + COL_W / 2;

      // ── Sections A1/A2: families × tiers — civic (T1–T7) and grand
      //     (T8–T14), the two leagues of the procedural system ──────────
      root.addChild(label(s.sectionFamiliesCivic, 20, 26, "section"));
      TIER_TAGS_CIVIC.forEach((tag, col) => {
        root.addChild(label(tag, colX(col), 66, "sub", 0.5));
      });
      s.familyNames.forEach((name, row) => {
        const baseY = civicTop + row * ROW_H_CIVIC + 110;
        const profession = s.familyProfessions[row] ?? null;
        root.addChild(label(name, LEFT - 24, baseY - 55, "family", 1, professionNeon(profession)));
        for (let tier = 1 as const; tier <= 7; tier++) {
          const sprite = new BuildingSprite(
            fakeBuilding(100 + row * 9 + tier * 3, profession, tier as BuildingTier)
          );
          sprite.setLod("close");
          sprite.position.set(colX(tier - 1), baseY);
          root.addChild(sprite);
          buildingSprites.push(sprite);
        }
      });

      root.addChild(label(s.sectionFamiliesGrand, 20, grandTop - 56, "section"));
      TIER_TAGS_GRAND.forEach((tag, col) => {
        root.addChild(label(tag, colX(col), grandTop - 16, "sub", 0.5));
      });
      s.familyNames.forEach((name, row) => {
        const baseY = grandTop + row * ROW_H_GRAND + 140;
        const profession = s.familyProfessions[row] ?? null;
        root.addChild(label(name, LEFT - 24, baseY - 60, "family", 1, professionNeon(profession)));
        for (let tier = 8 as const; tier <= 14; tier++) {
          const sprite = new BuildingSprite(
            fakeBuilding(200 + row * 9 + tier * 3, profession, tier as BuildingTier)
          );
          sprite.setLod("close");
          sprite.position.set(colX(tier - 8), baseY);
          root.addChild(sprite);
          buildingSprites.push(sprite);
        }
      });

      // ── Section B: protection states ────────────────────────────────
      root.addChild(label(s.sectionProtection, 20, protTop + 8, "section"));
      const protStates: Array<[string, CityBuilding["protection"]]> = [
        [s.protectionLabels[0], null],
        [s.protectionLabels[1], "firewall"],
        [s.protectionLabels[2], "hardlock"],
      ];
      protStates.forEach(([name, protection], i) => {
        const cx = LEFT + 140 + i * 300;
        const sprite = new BuildingSprite(fakeBuilding(501 + i, "Server Marshal", 5, protection));
        sprite.setLod("close");
        sprite.position.set(cx, protTop + 145);
        root.addChild(sprite);
        buildingSprites.push(sprite);
        root.addChild(label(name, cx, protTop + 182, "sub", 0.5));
      });

      // ── Section C: HQ core value stages ─────────────────────────────
      root.addChild(label(s.sectionHq, 20, hqTop + 16, "section"));
      s.hqStageLabels.forEach((name, i) => {
        const cx = colX(i);
        const hq = new HqSprite(null, i + 1);
        hq.setTag("");
        hq.setDaylight(daylightRef.current);
        hq.position.set(cx, hqTop + 214);
        root.addChild(hq);
        hqSprites.push(hq);
        root.addChild(label(name, cx, hqTop + 262, "sub", 0.5));
      });

      // ── Section D: the Six landmarks × value stages ─────────────────
      root.addChild(label(s.sectionLandmarks, 20, landmarkTop + 16, "section"));
      // Stage column headers (shared by all six rows).
      s.stageLabels.forEach((tag, i) => {
        root.addChild(label(tag, colX(i), landmarkTop + 56, "sub", 0.5));
      });
      for (let i = 0; i < 6; i++) {
        const rowTop = landmarkTop + 40 + i * LANDMARK_ROW_H;
        const baseY = rowTop + 250;
        root.addChild(
          label(s.landmarkNames[i], LEFT - 24, baseY - 120, "family", 1, LANDMARK_COLORS[i])
        );
        for (let stage = 1; stage <= 3; stage++) {
          const lm = new LandmarkSprite(i, true, stage);
          lm.setLod("close");
          lm.setDaylight(daylightRef.current);
          lm.position.set(colX(stage - 1), baseY);
          root.addChild(lm);
          landmarkSprites.push(lm);
        }
      }

      applyDaylight(daylightRef.current);
    })();

    return () => {
      cancelled = true;
      applyRef.current = null;
      app?.destroy(true, { children: true });
    };
    // Locale switch → rebuild (labels are baked into Pixi Text objects).
  }, [strings]);

  // Day/night toggle: retint labels, crossfade pairs, lift hero masses.
  useEffect(() => {
    daylightRef.current = daylight;
    applyRef.current?.(daylight);
  }, [daylight]);

  return <div ref={hostRef} className="w-full" />;
}
