"use client";

/**
 * Buildings Catalog — the REAL 3D collection (2026-09-30 Kenney-kit rewrite;
 * supersedes the 2026-09-28 procedural Pixi catalog).
 *
 * The city's default renderer is Three.js with the Kenney City Kit, so the
 * catalog now renders THE SAME THING THE CITY RENDERS — not a parallel art
 * system: every cell is shot through the scene's own recipe functions
 * (pickBuildingPrefab / familyTint / buildingKitScale, the shared HQ +
 * monument constants in assets3d), so the catalog can never drift from the
 * city. Sections:
 *   A. The kit collection — every shipped building model, untinted
 *      (21 suburban homes / 14 commercial blocks / 5 skyscrapers).
 *   B. Trade families × architecture league — the family tint at each
 *      league's entry tier (T1 / T4 / T8).
 *   C. Protection states (DEED LOCK / IRON DEED ground rings).
 *   D. HQ core value stages (stage-scaled grand tower).
 *   E. The Six Founder monuments × 3 stages + the unowned ghost.
 *
 * Implementation: ONE offscreen WebGLRenderer shoots every cell to a cached
 * dataURL (per-league fixed framing so sizes stay comparable inside a
 * league), then plain DOM/CSS lays the cells out — labels are real i18n'd
 * React nodes (the old Pixi Text baking is gone). Day/night re-shoots with
 * the scene's exact light rig (sun 0.18+9.2·d^0.85, hemi 0.95+1.35·d,
 * window emissive 2.6·(1−d)^1.1). Static by nature — reduced-motion safe.
 * The 2D-only civic landmarks (Police/Fire/School/Hospital) render in the
 * Pixi fallback renderer only and are intentionally NOT catalogued here.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ACESFilmicToneMapping,
  Box3,
  BoxGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Material,
} from "three";
import {
  COMMERCIAL_BUILDINGS,
  HQ_KIT_PREFAB,
  INDUSTRIAL_BUILDINGS,
  MONUMENT_KIT_PREFABS,
  MONUMENT_TINT,
  SKYSCRAPERS,
  SUBURBAN_BUILDINGS,
  buildingKitScale,
  familyTint,
  hqStageScale,
  loadCityKit,
  monumentStageScale,
  pickBuildingPrefab,
  type CityKit,
} from "@/components/city/world/scene3d/assets3d";
import { buildProtectionRingsGeometry } from "@/components/city/world/scene3d/world3d";
import { CAM_DIST, CAM_FAR, CAM_NEAR, cameraBasis } from "@/lib/city/scene/camera3d";
import { LANDMARK_COLORS } from "@/lib/city/landmark-colors";
import { familyHex } from "@/lib/city/district";
import { PROFESSIONS, professionName } from "@/lib/professions";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { cardDisplayName } from "@/lib/display-names";
import { useLanguage } from "@/components/LanguageContext";

/** Cell framing league — one fixed frame per league keeps sizes comparable. */
type League = "suburban" | "commercial" | "industrial" | "skyscraper" | "hq" | "monument";
type KitDir = "suburban" | "commercial" | "industrial";

interface ShotContext {
  kit: CityKit;
  daylight: number;
  /** Untinted kit base materials (private clones — night emissive applied). */
  base: Map<KitDir, MeshStandardMaterial>;
  /** Family-tinted material per `${kitDir}/${profession}` (private clones). */
  family: Map<string, MeshStandardMaterial>;
}

// ── light rig (mirrors ThreeScene.applyDaylight values) ─────────────────────

function sunIntensity(d: number): number {
  return 0.18 + 9.2 * Math.pow(d, 0.85);
}
function hemiIntensity(d: number): number {
  return 0.95 + 1.35 * d;
}
function windowEmissive(d: number): number {
  return 2.6 * Math.pow(1 - d, 1.1);
}

// ── shared geometry (never disposed between cells) ──────────────────────────

const SHADOW_GEO = new CircleGeometry(1, 28);
const BEACON_GEO = new BoxGeometry(7.5, 6, 7.5);

