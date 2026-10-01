/**
 * Mainframe City 3D — KENNEY CITY KIT asset pipeline (client-only).
 *
 * 2026-09-30 pivot ("look for assets online", user ruling): the procedural
 * boxes hit a style ceiling, so the city's ordinary buildings/roads/trees/
 * streetlights now render from Kenney's CC0 City Kit family (Suburban +
 * Commercial + Roads, https://kenney.nl — public domain, no attribution
 * required; License.txt copied alongside the assets).
 *
 * Structure (verified): every GLB is ONE mesh with ONE primitive and a
 * shared 1×1-tile ground footprint (1 kit unit = 1 city tile), referencing
 * Textures/colormap.png in its own directory. That maps perfectly onto
 * InstancedMesh pools: geometry per prefab, one lit material per kit.
 *
 * Value ladder → architecture class (the SC4 read: richer cards = grander
 * buildings): tiers 1–3 suburban houses, 4–7 the MID league (commercial
 * blocks + industrial works pooled), 8–14 the skyscraper league
 * (pickBuildingPrefab is the ONE authority). Family hue tints each instance
 * lightly so districts stay readable; night windows come from a derived
 * emissive map (dark, neutral pixels of the colormap become warm lit
 * windows).
 */

import {
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NoColorSpace,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TILE_STEP } from "@/lib/city/scene/camera3d";
import type { BuildingTier } from "@/lib/city/types";
import { familyHex } from "@/lib/city/district";

/** Kits live under public/city-assets (served verbatim). */
const ASSET_ROOT = "/city-assets";

export type KitName = "suburban" | "commercial" | "industrial" | "roads";

/** Building prefab classes by value tier (the architecture ladder). */
export const SUBURBAN_BUILDINGS = Array.from(
  { length: 21 },
  (_, i) => `building-type-${String.fromCharCode(97 + i)}`
);
export const COMMERCIAL_BUILDINGS = Array.from(
  { length: 14 },
  (_, i) => `building-${String.fromCharCode(97 + i)}`
);
/**
 * Industrial works (Kenney City Kit Industrial, added 2026-09-30 "more
 * building variety"): 20 factory/warehouse prefabs folded into the MID
 * league — tiers 4–7 pick from commercial blocks + industrial works pooled,
 * so the most-populated tiers get 34 variants instead of 14.
 */
export const INDUSTRIAL_BUILDINGS = Array.from(
  { length: 20 },
  (_, i) => `building-${String.fromCharCode(97 + i)}`
);
export const SKYSCRAPERS = Array.from(
  { length: 5 },
  (_, i) => `building-skyscraper-${String.fromCharCode(97 + i)}`
);

/** The mid-league pool (tiers 4–7): commercial blocks + industrial works. */
const MID_LEAGUE: ReadonlyArray<{ kit: KitName; name: string }> = [
  ...COMMERCIAL_BUILDINGS.map((name) => ({ kit: "commercial" as const, name })),
  ...INDUSTRIAL_BUILDINGS.map((name) => ({ kit: "industrial" as const, name })),
];

/** Street tiles + furniture (axis classification comes from streets.ts). */
export const ROAD_PREFABS = {
  straight: "road-straight",
  crossroad: "road-crossroad",
  intersection: "road-intersection",
  end: "road-end",
  side: "road-side",
  lightSquare: "light-square",
  lightDouble: "light-square-double",
} as const;

/** Kit street furniture: traffic lights at intersections (roads kit). */
export const TRAFFIC_LIGHT_PREFAB = "traffic-light";

// ── Kenney 3D Road Tiles (the 2026-09-30 "nicer roads" layer) ───────────────
//
// The City Kit's own road tiles are flat colormap plates (rejected earlier
// for exactly that), but Kenney's separate "3D Road Tiles" pack models the
// markings as GEOMETRY: raised curbs, sidewalk strips, grass verges and
// white zebra bars. These .gltf tiles are 3×3-unit pieces with ONE PRIMITIVE
// PER MATERIAL (Grass/Stone/Asphalt/White), so unlike the kit GLBs they
// load as prototype GROUPS and the renderer instances each primitive with
// its own material (a handful of InstancedMeshes for the whole street grid).
// Tile picks + orientation verified via the /dev-roads contact sheet
// (image-analyst, 2026-09-30): 142 clean straight (asphalt runs along X),
// 043 centered 4-way, 025 straight with a mid-block zebra.

