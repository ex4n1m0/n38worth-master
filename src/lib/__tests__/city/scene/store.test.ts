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
    expect(s.placeMode).toBeNull();
    expect(s.buildMode).toBe(false);
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

  it("manages the ghost placement lifecycle", () => {
    const s = cityWorldStore.getState();
    s.startPlaceMode(7, { sector: "s0", x: 3, y: 4 });
    let state = cityWorldStore.getState();
    expect(state.placeMode).toEqual({ cardId: 7, tile: { sector: "s0", x: 3, y: 4 } });
    expect(state.selectedCardId).toBeNull();

    state.moveGhost(10, -10);
    expect(cityWorldStore.getState().placeMode?.tile).toEqual({ sector: "s0", x: 13, y: 0 });

    cityWorldStore.getState().setGhostTile({ sector: "s1", x: 1, y: 1 });
    expect(cityWorldStore.getState().placeMode?.tile).toEqual({ sector: "s1", x: 1, y: 1 });

    cityWorldStore.getState().setGhostValidity("occupied");
    expect(cityWorldStore.getState().placeIssue).toBe("occupied");

    cityWorldStore.getState().endPlaceMode();
    state = cityWorldStore.getState();
    expect(state.placeMode).toBeNull();
    expect(state.placeIssue).toBeNull();
    expect(state.hoverTile).toBeNull();
  });

  it("ignores ghost moves when no placement is active", () => {
    cityWorldStore.getState().moveGhost(1, 1);
    expect(cityWorldStore.getState().placeMode).toBeNull();
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

  it("toggles reduced motion and build mode", () => {
    cityWorldStore.getState().setReducedMotion(true);
    cityWorldStore.getState().setBuildMode(true);
    const s = cityWorldStore.getState();
    expect(s.reducedMotion).toBe(true);
    expect(s.buildMode).toBe(true);
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
