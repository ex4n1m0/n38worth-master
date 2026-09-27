import { afterEach, describe, expect, it } from "vitest";
import { cityWorldStore } from "@/lib/city/scene/store";

afterEach(() => {
  cityWorldStore.getState().resetWorld();
});

describe("city world store", () => {
  it("starts from the initial snapshot", () => {
    const s = cityWorldStore.getState();
    expect(s.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(s.cameraSector).toBe(0);
    expect(s.lod).toBe("district");
    expect(s.selectedCardId).toBeNull();
    expect(s.selectedForeign).toBeNull();
    expect(s.selectedLandmark).toBeNull();
    expect(s.reducedMotion).toBe(false);
  });

  it("tracks the LOD band pushed on camera settle", () => {
    cityWorldStore.getState().setLod("world");
    expect(cityWorldStore.getState().lod).toBe("world");
    cityWorldStore.getState().setLod("close");
    expect(cityWorldStore.getState().lod).toBe("close");
  });

  it("selects and deselects buildings", () => {
    cityWorldStore.getState().select(42);
    expect(cityWorldStore.getState().selectedCardId).toBe(42);
    cityWorldStore.getState().select(null);
    expect(cityWorldStore.getState().selectedCardId).toBeNull();
  });

  it("selects goddess landmarks (one inspector at a time is scene-side)", () => {
    cityWorldStore.getState().selectLandmark(3);
    expect(cityWorldStore.getState().selectedLandmark).toBe(3);
    cityWorldStore.getState().selectLandmark(null);
    expect(cityWorldStore.getState().selectedLandmark).toBeNull();
  });

  it("selects satellite buildings by stable owner+card identity", () => {
    const sel = { owner: 9001, cardId: 42 };
    cityWorldStore.getState().selectForeign(sel);
    expect(cityWorldStore.getState().selectedForeign).toEqual(sel);
    // Replaced wholesale (stable-ref rule — no in-place mutation).
    const next = { owner: 9002, cardId: 43 };
    cityWorldStore.getState().selectForeign(next);
    expect(cityWorldStore.getState().selectedForeign).toEqual(next);
    expect(cityWorldStore.getState().selectedForeign).not.toBe(sel);
    cityWorldStore.getState().selectForeign(null);
    expect(cityWorldStore.getState().selectedForeign).toBeNull();
  });

  it("stores camera snapshots with a copied camera object", () => {
    const cam = { x: 10, y: 20, zoom: 1.5 };
    cityWorldStore.getState().setCameraSnapshot(cam, 3);
    const state = cityWorldStore.getState();
    expect(state.camera).toEqual(cam);
    expect(state.camera).not.toBe(cam); // defensive copy — stable-ref rule
    expect(state.cameraSector).toBe(3);
  });

  it("keeps a locked-sector peek through an idle settle and clears it on movement", () => {
    const cam = { x: 10, y: 20, zoom: 1.5 };
    cityWorldStore.getState().setCameraSnapshot(cam, 3);
    cityWorldStore.getState().setLockedPeek(8);
    // The tap's own pointerdown/up schedule a settle with the SAME camera —
    // that idle settle must not wipe the peek the tap just set.
    cityWorldStore.getState().setCameraSnapshot({ ...cam }, 3);
    expect(cityWorldStore.getState().lockedPeekSector).toBe(8);
    // Any real movement (position, zoom, or centered sector change) clears it.
    cityWorldStore.getState().setCameraSnapshot({ ...cam, x: 11 }, 3);
    expect(cityWorldStore.getState().lockedPeekSector).toBeNull();
    cityWorldStore.getState().setLockedPeek(7);
    cityWorldStore.getState().setCameraSnapshot({ ...cam }, 2);
    expect(cityWorldStore.getState().lockedPeekSector).toBeNull();
  });

  it("toggles reduced motion", () => {
    cityWorldStore.getState().setReducedMotion(true);
    expect(cityWorldStore.getState().reducedMotion).toBe(true);
  });

  it("notifies subscribers on state changes", () => {
    let fired = 0;
    const unsub = cityWorldStore.subscribe(() => {
      fired += 1;
    });
    cityWorldStore.getState().select(1);
    cityWorldStore.getState().select(1); // same value — zustand still notifies
    unsub();
    cityWorldStore.getState().select(2);
    expect(fired).toBe(2);
  });
});