export const ROAD_TILE_PREFABS = {
  straight: "roadTile_142",
  cross: "roadTile_043",
  zebra: "roadTile_025",
  /** Water plate (the world river, lib/city/river.ts) — never a street. */
  water: "roadTile_001",
} as const;

export type RoadTileKind = keyof typeof ROAD_TILE_PREFABS;

/** One road tile = 3×3 pack units → one city tile pitch. */
export const ROAD_TILE_SCALE = TILE_STEP / 3;

export const TREE_PREFABS = { large: "tree-large", small: "tree-small" } as const;

// ── shared kit recipes (scene + catalog in lockstep; pinned by tests) ──────

/** The HQ core renders as this grand kit tower, stage-scaled. */
export const HQ_KIT_PREFAB = "commercial/building-skyscraper-b";

/** HQ stage → kit scale multiplier (stages 1/2/3). */
export function hqStageScale(stage: number): number {
  return stage >= 3 ? 1.9 : stage === 2 ? 1.55 : 1.3;
}

/**
 * The Six Founder monuments' kit prefab roster (Founder order — index i is
 * the i-th goddess card). Grand, distinct silhouettes.
 */
export const MONUMENT_KIT_PREFABS = [
  "commercial/building-skyscraper-a",
  "commercial/building-skyscraper-c",
  "commercial/building-skyscraper-d",
  "commercial/building-skyscraper-e",
  "commercial/building-skyscraper-b",
  "commercial/building-m",
] as const;

/** Monument stage → kit scale multiplier (stages 1/2/3). */
export function monumentStageScale(stage: number): number {
  return stage >= 3 ? 2.5 : stage === 2 ? 2.0 : 1.6;
}

/** Owned monument tint strength toward the Founder accent (unowned = gray). */
export const MONUMENT_TINT = 0.55;

export interface PrefabChoice {
  kit: KitName;
  name: string;
}

/**
 * One building's prefab: deterministic per (profession, tier, seed) — the
 * same card always shows the same house, tiers climb the architecture
 * ladder, and every family spreads across the full variant range (the
 * seed mixes the profession hash so two families never share one house
 * pattern slot-for-slot).
 */
export function pickBuildingPrefab(
  profession: string | null,
  tier: BuildingTier,
  seed: number
): PrefabChoice {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  const p = profession ?? "__unassigned__";
  for (let i = 0; i < p.length; i++) {
    h = (Math.imul(h ^ p.charCodeAt(i), 0x85ebca6b) >>> 0) + tier;
  }
  if (tier >= 8) return { kit: "commercial", name: SKYSCRAPERS[h % SKYSCRAPERS.length] };
  if (tier >= 4) {
    const pick = MID_LEAGUE[h % MID_LEAGUE.length];
    return { kit: pick.kit, name: pick.name };
  }
  return { kit: "suburban", name: SUBURBAN_BUILDINGS[h % SUBURBAN_BUILDINGS.length] };
}

/**
 * Street tile → road-tile prefab + yaw (the 3D kit-road layer). The pack's
 * straights run along the model's X axis (asphalt w(x)=3.0 vs d(z)=1.5), so
 * travel-axis "x" needs no rotation and "y" a quarter turn; the 4-way cross
 * is symmetric. Stubs render as a straight (dead-end cap is a minor read).
 */
export function roadTileFor(
  axis: "x" | "y" | "cross" | "stub"
): { kind: Exclude<RoadTileKind, "water">; yaw: number } {
  if (axis === "cross") return { kind: "cross", yaw: 0 };
  if (axis === "y") return { kind: "straight", yaw: Math.PI / 2 };
  // "x" straights run unrotated; stubs render as a straight dead-end pad.
  return { kind: "straight", yaw: 0 };
}

/** Street prefab for a derived street tile axis. */
export function roadPrefabFor(axis: "x" | "y" | "cross" | "stub"): string {
  if (axis === "cross") return ROAD_PREFABS.crossroad;
  if (axis === "stub") return ROAD_PREFABS.end;
  return ROAD_PREFABS.straight;
}

/**
 * Family tint for instances. 2026-10-01 "too bright, same color buildings"
 * fix: lerp raised 0.34 → 0.45 (districts must READ at overview zoom) and
 * paired with per-building brightness variants (ThreeScene) + the base kit
 * dim below, so a block reads as one family but not one flat color.
 */