/** Variant letter of a prefab name ("building-type-c" → "C"). */
function variantLetter(name: string): string {
  const tail = name.slice(name.lastIndexOf("-") + 1);
  return tail.length === 1 ? tail.toUpperCase() : tail;
}

/** The scene's building recipe, verbatim: prefab pick + family tint + scale. */
function buildingCell(
  ctx: ShotContext,
  profession: string | null,
  tier: 1 | 4 | 5 | 8,
  seed: number,
  protection?: "firewall" | "hardlock"
): Group | null {
  const pick = pickBuildingPrefab(profession, tier, seed);
  const geoKey = `${pick.kit}/${pick.name}`;
  const geo = ctx.kit.geometries.get(geoKey);
  const mat = ctx.family.get(`${pick.kit}/${profession ?? "__unassigned__"}`);
  if (!geo || !mat) return null;
  const group = new Group();
  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(buildingKitScale(ctx.kit.footprints.get(geoKey)));
  group.add(mesh);
  if (protection) {
    group.add(
      new Mesh(
        buildProtectionRingsGeometry([{ gx: 0, gy: 0, protection }]),
        new MeshBasicMaterial({ vertexColors: true, toneMapped: false })
      )
    );
  }
  return group;
}

/** HQ core recipe (ThreeScene.syncHq kit path). */
function hqCell(ctx: ShotContext, stage: number): Group | null {
  const geo = ctx.kit.geometries.get(HQ_KIT_PREFAB);
  const mat = ctx.family.get("commercial/__unassigned__");
  if (!geo || !mat) return null;
  const group = new Group();
  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(
    buildingKitScale(ctx.kit.footprints.get(HQ_KIT_PREFAB)) * hqStageScale(stage)
  );
  group.add(mesh);
  return group;
}

/** Founder monument recipe (ThreeScene.syncMonuments kit path). */
function monumentCell(
  ctx: ShotContext,
  index: number,
  stage: number,
  owned: boolean
): Group | null {
  const geoKey = MONUMENT_KIT_PREFABS[index % MONUMENT_KIT_PREFABS.length];
  const geo = ctx.kit.geometries.get(geoKey);
  const base = ctx.base.get("commercial");
  if (!geo || !base) return null;
  const accent = new Color(LANDMARK_COLORS[index % LANDMARK_COLORS.length]);
  const mat = base.clone();
  mat.color.copy(
    owned ? new Color(1, 1, 1).lerp(accent, MONUMENT_TINT) : new Color(0.62, 0.64, 0.68)
  );
  // Night identity = the 2026-10-01 scene recipe: OWNED monuments keep the
  // window emissive MAP tinted in the Founder accent (accent-lit windows,
  // not the old uniform wash that flattened them into pastel slabs);
  // unowned keeps a dim cold ember.
  if (owned) {
    mat.emissive = accent.clone();
  } else {
    mat.emissiveMap = null;
    mat.emissive = new Color(0.05, 0.06, 0.09);
  }
  mat.emissiveIntensity = windowEmissive(ctx.daylight);
  const h = ctx.kit.heights.get(geoKey) ?? 2.9;
  const k = buildingKitScale(ctx.kit.footprints.get(geoKey)) * monumentStageScale(stage);
  const group = new Group();
  const mesh = new Mesh(geo, mat);
  mesh.scale.setScalar(k);
  group.add(mesh);
  const beaconMat = new MeshBasicMaterial({
    color: owned
      ? accent.clone().lerp(new Color(1, 1, 1), 0.55)
      : new Color(0.35, 0.38, 0.45),
    toneMapped: false,
  });
  const beacon = new Mesh(BEACON_GEO, beaconMat);
  beacon.position.y = h * k * 1.1547 + 5;
  group.add(beacon);
  group.userData.disposables = [mat, beaconMat] as Material[];
  return group;
}

// ── the catalog cell list ───────────────────────────────────────────────────

