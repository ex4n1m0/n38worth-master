import { describe, expect, it } from "vitest";
import {
  CULL_MARGIN,
  pointVisible,
  visibleWorldRect,
} from "@/lib/city/scene/culling";
import {
  worldToScreen,
  type CameraState,
} from "@/lib/city/scene/camera";

const VIEW = { width: 800, height: 600 };

describe("visibleWorldRect", () => {
  it("centers on the camera and spans the viewport at the zoom", () => {
    const camera: CameraState = { x: 100, y: 50, zoom: 2 };
    const r = visibleWorldRect(camera, VIEW, 0);
    expect(r.minX).toBeCloseTo(100 - 800 / (2 * 2));
    expect(r.maxX).toBeCloseTo(100 + 800 / (2 * 2));
    expect(r.minY).toBeCloseTo(50 - 600 / (2 * 2));
    expect(r.maxY).toBeCloseTo(50 + 600 / (2 * 2));
  });

  it("expands by the margin fraction mapped through the zoom", () => {
    const camera: CameraState = { x: 0, y: 0, zoom: 0.5 };
    const r = visibleWorldRect(camera, VIEW, 0.15);
    const halfW = 800 / (2 * 0.5);
    const slackX = (0.15 * 800) / 0.5;
    expect(r.minX).toBeCloseTo(-halfW - slackX);
    expect(r.maxX).toBeCloseTo(halfW + slackX);
    expect(r.minY).toBeCloseTo(-600 - 180);
    expect(r.maxY).toBeCloseTo(600 + 180);
  });

  it("defaults to the CULL_MARGIN constant", () => {
    const camera: CameraState = { x: 0, y: 0, zoom: 1 };
    expect(visibleWorldRect(camera, VIEW)).toEqual(visibleWorldRect(camera, VIEW, CULL_MARGIN));
  });

  it("round-trips with worldToScreen at the screen corners", () => {
    const camera: CameraState = { x: -40, y: 90, zoom: 1.3 };
    const r = visibleWorldRect(camera, VIEW, 0);
    const tl = worldToScreen(camera, VIEW, r.minX, r.minY);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);
    const br = worldToScreen(camera, VIEW, r.maxX, r.maxY);
    expect(br.x).toBeCloseTo(VIEW.width);
    expect(br.y).toBeCloseTo(VIEW.height);
  });
});

describe("pointVisible", () => {
  const rect = { minX: -100, minY: 0, maxX: 100, maxY: 50 };

  it("accepts points inside the rect and rejects points outside", () => {
    expect(pointVisible(rect, 0, 25)).toBe(true);
    expect(pointVisible(rect, -100, 0)).toBe(true);
    expect(pointVisible(rect, 100, 50)).toBe(true);
    expect(pointVisible(rect, 101, 25)).toBe(false);
    expect(pointVisible(rect, 0, 51)).toBe(false);
    expect(pointVisible(rect, 0, -1)).toBe(false);
  });

  it("honors the upward body margin (iso buildings rise in −y)", () => {
    // Tile base above the rect top, body 100 tall reaching INTO the rect.
    expect(pointVisible(rect, 0, -60, 100)).toBe(true);
    // Entire body far above the rect — culled.
    expect(pointVisible(rect, 0, -200, 100)).toBe(false);
    // Base below the rect bottom (below the fold) — culled.
    expect(pointVisible(rect, 0, 80, 100)).toBe(false);
  });

  it("honors the horizontal platform half-width", () => {
    expect(pointVisible(rect, 120, 25, 0, 24)).toBe(true);
    expect(pointVisible(rect, 130, 25, 0, 24)).toBe(false);
    expect(pointVisible(rect, -124, 25, 0, 24)).toBe(true);
  });
});