export function familyTint(profession: string | null): Color {
  const base = new Color(1, 1, 1);
  return base.lerp(new Color(familyHex(profession)), 0.45);
}

/** Per-building brightness jitter steps (familyKitMaterial variants). */
export const FAMILY_SHADE_STEPS = [0.9, 1.0, 1.08] as const;

/**
 * Instance scale for one prefab: normalizes the model's footprint to ~72%
 of a tile (the procedural platform's proportion) so streets and grass stay
 visible between buildings regardless of each model's native size.
 */
export function buildingKitScale(
  footprint: { w: number; d: number } | undefined
): number {
  const widest = Math.max(footprint?.w ?? 1.2, footprint?.d ?? 1.2, 0.2);
  return (TILE_STEP * 0.72) / widest;
}
/** HQ scale: same rule with headroom for the grand stage multiplier. */
export const BUILDING_KIT_SCALE = TILE_STEP * 0.72;
export const ROAD_KIT_SCALE = TILE_STEP;
export const LAMP_KIT_SCALE = TILE_STEP * 0.5;
export const TREE_KIT_SCALE = TILE_STEP * 0.75;

// ── the loaded kit ─────────────────────────────────────────────────────────

export interface CityKit {
  /** Prefab key "kit/name" → base-centered geometry (1 unit = 1 tile). */
  geometries: Map<string, BufferGeometry>;
  /** One lit material per kit (shared colormap + derived night emissive). */
  materials: Map<KitName, MeshStandardMaterial>;
  /** Tree material: same colormap, NO emissive (trees never glow), lifted
   *  canopy greens. */
  treeMaterial: MeshStandardMaterial;
  /** Bounding height per prefab (kit units) — label/picking anchors. */
  heights: Map<string, number>;
  /** Footprint extents (kit units) — instance scale normalization. */
  footprints: Map<string, { w: number; d: number }>;
  /**
   * Road-tile prototypes (Kenney 3D Road Tiles): base-centered GROUPS, one
   * child mesh per material (Grass/Stone/Asphalt/White). The renderer
   * instances each child with its own material — never render these groups
   * directly.
   */
  roadTiles: Map<RoadTileKind, Group>;
  dispose(): void;
}

/**
 * Load one road-tile .gltf as a base-centered multi-primitive prototype.
 * The pack tiles are 3×3 units and NOT centered (x 0..3, z −3..0), so each
 * child mesh gets a baked centering offset; instance transforms then
 * multiply (tileMatrix × child.matrix).
 */
