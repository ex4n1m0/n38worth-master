/**
 * Mainframe City 3D — STREET FURNITURE + VEGETATION + VEHICLES.
 *
 * AAA pass (2026-09-30): instanced props that give the city its lived-in
 * density — streetlight poles with emissive heads (the lamp tiles' warm
 * pools light the night roads), two tree variants scattered through the
 * unpaved gaps, and parked cars along the travel streets. All geometry is
 * MeshBuilder vertex-colored (shared instancing materials tint by vertex
 * color; per-instance variation via instanceColor where useful).
 *
 * Placement is PURE + SEEDED: the same city layout always produces the
 * same props (no shimmer between syncs).
 */

import { Color } from "three";
import {
  MeshBuilder,
  HALF_TILE,
} from "./building3d";
import { tileToGround } from "@/lib/city/scene/camera3d";
import type { StreetTile } from "@/lib/city/streets";

// ── streetlights ───────────────────────────────────────────────────────────

/** Lamp spot → pole-head geometry is shared; heads hang toward the road. */
export function buildStreetlightPole(): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  const steel = new Color("#2e333b");
  const poleH = 26;
  // Base + pole (dark metal).
  b.box(0, 0, 0, 1.5, 1.5, 2, steel);
  b.box(0, 0, 2, 0.65, 0.65, poleH, steel);
  // Arm: toward the roadway (the spot sits at the tile's NE sidewalk
  // corner; the road center is toward (−1, +1)/√2 in ground space).
  const armLen = 7;
  const ax = -armLen * 0.7071;
  const az = armLen * 0.7071;
  b.box(ax / 2, az / 2, 2 + poleH - 1.2, armLen / 2 + 0.6, 0.6, 1.1, steel);
  return b.toGeometry();
}

/** Emissive lamp head (renders unlit warm; blooms at night). */
export function buildStreetlightHead(): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  const armLen = 7;
  const ax = -armLen * 0.7071;
  const az = armLen * 0.7071;
  // Head: small warm box under the arm's far end.
  b.box(ax, az, 2 + 26 - 2.6, 1.7, 1.05, 1.5, new Color("#ffcf8a"));
  return b.toGeometry();
}

// ── trees ──────────────────────────────────────────────────────────────────

export type TreeVariant = "round" | "conifer";

/** One tree (trunk + canopy), vertex-colored; tinted per instance. */
export function buildTreeGeometry(variant: TreeVariant): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  const trunk = new Color("#5d4632");
  const canopy = new Color("#4d7a3a");
  const canopyLight = new Color("#5f8f47");
  b.box(0, 0, 0, 1.7, 1.7, 9, trunk);
  if (variant === "round") {
    b.prism8(0, 0, 8, 8.2, 9, canopy);
    b.prism8(0, 0, 16, 5.8, 5.5, canopyLight);
  } else {
    b.prism8(0, 0, 8, 7.2, 6.5, canopy);
    b.prism8(0, 0, 13, 5.5, 5.5, canopyLight);
    b.prism8(0, 0, 18, 3.6, 5.5, canopy);
  }
  return b.toGeometry();
}

export interface TreePlacement {
  x: number;
  z: number;
  variant: TreeVariant;
  scale: number;
  /** 0..1 hue jitter seed (per-instance color variation). */
  jitter: number;
}

/**
 * Seeded tree scatter around `center` over the city's green gaps: tiles
 * that are NOT occupied, reserved, moated or paved, near the action
 * (Chebyshev ≤ 2 of a paved/built tile) plus a sparse meadow sprinkle
 * beyond. Deterministic per seed; bounded by `budget`.
 */
