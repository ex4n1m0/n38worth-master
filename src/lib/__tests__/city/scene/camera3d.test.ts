/**
 * camera3d parity — the 3D orthographic rig must reproduce the 2:1 iso
 * projection of iso.ts/camera.ts EXACTLY. These properties are what let
 * the whole renderer-agnostic stack (world-px camera state, pickTile
 * picking, culling, LOD zoom bands, focus targets) drive the three.js
 * scene unchanged. If these fail, the 3D view and every pure consumer of
 * world px disagree.
 */

import { describe, expect, it } from "vitest";
import {
  TILE_STEP,
  PIXEL_RISE,
  cameraBasis,
  cameraPlacement,
  orthoFrame,
  projectToScreen,
  tileToGround,
  groundToTile,
  worldPxToGround,
} from "@/lib/city/scene/camera3d";
import { tileToScreen, TILE_H, TILE_W } from "@/lib/city/scene/iso";
import {
  worldToScreen,
  screenToWorld,
  type CameraState,
  type Viewport,
} from "@/lib/city/scene/camera";

const VIEWPORT: Viewport = { width: 1280, height: 800 };

const CAMERAS: CameraState[] = [
  { x: 0, y: 0, zoom: 1 },
  { x: 512, y: -384, zoom: 1 },
  { x: -2048, y: 4096, zoom: 0.32 },
  { x: 96, y: 33, zoom: 2.5 },
  { x: 1e6, y: -1e6, zoom: 0.05 },
];

const TILES: Array<[number, number]> = [
  [0, 0],
  [16, 16],
  [34, 0],
  [0, 34],
  [34, 34],
  [7, 29],
  [103, 24],
  [-9, -4],
];

const EPS = 1e-6;

describe("camera3d — ground↔tile mapping", () => {
  it("one tile step projects to exactly TILE_W/2 horizontal each axis", () => {
    // Screen x of tile (1,0) minus tile (0,0) must be +64 (and y +32).
    const a = tileToScreen(0, 0);
    const b = tileToScreen(1, 0);
    expect(b.x - a.x).toBeCloseTo(TILE_W / 2, 9);
    expect(b.y - a.y).toBeCloseTo(TILE_H / 2, 9);
    expect(TILE_STEP * Math.SQRT1_2).toBeCloseTo(TILE_W / 2, 9);
  });

  it("tileToGround/groundToTile round-trips", () => {
    for (const [gx, gy] of TILES) {
      const g = tileToGround(gx, gy);
      const back = groundToTile(g);
      expect(back.gx).toBeCloseTo(gx, 9);
      expect(back.gy).toBeCloseTo(gy, 9);
    }
  });

  it("worldPxToGround inverts tileToScreen", () => {
    for (const [gx, gy] of TILES) {
      const p = tileToScreen(gx, gy);
      const g = worldPxToGround(p.x, p.y);
      expect(g.x / TILE_STEP).toBeCloseTo(gx, 6);
      expect(g.z / TILE_STEP).toBeCloseTo(gy, 6);
    }
  });
});

describe("camera3d — ortho projection parity with iso/camera 2D math", () => {
  it("projects every tile to the same screen px as worldToScreen∘tileToScreen", () => {
    for (const cam of CAMERAS) {
      for (const [gx, gy] of TILES) {
        const w = tileToScreen(gx, gy);
        const expected = worldToScreen(cam, VIEWPORT, w.x, w.y);
        const got = projectToScreen(tileToGround(gx, gy), cam, VIEWPORT);
        expect(Math.abs(got.x - expected.x)).toBeLessThan(EPS);
        expect(Math.abs(got.y - expected.y)).toBeLessThan(EPS);
      }
    }
  });

  it("vertical rise: h screen px of 3D height land exactly h px higher", () => {
    const cam = CAMERAS[1];
    const ground = tileToGround(16, 16);
    const raised = { ...ground, y: 40 * PIXEL_RISE };
    const a = projectToScreen(ground, cam, VIEWPORT);
    const b = projectToScreen(raised, cam, VIEWPORT);
    expect(a.x - b.x).toBeCloseTo(0, 9); // pure vertical rise on screen
    expect(a.y - b.y).toBeCloseTo(40, 9);
  });

  it("camera basis is orthonormal with the dimetric constants", () => {
    const { dir, right, up } = cameraBasis();
    const len = (v: { x: number; y: number; z: number }) =>
      Math.hypot(v.x, v.y, v.z);
    expect(len(dir)).toBeCloseTo(1, 12);
    expect(len(right)).toBeCloseTo(1, 12);
    expect(len(up)).toBeCloseTo(1, 12);
    // Elevation 30°: dir.y = sin(30°) = 0.5 — the 2:1 slope constant.
    expect(dir.y).toBeCloseTo(0.5, 12);
  });

  it("camera placement targets the ground under the CameraState center", () => {
    for (const cam of CAMERAS) {
      const { target, position } = cameraPlacement(cam);
      const center = projectToScreen(target, cam, VIEWPORT);
      expect(center.x).toBeCloseTo(VIEWPORT.width / 2, 6);
      expect(center.y).toBeCloseTo(VIEWPORT.height / 2, 6);
      expect(position.y).toBeGreaterThan(0);
      const c = screenToWorld(cam, VIEWPORT, VIEWPORT.width / 2, VIEWPORT.height / 2);
      const back = worldPxToGround(c.x, c.y);
      expect(back.x).toBeCloseTo(target.x, 3);
      expect(back.z).toBeCloseTo(target.z, 3);
    }
  });

  it("ortho frame maps 1 world unit to 1 screen px at zoom 1", () => {
    const f = orthoFrame({ x: 0, y: 0, zoom: 1 }, VIEWPORT);
    expect(f.right - f.left).toBeCloseTo(VIEWPORT.width, 6);
    expect(f.top - f.bottom).toBeCloseTo(VIEWPORT.height, 6);
    const z4 = orthoFrame({ x: 0, y: 0, zoom: 4 }, VIEWPORT);
    expect(z4.right - z4.left).toBeCloseTo(VIEWPORT.width / 4, 6);
  });
});