function loadRoadTile(
  loader: GLTFLoader,
  name: string
): Promise<Group | null> {
  return new Promise((resolve) => {
    loader.load(
      `${ASSET_ROOT}/roadtiles/${name}.gltf`,
      (gltf) => {
        gltf.scene.updateMatrixWorld(true);
        const group = new Group();
        const meshes: Mesh[] = [];
        gltf.scene.traverse((o) => {
          const m = o as unknown as { isMesh?: boolean };
          if (m.isMesh) meshes.push(o as Mesh);
        });
        if (!meshes.length) return resolve(null);
        const bb = new Box3().setFromObject(gltf.scene);
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        for (const m of meshes) {
          // Bake each primitive's WORLD transform (gltf.scene may carry
          // one) so the prototype is a plain parent, then base-center.
          m.matrixAutoUpdate = false;
          m.matrix.copy(m.matrixWorld);
          m.matrix.decompose(m.position, m.quaternion, m.scale);
          m.position.set(
            m.position.x - cx,
            m.position.y - bb.min.y,
            m.position.z - cz
          );
          m.updateMatrix();
          // The pack's flat Kd colors are tuned for soft lighting; under
          // this scene's day sun (intensity ~9.4 + bloom) they blow out to
          // white — dim + roughen them once at load so asphalt, sidewalk
          // and zebra stay separable in daylight (image-analyst QA pass,
          // 2026-09-30).
          const mat = m.material as MeshStandardMaterial | undefined;
          if (mat && "color" in mat) {
            // 2026-10-01 "roads are almost white" fix: overall dim deepened
            // 0.62 → 0.5; Stone (sidewalk/curb pads — most of a cross
            // tile's area, and the main "white" read) 0.72 → 0.6. White
            // (zebra bars) keeps a smaller dim so crossings stay readable.
            mat.color.multiplyScalar(0.5);
            if (/stone/i.test(mat.name ?? "")) mat.color.multiplyScalar(0.6);
            else if (/white/i.test(mat.name ?? "")) mat.color.multiplyScalar(1.25);
            mat.roughness = Math.max(mat.roughness ?? 0.5, 0.92);
            mat.metalness = 0;
          }
          group.add(m);
        }
        resolve(group);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function loadGlb(
  loader: GLTFLoader,
  url: string
): Promise<BufferGeometry | null> {
  return new Promise((resolve) => {
    loader.load(
      url,
      (gltf) => {
        const found: BufferGeometry[] = [];
        gltf.scene.traverse((o) => {
          const mesh = o as unknown as {
            isMesh?: boolean;
            geometry?: BufferGeometry;
          };
          if (mesh.isMesh && mesh.geometry) found.push(mesh.geometry);
        });
        const geo = found[0];
        if (!geo) return resolve(null);
        const g = geo.clone();
        // Base-center: sit on y=0, centered on the tile footprint.
        g.computeBoundingBox();
        const bb = g.boundingBox ?? new Box3();
        const cx = (bb.min.x + bb.max.x) / 2;
        const cz = (bb.min.z + bb.max.z) / 2;
        g.translate(-cx, -bb.min.y, -cz);
        resolve(g);
      },
      undefined,
      () => resolve(null)
    );
  });
}

/**
 * Derive the night-window emissive map from a kit colormap: dark, neutral
 * pixels (windows in Kenney facades) become warm lit glass; everything
 * else stays dark. Canvas-based, runs once per kit at load.
 */
function emissiveCanvasFrom(
  image: HTMLImageElement | HTMLCanvasElement
): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const w = image.width;
  const h = image.height;
  if (!w || !h) return null;
  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d");
  if (!sctx) return null;
  sctx.drawImage(image, 0, 0);
  const data = sctx.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d");
  if (!octx) return null;
  const img = octx.createImageData(w, h);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    // Windows: dark + low-saturation (blue-ish windows keep a warm pass —
    // Kenney paints them deep blue/gray on light walls).
    // Kenney windows: dark-to-mid BLUE-gray glass on warm walls — accept
    // bluish pixels up to mid luminance, and dark neutrals.
    const bluish = b > r + 0.02 && b >= g;
    const isWindow = (lum < 0.42 && bluish) || (lum < 0.26 && spread < 0.4);
    if (isWindow) {
      img.data[i] = 255;
      img.data[i + 1] = 190;
      img.data[i + 2] = 110;
      img.data[i + 3] = 255;
    } else {
      img.data[i] = 0;
      img.data[i + 1] = 0;
      img.data[i + 2] = 0;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Prefab URL list for a kit directory. */
function kitUrls(kit: KitName, names: readonly string[]): Array<[string, string]> {
  return names.map((n) => [`${kit}/${n}`, `${ASSET_ROOT}/${kit}/${n}.glb`] as const as [string, string]);
}

const KIT_PREFABS: Record<KitName, readonly string[]> = {
  suburban: [...SUBURBAN_BUILDINGS, TREE_PREFABS.large, TREE_PREFABS.small],
  commercial: [...COMMERCIAL_BUILDINGS, ...SKYSCRAPERS],
  industrial: [...INDUSTRIAL_BUILDINGS],
  roads: [
    ROAD_PREFABS.straight,
    ROAD_PREFABS.crossroad,
    ROAD_PREFABS.intersection,
    ROAD_PREFABS.end,
    ROAD_PREFABS.side,
    ROAD_PREFABS.lightSquare,
    ROAD_PREFABS.lightDouble,
    TRAFFIC_LIGHT_PREFAB,
  ],
};

let kitPromise: Promise<CityKit | null> | null = null;

/**
 * Load (once per session) the full city kit: ~50 GLBs + 3 colormap
 * textures. Returns null if any critical piece fails (the scene keeps its
 * procedural fallback). `?art=procedural` opts back to the old renderer.
 */
export function loadCityKit(): Promise<CityKit | null> {
  if (typeof document === "undefined") return Promise.resolve(null);
  if (kitPromise) return kitPromise;
  kitPromise = (async () => {
    const loader = new GLTFLoader();
    const geometries = new Map<string, BufferGeometry>();
    const heights = new Map<string, number>();
    const footprints = new Map<string, { w: number; d: number }>();
    const jobs: Array<Promise<void>> = [];
    for (const [kit, names] of Object.entries(KIT_PREFABS) as Array<[KitName, readonly string[]]>) {
      for (const [key, url] of kitUrls(kit, names)) {
        jobs.push(
          loadGlb(loader, url).then((g) => {
            if (!g) return;
            geometries.set(key, g);
            g.computeBoundingBox();
            const bb = g.boundingBox;
            if (bb) {
              heights.set(key, bb.max.y - bb.min.y);
              footprints.set(key, { w: bb.max.x - bb.min.x, d: bb.max.z - bb.min.z });
            }
          })
        );
      }
    }
    await Promise.all(jobs);
    if (geometries.size < 20) return null; // assets missing — keep procedural
    // Road-tile prototypes (multi-primitive groups; optional — the street
    // layer falls back to the procedural grid when these are absent).
    const roadTiles = new Map<RoadTileKind, Group>();
    await Promise.all(
      (Object.keys(ROAD_TILE_PREFABS) as RoadTileKind[]).map(async (kind) => {
        const g = await loadRoadTile(loader, ROAD_TILE_PREFABS[kind]);
        if (g) roadTiles.set(kind, g);
      })
    );
    // Materials: kit colormap + derived emissive night map.
    const materials = new Map<KitName, MeshStandardMaterial>();
    for (const kit of ["suburban", "commercial", "industrial", "roads"] as KitName[]) {
      try {
        const img = await loadImage(`${ASSET_ROOT}/${kit}/Textures/colormap.png`);
        const mat = new MeshStandardMaterial({
          roughness: 0.86,
          metalness: 0.04,
        });
        const tex = new CanvasTexture(img as unknown as HTMLCanvasElement);
        tex.colorSpace = SRGBColorSpace;
        tex.magFilter = LinearFilter;
        mat.map = tex;
        // 2026-10-01 "too bright" fix: the pack's colormap reads
        // over-exposed under the day sun — dim the building kits ~20%
        // (roads dim separately in loadRoadTile; their look is tuned there).
        if (kit !== "roads") mat.color.setScalar(0.8);
        // Only BUILDINGS glow at night — road asphalt would light up too.
        const emissiveCanvas =
          kit === "roads" ? null : emissiveCanvasFrom(img);
        if (emissiveCanvas) {
          const etex = new CanvasTexture(emissiveCanvas);
          etex.colorSpace = NoColorSpace;
          etex.magFilter = LinearFilter;
          mat.emissiveMap = etex;
          mat.emissive = new Color(1, 0.75, 0.45);
          mat.emissiveIntensity = 0;
        }
        materials.set(kit, mat);
      } catch {
        // Texture failed — untextured lit fallback still beats nothing.
        materials.set(kit, new MeshStandardMaterial({ roughness: 0.9 }));
      }
    }
    // Tree material: clone of the suburban material WITHOUT the emissive
    // map (the window rule catches dark canopy texels otherwise) and with
    // a green lift so canopies read alive at day.
    const treeMaterial = materials.get("suburban")!.clone();
    treeMaterial.emissiveMap = null;
    treeMaterial.emissiveIntensity = 0;
    treeMaterial.color = new Color(0.82, 1.05, 0.78);
    return {
      geometries,
      materials,
      treeMaterial,
      heights,
      footprints,
      roadTiles,
      dispose() {
        for (const g of geometries.values()) g.dispose();
        for (const m of materials.values()) {
          m.map?.dispose();
          m.emissiveMap?.dispose();
          m.dispose();
        }
        for (const proto of roadTiles.values()) {
          proto.traverse((o) => {
            const m = o as unknown as {
              isMesh?: boolean;
              geometry?: BufferGeometry;
              material?: MeshStandardMaterial;
            };
            if (m.isMesh) {
              m.geometry?.dispose();
              m.material?.dispose();
            }
          });
        }
        treeMaterial.dispose();
        kitPromise = null;
      },
    };
  })();
  return kitPromise;
}

/** Test/inspection helper (node): the manifest of shipped asset files. */
export function kitManifest(): Record<KitName, readonly string[]> {
  return KIT_PREFABS;
}