export function planTrees(
  occupiedKeys: ReadonlySet<string>,
  pavedKeys: ReadonlySet<string>,
  blockedKeys: ReadonlySet<string>,
  cityRadiusTiles: number,
  budget: number,
  seed: number,
  center: { gx: number; gy: number } = { gx: 0, gy: 0 }
): TreePlacement[] {
  let state = seed >>> 0;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const near = (gx: number, gy: number) => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const k = `${gx + dx},${gy + dy}`;
        if (occupiedKeys.has(k) || pavedKeys.has(k)) return true;
      }
    }
    return false;
  };
  const out: TreePlacement[] = [];
  const R = cityRadiusTiles + 6;
  let attempts = 0;
  while (out.length < budget && attempts < budget * 14) {
    attempts++;
    const gx = Math.round(center.gx + (rnd() * 2 - 1) * R);
    const gy = Math.round(center.gy + (rnd() * 2 - 1) * R);
    const key = `${gx},${gy}`;
    if (occupiedKeys.has(key) || pavedKeys.has(key) || blockedKeys.has(key)) continue;
    if (!near(gx, gy) && rnd() > 0.1) continue; // meadow sprinkle ~10%
    const g = tileToGround(gx, gy);
    out.push({
      x: g.x + (rnd() - 0.5) * HALF_TILE * 0.7,
      z: g.z + (rnd() - 0.5) * HALF_TILE * 0.7,
      variant: rnd() < 0.62 ? "round" : "conifer",
      scale: 1.05 + rnd() * 0.75,
      jitter: rnd(),
    });
  }
  return out;
}

// ── parked cars ────────────────────────────────────────────────────────────

/** One sedan (body + cabin + glass + dark under-strip), vertex-colored. */
export function buildCarGeometry(): ReturnType<MeshBuilder["toGeometry"]> {
  const b = new MeshBuilder();
  const body = new Color(1, 1, 1); // tinted per instance
  const glass = new Color(0.1, 0.12, 0.16);
  const dark = new Color(0.08, 0.08, 0.1);
  // Authored along the world X axis; instances rotate per street axis.
  b.box(0, 0, 0.5, 5.2, 2.2, 2.6, body);
  b.box(0, 0, 3.1, 2.9, 1.9, 2.0, body);
  b.box(0, 0, 3.2, 2.95, 1.95, 1.1, glass);
  // Dark under-strip (wheels + ground shadow read at iso distance).
  b.box(0, 0, 0, 5.4, 2.0, 0.8, dark);
  b.box(-0.15, 0, 2.2, 1.2, 1.2, 0.6, glass);
  return b.toGeometry();
}

export interface CarPlacement {
  x: number;
  z: number;
  /** Radians — 0 faces +x; π/2 faces +z (street axis). */
  yaw: number;
  /** 0..1 color seed. */
  colorSeed: number;
}

const CAR_PALETTE = [
  "#c8ccd2",
  "#8f98a3",
  "#4f5a66",
  "#8c3232",
  "#2e4a6b",
  "#b8b03a",
  "#5a6b4a",
  "#20242a",
];

export function carColorAt(seed: number): Color {
  return new Color(CAR_PALETTE[Math.floor(seed * CAR_PALETTE.length) % CAR_PALETTE.length]);
}

/**
 * Parked cars along the travel streets: seeded subset of the non-stub
 * tiles (ring cities classify most gap tiles as "cross" — corners park
 * there too), parked off the centerline. Bounded by `budget`.
 */
export function planParkedCars(
  tiles: readonly StreetTile[],
  budget: number,
  seed: number
): CarPlacement[] {
  let state = seed >>> 0;
  const rnd = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const out: CarPlacement[] = [];
  for (const t of tiles) {
    if (out.length >= budget) break;
    if (t.axis === "stub") continue;
    const keep = t.axis === "cross" ? 0.14 : 0.3;
    if (rnd() > keep) continue;
    const g = tileToGround(t.gx, t.gy);
    const side = HALF_TILE * 0.42;
    const onX = rnd() < 0.5;
    if (onX) {
      out.push({ x: g.x, z: g.z + side, yaw: 0, colorSeed: rnd() });
    } else {
      out.push({ x: g.x - side, z: g.z, yaw: Math.PI / 2, colorSeed: rnd() });
    }
  }
  return out;
}