const FAMILY_PROFESSIONS: Array<string | null> = [
  ...PROFESSIONS.map((p) => p.name as string),
  null,
];
const PROTECTION_ROWS = [null, "firewall", "hardlock"] as const;
const FAMILY_TIERS = [1, 4, 8] as const;

/** Kit gallery rows: league framing + kit directory + every prefab name. */
const GALLERY_ROWS = [
  { league: "suburban", kitDir: "suburban", names: SUBURBAN_BUILDINGS },
  { league: "commercial", kitDir: "commercial", names: COMMERCIAL_BUILDINGS },
  { league: "industrial", kitDir: "industrial", names: INDUSTRIAL_BUILDINGS },
  { league: "skyscraper", kitDir: "commercial", names: SKYSCRAPERS },
] as const;

export default function BuildingsCatalogMount({ daylight }: { daylight: number }) {
  const { t, locale } = useLanguage();
  const [shots, setShots] = useState<Record<string, string> | null>(null);
  const [failed, setFailed] = useState(false);

  const sections = useMemo(() => {
    const stage = (n: number) => t.catalogStage.replace("{n}", String(n));
    return {
      familyNames: [
        ...FAMILY_PROFESSIONS.slice(0, -1).map((name) => professionName(name, locale)),
        t.catalogUnassigned,
      ],
      familyProfessions: FAMILY_PROFESSIONS,
      protectionLabels: [t.catalogNoProtection, t.catalogFirewall, t.catalogHardLock],
      hqStageLabels: [stage(1), stage(2), stage(3)],
      stageLabels: [stage(1), stage(2), stage(3)],
      landmarkNames: GODDESS_USERNAMES.map((u) => cardDisplayName(u, locale)),
    };
  }, [t, locale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const kit = await loadCityKit();
      if (!kit || typeof document === "undefined") {
        if (!cancelled) setFailed(true);
        return;
      }
      let renderer: WebGLRenderer;
      try {
        renderer = new WebGLRenderer({
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        });
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = SRGBColorSpace;
      renderer.toneMapping = ACESFilmicToneMapping;
      renderer.setPixelRatio(2);

      // Private material clones (never the live scene's shared kit mats).
      const base = new Map<KitDir, MeshStandardMaterial>();
      for (const k of ["suburban", "commercial", "industrial"] as const) {
        const m = kit.materials.get(k);
        if (!m) continue;
        const c = m.clone();
        c.emissiveIntensity = windowEmissive(daylight);
        base.set(k, c);
      }
      const family = new Map<string, MeshStandardMaterial>();
      for (const prof of FAMILY_PROFESSIONS) {
        for (const k of ["suburban", "commercial", "industrial"] as const) {
          const b = base.get(k);
          if (!b) continue;
          const c = b.clone();
          c.color.copy(familyTint(prof));
          family.set(`${k}/${prof ?? "__unassigned__"}`, c);
        }
      }
      const ctx: ShotContext = { kit, daylight, base, family };

      // Build every cell group once (league frames need all extents first).
      const groups = new Map<string, { group: Group; league: League }>();
      const disposables: Material[] = [...base.values(), ...family.values()];
      const addGroup = (key: string, league: League, group: Group | null) => {
        if (!group) return;
        const extra = group.userData.disposables as Material[] | undefined;
        if (extra) disposables.push(...extra);
        groups.set(key, { group, league });
      };

      // A. kit gallery — by explicit prefab name (a seeded pick would skip
      //    most variants; the gallery must show EVERY shipped model).
      for (const row of GALLERY_ROWS) {
        for (const name of row.names) {
          const geoKey = `${row.kitDir}/${name}`;
          const geo = kit.geometries.get(geoKey);
          const mat = base.get(row.kitDir);
          if (!geo || !mat) continue;
          const mesh = new Mesh(geo, mat);
          mesh.scale.setScalar(buildingKitScale(kit.footprints.get(geoKey)));
          const group = new Group();
          group.add(mesh);
          addGroup(`kit/${row.league}/${name}`, row.league, group);
        }
      }
      // B. families × league entry tiers (the seeded in-city recipe).
      FAMILY_PROFESSIONS.forEach((prof, row) => {
        FAMILY_TIERS.forEach((tier) => {
          const seed = 100 + row * 9 + tier * 3;
          const pick = pickBuildingPrefab(prof, tier, seed);
          addGroup(
            `fam/${prof ?? "none"}/t${tier}`,
            tier <= 3
              ? "suburban"
              : tier <= 7
                ? pick.kit === "industrial"
                  ? "industrial"
                  : "commercial"
                : "skyscraper",
            buildingCell(ctx, prof, tier, seed)
          );
        });
      });
      // C. protection states.
      PROTECTION_ROWS.forEach((protection, i) => {
        addGroup(
          `prot/${protection ?? "none"}`,
          "commercial",
          buildingCell(ctx, "Server Marshal", 5, 501 + i, protection ?? undefined)
        );
      });
      // D. HQ stages.
      ([1, 2, 3] as const).forEach((stage) => {
        addGroup(`hq/s${stage}`, "hq", hqCell(ctx, stage));
      });
      // E. Founder monuments × stages + ghost.
      for (let i = 0; i < 6; i++) {
        ([1, 2, 3] as const).forEach((stage) => {
          addGroup(`lm/${i}/s${stage}`, "monument", monumentCell(ctx, i, stage, true));
        });
        addGroup(`lm/${i}/ghost`, "monument", monumentCell(ctx, i, 1, false));
      }

      // Fixed per-league frames → every cell in a league shares one scale.
      const frames = computeFrames(groups);

      const scene = new Scene();
      const sun = new DirectionalLight(0xffffff, sunIntensity(daylight));
      sun.position.set(-420, 900, 380);
      const hemi = new HemisphereLight(0xcfe4ff, 0x454a52, hemiIntensity(daylight));
      scene.add(sun, hemi);
      const shadowMat = new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.16,
        toneMapped: false,
        depthWrite: false,
      });
      const shadow = new Mesh(SHADOW_GEO, shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      const basis = cameraBasis();

      const out: Record<string, string> = {};
      for (const [key, { group, league }] of groups) {
        if (cancelled) break;
        scene.add(group);
        const box = new Box3().setFromObject(group);
        const cx = (box.min.x + box.max.x) / 2;
        const cy = (box.min.y + box.max.y) / 2;
        const cz = (box.min.z + box.max.z) / 2;
        // Contact shadow under the footprint.
        shadow.scale.set(
          Math.max(8, (box.max.x - box.min.x) * 0.62),
          1,
          Math.max(8, (box.max.z - box.min.z) * 0.62)
        );
        shadow.position.set(cx, 0.15, cz);
        scene.add(shadow);

        const frame = frames.get(league);
        if (frame) {
          const halfH = frame.hUnits / 2;
          const halfW = (halfH * frame.pxW) / frame.pxH;
          const cam = new OrthographicCamera(-halfW, halfW, halfH, -halfH, CAM_NEAR, CAM_FAR);
          cam.position.set(
            cx + basis.dir.x * CAM_DIST,
            cy + basis.dir.y * CAM_DIST,
            cz + basis.dir.z * CAM_DIST
          );
          cam.lookAt(cx, cy, cz);
          renderer.setSize(frame.pxW, frame.pxH, false);
          renderer.render(scene, cam);
          out[key] = renderer.domElement.toDataURL("image/png");
        }
        scene.remove(group);
        scene.remove(shadow);
      }

      for (const m of disposables) m.dispose();
      shadowMat.dispose();
      renderer.dispose();
      if (!cancelled) {
        setShots(out);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [daylight]);

  if (failed) {
    return (
      <p className="text-sm text-gray-400 px-4 py-8 text-center">{t.catalogUnavailable}</p>
    );
  }

  const day = daylight >= 0.5;
  const bg = day ? "bg-[#8fb4d6]" : "bg-[#0a0e1a]";
  const labelCls = day ? "text-slate-800" : "text-gray-200";
  const subCls = day ? "text-slate-600" : "text-gray-400";

  const Cell = ({
    shot,
    alt,
    caption,
    maxH,
  }: {
    shot?: string;
    alt: string;
    caption?: string;
    maxH: string;
  }) => (
    <figure className="flex flex-col items-center gap-1">
      <div className={`flex items-end justify-center ${maxH}`}>
        {shot ? (
          <img src={shot} alt={alt} className="max-h-full w-auto" />
        ) : (
          <div className="w-16 h-24 rounded bg-black/10 animate-pulse" />
        )}
      </div>
      {caption ? (
        <figcaption className={`text-[11px] text-center ${subCls}`}>{caption}</figcaption>
      ) : null}
    </figure>
  );

  return (
    <div className={`rounded-lg border border-gray-800 ${bg} overflow-hidden`}>
      {/* A. the kit collection */}
      <section className="px-4 pt-5 pb-6">
        <h2 className={`text-sm font-bold ${labelCls}`}>{t.catalogSectionKit}</h2>
        <p className={`text-xs mt-0.5 ${subCls}`}>{t.catalogKitNote}</p>
        {(
          [
            ["suburban", t.catalogKitSuburban],
            ["commercial", t.catalogKitCommercial],
            ["industrial", t.catalogKitIndustrial],
            ["skyscraper", t.catalogKitSkyscraper],
          ] as const
        ).map(([league, label]) => (
          <div key={league} className="mt-4">
            <h3 className={`text-xs font-semibold uppercase tracking-wide ${subCls}`}>
              {label}
            </h3>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
              {GALLERY_ROWS.find((r) => r.league === league)!.names.map((name) => (
                <Cell
                  key={name}
                  shot={shots?.[`kit/${league}/${name}`]}
                  alt={`${label} ${variantLetter(name)}`}
                  caption={variantLetter(name)}
                  maxH={league === "suburban" ? "h-24" : league === "commercial" ? "h-32" : "h-64"}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* B. trade families × architecture league */}
      <section className="px-4 py-5 border-t border-black/10">
        <h2 className={`text-sm font-bold ${labelCls}`}>{t.catalogSectionFamilies}</h2>
        <div
          className="mt-3 grid gap-y-3 items-end"
          style={{ gridTemplateColumns: "minmax(96px, 1fr) repeat(3, minmax(0, 2fr))" }}
        >
          <span />
          {[t.catalogBandSuburban, t.catalogBandCommercial, t.catalogBandSkyscraper].map((b) => (
            <span key={b} className={`text-[11px] font-semibold text-center ${subCls}`}>
              {b}
            </span>
          ))}
          {sections.familyProfessions.map((prof, row) => (
            <div key={prof ?? "none"} className="contents">
              <span className="text-xs font-semibold self-center" style={{ color: familyHex(prof) }}>
                {sections.familyNames[row]}
              </span>
              {FAMILY_TIERS.map((tier) => (
                <div key={tier} className="flex justify-center">
                  <Cell
                    shot={shots?.[`fam/${prof ?? "none"}/t${tier}`]}
                    alt={sections.familyNames[row]}
                    maxH={tier <= 3 ? "h-24" : tier <= 7 ? "h-32" : "h-64"}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* C. protection states */}
      <section className="px-4 py-5 border-t border-black/10">
        <h2 className={`text-sm font-bold ${labelCls}`}>{t.catalogSectionProtection}</h2>
        <div className="mt-3 flex flex-wrap gap-8 justify-center">
          {PROTECTION_ROWS.map((protection, i) => (
            <Cell
              key={protection ?? "none"}
              shot={shots?.[`prot/${protection ?? "none"}`]}
              alt={sections.protectionLabels[i]}
              caption={sections.protectionLabels[i]}
              maxH="h-36"
            />
          ))}
        </div>
      </section>

      {/* D. HQ core stages */}
      <section className="px-4 py-5 border-t border-black/10">
        <h2 className={`text-sm font-bold ${labelCls}`}>{t.catalogSectionHq}</h2>
        <div className="mt-3 flex flex-wrap gap-8 justify-center">
          {sections.hqStageLabels.map((label, i) => (
            <Cell
              key={label}
              shot={shots?.[`hq/s${i + 1}`]}
              alt={`${t.catalogSectionHq} ${label}`}
              caption={label}
              maxH="h-72"
            />
          ))}
        </div>
      </section>

      {/* E. the Six Founder monuments */}
      <section className="px-4 py-5 border-t border-black/10">
        <h2 className={`text-sm font-bold ${labelCls}`}>{t.catalogSectionLandmarks}</h2>
        <p className={`text-xs mt-0.5 ${subCls}`}>{t.catalogStageLegend}</p>
        <div
          className="mt-3 grid gap-y-3 items-end"
          style={{ gridTemplateColumns: "minmax(96px, 1fr) repeat(4, minmax(0, 2fr))" }}
        >
          <span />
          {[...sections.stageLabels, t.catalogUnowned].map((label) => (
            <span key={label} className={`text-[11px] font-semibold text-center ${subCls}`}>
              {label}
            </span>
          ))}
          {sections.landmarkNames.map((name, i) => (
            <div key={name} className="contents">
              <span
                className="text-xs font-semibold self-center"
                style={{
                  color: `#${LANDMARK_COLORS[i % LANDMARK_COLORS.length]
                    .toString(16)
                    .padStart(6, "0")}`,
                }}
              >
                {name}
              </span>
              {([1, 2, 3] as const).map((stage) => (
                <div key={stage} className="flex justify-center">
                  <Cell
                    shot={shots?.[`lm/${i}/s${stage}`]}
                    alt={`${name} ${sections.stageLabels[stage - 1]}`}
                    maxH="h-72"
                  />
                </div>
              ))}
              <div className="flex justify-center">
                <Cell
                  shot={shots?.[`lm/${i}/ghost`]}
                  alt={`${name} ${t.catalogUnowned}`}
                  maxH="h-72"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Screen-reader summary of the (image) catalog contents. */}
      <ul className="sr-only">
        {sections.familyNames.map((name) => (
          <li key={name}>
            {name} — {t.catalogBandSuburban} / {t.catalogBandCommercial} /{" "}
            {t.catalogBandSkyscraper}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── league framing helpers ──────────────────────────────────────────────────

interface LeagueFrame {
  hUnits: number;
  pxW: number;
  pxH: number;
}

const FRAME_MARGIN = { side: 22, top: 16, ground: 26 };
/** Per-league canvas px ceilings (retina ×2 buffer underneath). */
const FRAME_CAPS: Record<League, { w: number; h: number }> = {
  suburban: { w: 190, h: 170 },
  commercial: { w: 190, h: 260 },
  industrial: { w: 200, h: 240 },
  skyscraper: { w: 200, h: 400 },
  hq: { w: 260, h: 460 },
  monument: { w: 260, h: 460 },
};

function computeFrames(
  groups: Map<string, { group: Group; league: League }>
): Map<League, LeagueFrame> {
  const max = new Map<League, { w: number; h: number }>();
  for (const { group, league } of groups.values()) {
    const box = new Box3().setFromObject(group);
    const w = box.max.x - box.min.x;
    const h = box.max.y - box.min.y;
    const cur = max.get(league) ?? { w: 0, h: 0 };
    max.set(league, { w: Math.max(w, cur.w), h: Math.max(h, cur.h) });
  }
  const frames = new Map<League, LeagueFrame>();
  for (const [league, size] of max) {
    const wUnits = size.w + FRAME_MARGIN.side * 2;
    const hUnits = size.h + FRAME_MARGIN.top + FRAME_MARGIN.ground;
    const cap = FRAME_CAPS[league];
    const ppu = Math.min(1, cap.w / wUnits, cap.h / hUnits);
    frames.set(league, {
      hUnits,
      pxW: Math.max(64, Math.round(wUnits * ppu)),
      pxH: Math.max(72, Math.round(hUnits * ppu)),
    });
  }
  return frames;
}
