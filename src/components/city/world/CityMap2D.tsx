"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minus, Plus, Crosshair } from "lucide-react";
import { layoutWorld, landmarkCanonicalIndex, landmarkSlotForCanonical, type WorldCity, type WorldPlot } from "@/lib/city/map2d/layout";
import {
  drawPaperBackground,
  drawRoad,
  drawBuilding,
  drawHq,
  drawLandmark,
  drawPlotPad,
  drawCityLabel,
  drawProp,
  tierScale,
  AVATAR_MIN_PX,
} from "@/lib/city/map2d/draw";
import { familyStyle } from "@/lib/city/map2d/palette";
import { cityWorldStore } from "@/lib/city/scene/store";
import { professionName } from "@/lib/professions";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import type { CityWorldData } from "./CityWorld";

/**
 * THE SHARED 2D WORLD MAP (CITY_2D_WORLD_STUDY.md §3.4, style A Blueprint).
 *
 * One canvas, ONE STATIC DRAW per data/camera/avatar change — no rAF loop,
 * no sprites, no chunks, no fallback renderer. The absolute map is identical
 * for every viewer (deterministic layout from /api/city/world); the camera
 * opens on `focusUsername`'s city. Selection routes through the existing
 * cityWorldStore channels so the inspector/panels work unchanged.
 */

interface WorldPayload {
  epoch: number;
  cities: WorldCity[];
  roads: { from: string; to: string }[];
  raidHits?: { username: string; hits: number }[];
  bountyTargets?: { username: string; count: number; totalReward: number }[];
}

export interface Map2DApi {
  focusCard: (cardId: number) => void;
  focusLandmark: (index: number) => void;
  focusSatellite: (index: number) => void;
  zoomBy: (delta: number) => void;
  resetCamera: () => void;
}

// Module-level avatar cache (images survive re-renders; keyed by username).
const avatarCache = new Map<string, HTMLImageElement | null>();
let avatarRedraw: (() => void) | null = null;
let avatarRedrawTimer: ReturnType<typeof setTimeout> | null = null;

function getAvatar(username: string): HTMLImageElement | null {
  if (avatarCache.has(username)) return avatarCache.get(username) ?? null;
  avatarCache.set(username, null); // reserve the slot (load in flight)
  if (typeof window === "undefined") return null;
  const img = new Image();
  img.decoding = "async";
  img.onload = () => {
    avatarCache.set(username, img);
    if (avatarRedrawTimer) clearTimeout(avatarRedrawTimer);
    avatarRedrawTimer = setTimeout(() => avatarRedraw?.(), 60);
  };
  img.onerror = () => avatarCache.set(username, null);
  img.src = `/api/avatar/${encodeURIComponent(username)}`;
  return null;
}

export function CityMap2D({
  projection,
  focusUsername,
  apiRef,
}: {
  projection: CityWorldData;
  focusUsername: string;
  apiRef: React.MutableRefObject<Map2DApi | null>;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const { data: session } = useSession();
  const myUsername = session?.user?.name ?? null;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const camRef = useRef({ x: 0, y: 0, scale: 8 });
  const cameraInitRef = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const rafRef = useRef(0);
  const plotsRef = useRef<WorldPlot[]>([]);
  const focusPlotRef = useRef<(u: string, s?: number) => boolean>(() => false);
  const fitWorldRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  const worldQuery = useQuery<WorldPayload | null>({
    queryKey: ["city-world"],
    queryFn: async () => {
      const res = await fetch("/api/city/world");
      if (!res.ok) return null;
      return (await res.json()) as WorldPayload;
    },
    staleTime: 60_000,
    refetchInterval: 180_000,
  });

  const world = worldQuery.data ?? null;
  const plots = useMemo(() => (world ? layoutWorld(world.cities) : []), [world]);
  useEffect(() => {
    plotsRef.current = plots;
  }, [plots]);
  const plotByName = useMemo(() => {
    const m = new Map<string, WorldPlot>();
    for (const p of plots) m.set(p.username, p);
    return m;
  }, [plots]);

  const worldBounds = useMemo(() => {
    if (plots.length === 0) return null;
    let max = 0;
    for (const p of plots)
      max = Math.max(max, Math.abs(p.cx) + p.half, Math.abs(p.cy) + p.half);
    return max;
  }, [plots]);

  // ── draw (the ONLY render path — called on demand, never in a loop) ──
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    if (w === 0 || h === 0) return;
    const cam = camRef.current;

    drawPaperBackground(ctx, w, h);

    const sx = (wx: number) => (wx - cam.x) * cam.scale + w / 2;
    const sy = (wy: number) => (wy - cam.y) * cam.scale + h / 2;
    const cell = cam.scale;
    const viewL = cam.x - w / 2 / cell - 4;
    const viewR = cam.x + w / 2 / cell + 4;
    const viewT = cam.y - h / 2 / cell - 4;
    const viewB = cam.y + h / 2 / cell + 4;
    const visible = (p: WorldPlot) =>
      p.cx + p.half >= viewL && p.cx - p.half <= viewR &&
      p.cy + p.half >= viewT && p.cy - p.half <= viewB;

    if (world) {
      for (const r of world.roads) {
        const a = plotByName.get(r.from);
        const b = plotByName.get(r.to);
        if (!a || !b) continue;
        if (!visible(a) && !visible(b)) continue;
        drawRoad(ctx, sx(a.cx), sy(a.cy), sx(b.cx), sy(b.cy));
      }
    }

    const st = cityWorldStore.getState();
    const selUniv = st.selectedUniverseBuilding;
    const selCard = st.selectedCardId;
    const raidHits = new Map((world?.raidHits ?? []).map((r) => [r.username, r.hits]));
    const bountyTotal = new Map(
      (world?.bountyTargets ?? []).map((b) => [b.username, b.totalReward])
    );

    for (const p of plots) {
      if (!visible(p)) continue;
      const px = sx(p.cx);
      const py = sy(p.cy);
      const isYou = p.username === myUsername;
      const isSelectedCity = !!selUniv && selUniv.username === p.username;
      drawPlotPad(ctx, p, px, py, cell, isYou, isSelectedCity);

      // Heist visuals (derived): 24h raid damage cracks + hits badge, and an
      // open-bounty marker on cities someone is paying to hit (2026-10-01).
      const hits = raidHits.get(p.username) ?? 0;
      if (hits > 0) {
        const halfPx = p.half * cell;
        ctx.strokeStyle = "#8B2E2E";
        ctx.lineWidth = Math.max(1, cell * 0.14);
        ctx.setLineDash([]);
        for (let i = 0; i < Math.min(3, hits); i++) {
          const ox = (i - 1) * halfPx * 0.35;
          ctx.beginPath();
          ctx.moveTo(px + ox - halfPx * 0.12, py - halfPx * 0.55);
          ctx.lineTo(px + ox + halfPx * 0.08, py - halfPx * 0.2);
          ctx.lineTo(px + ox - halfPx * 0.06, py + halfPx * 0.15);
          ctx.stroke();
        }
        if (halfPx >= 26) {
          const r = Math.max(6, Math.min(11, cell));
          const bx = px - halfPx + r * 0.2;
          const by = py + halfPx - r * 0.2;
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fillStyle = "#8B2E2E";
          ctx.fill();
          ctx.strokeStyle = "#F4F1E8";
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = "#F4F1E8";
          ctx.font = `700 ${Math.round(r * 1.1)}px ui-monospace, monospace`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`×${hits}`, bx, by + 0.5);
        }
      }
      const bounty = bountyTotal.get(p.username);
      if (bounty != null && bounty > 0) {
        const halfPx = p.half * cell;
        const r = Math.max(5, Math.min(12, cell * 1.1));
        const bx = px + halfPx - r * 0.2;
        const by = py - halfPx + r * 0.2;
        if (halfPx >= 14) {
          ctx.beginPath();
          ctx.arc(bx, by, r, 0, Math.PI * 2);
          ctx.fillStyle = "#C0392B";
          ctx.fill();
          ctx.strokeStyle = "#F4F1E8";
          ctx.lineWidth = 1.4;
          ctx.stroke();
          if (r >= 7) {
            // crosshair reticle — "this city is a hunted target"
            ctx.strokeStyle = "#F4F1E8";
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(bx - r * 0.5, by);
            ctx.lineTo(bx + r * 0.5, by);
            ctx.moveTo(bx, by - r * 0.5);
            ctx.lineTo(bx, by + r * 0.5);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(bx, by, r * 0.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // Completed-album props: REAL STRUCTURES that have TAKEN THE PLACE of
      // buildings (user ruling 2026-10-02) — layoutCity already claimed one
      // fixed ring-3 cell per prop, so buildings filled around them. Drawn
      // before buildings/landmarks/HQ so those read on top where footprints
      // graze.
      if (p.layout.propCells.length > 0 && cell >= 2) {
        for (const pc of p.layout.propCells) {
          drawProp(ctx, px + pc.x * cell, py + pc.y * cell, cell * 1.15, pc.prop);
        }
      }

      for (const c of p.layout.cells) {
        const bx = px + c.x * cell;
        const by = py + c.y * cell;
        if (bx < -cell || by < -cell || bx > w + cell || by > h + cell) continue;
        const size = Math.max(1.5, tierScale(c.t) * cell);
        const avatar = size >= AVATAR_MIN_PX ? getAvatar(c.u) : null;
        drawBuilding(ctx, bx, by, size, c, avatar);
        if (isYou && selCard != null && c.id === selCard) {
          ctx.lineWidth = 2;
          ctx.strokeStyle = familyStyle(c.f).stroke;
          ctx.strokeRect(bx - size / 2 - 2, by - size / 2 - 2, size + 4, size + 4);
        }
      }

      for (const s of p.layout.landmarkSlots) {
        const lx = px + s.x * cell;
        const ly = py + s.y * cell;
        if (lx < -cell || ly < -cell || lx > w + cell || ly > h + cell) continue;
        drawLandmark(ctx, lx, ly, cell * 1.15);
      }

      const hqAvatar = cell * 2.6 >= 22 ? getAvatar(p.username) : null;
      drawHq(ctx, px, py, cell * 2.6, p.city.hqStage, hqAvatar);

      const plotPx = (p.half + 0.2) * cell;
      if (plotPx >= 70 && cell >= 3) {
        drawCityLabel(
          ctx,
          px,
          py + plotPx + 4,
          `${p.username} · ${p.city.buildings.length}`,
          Math.max(9, Math.min(13, cell * 1.1))
        );
      } else if (isSelectedCity || isYou) {
        drawCityLabel(ctx, px, py + plotPx + 3, p.username, 10);
      }
    }
  }, [world, plots, plotByName, myUsername]);

  const requestDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => {
    avatarRedraw = requestDraw;
    return () => {
      avatarRedraw = null;
    };
  }, [requestDraw]);

  useEffect(() => {
    const unsub = cityWorldStore.subscribe(() => requestDraw());
    return unsub;
  }, [requestDraw]);

  // ── camera helpers ──
  const focusPlot = useCallback((username: string, fitScale?: number): boolean => {
    const p = plotsRef.current.find((x) => x.username === username);
    const { w, h } = sizeRef.current;
    if (!p || w === 0) return false;
    const target =
      fitScale ?? Math.max(4, Math.min(26, (Math.min(w, h) * 0.8) / (2 * (p.half + 2))));
    camRef.current = { x: p.cx, y: p.cy, scale: target };
    requestDraw();
    return true;
  }, [requestDraw]);
  useEffect(() => {
    focusPlotRef.current = focusPlot;
  }, [focusPlot]);

  const fitWholeWorld = useCallback(() => {
    const { w } = sizeRef.current;
    if (!worldBounds || w === 0) return;
    camRef.current = { x: 0, y: 0, scale: (w * 0.92) / (2 * worldBounds) };
    requestDraw();
  }, [worldBounds, requestDraw]);
  useEffect(() => {
    fitWorldRef.current = fitWholeWorld;
  }, [fitWholeWorld]);

  const clampScale = useCallback(
    (s: number) =>
      Math.max(worldBounds ? (0.4 / worldBounds) * 8 : 0.05, Math.min(64, s)),
    [worldBounds]
  );

  const zoomAt = useCallback(
    (factor: number, cx?: number, cy?: number) => {
      const cam = camRef.current;
      const { w, h } = sizeRef.current;
      if (w === 0) return;
      const next = clampScale(cam.scale * factor);
      if (next === cam.scale) return;
      const px = cx ?? w / 2;
      const py = cy ?? h / 2;
      const wx = cam.x + (px - w / 2) / cam.scale;
      const wy = cam.y + (py - h / 2) / cam.scale;
      camRef.current = { scale: next, x: wx - (px - w / 2) / next, y: wy - (py - h / 2) / next };
      requestDraw();
    },
    [clampScale, requestDraw]
  );

  const initCamera = useCallback(() => {
    if (cameraInitRef.current) return;
    cameraInitRef.current = true;
    if (!focusPlotRef.current(focusUsername)) fitWorldRef.current();
    setCameraReady(true);
  }, [focusUsername]);

  // ── sizing (square 1:1, DPR-capped, camera init on first measure) ──
  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 10) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // True square side (the wrapper is square by CSS; this is a safety net).
      const side = Math.floor(Math.min(rect.width, rect.height || rect.width));
      sizeRef.current = { w: side, h: side };
      canvas.width = Math.floor(side * dpr);
      canvas.height = Math.floor(side * dpr);
      canvas.style.width = `${side}px`;
      canvas.style.height = `${side}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      setMeasured(true);
      initCamera();
      requestDraw();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [initCamera, requestDraw]);

  // When data lands (possibly after sizing), draw + init camera once.
  useEffect(() => {
    if (worldQuery.isError) setFailed(true);
    if (!world || !measured) return;
    initCamera();
    requestDraw();
  }, [world, measured, worldQuery.isError, initCamera, requestDraw]);

  // ── imperative API for the shell panels ──
  useEffect(() => {
    apiRef.current = {
      focusCard: (cardId) => {
        const mine = plotsRef.current.find(
          (p) => p.username === focusUsername && p.layout.cells.some((c) => c.id === cardId)
        );
        if (!mine) return;
        const cell = mine.layout.cells.find((c) => c.id === cardId)!;
        camRef.current = { x: mine.cx + cell.x, y: mine.cy + cell.y, scale: 40 };
        requestDraw();
      },
      focusLandmark: (index) => {
        const mine = plotsRef.current.find((p) => p.username === focusUsername);
        if (!mine) return;
        const slot = landmarkSlotForCanonical(mine.layout, mine.city, index);
        if (!slot) return;
        camRef.current = { x: mine.cx + slot.x, y: mine.cy + slot.y, scale: 40 };
        requestDraw();
      },
      focusSatellite: (index) => {
        const n = projection.neighbors[index];
        if (n) focusPlot(n.username, 26);
      },
      zoomBy: (delta) => zoomAt(delta > 0 ? 1.25 : 0.8),
      resetCamera: () => focusPlot(focusUsername) || fitWholeWorld(),
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, focusUsername, focusPlot, fitWholeWorld, zoomAt, projection.neighbors, requestDraw]);

  // ── pointer: drag pan / tap select / pinch zoom ──
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pinchRef = useRef<number | null>(null);

  const hitTest = useCallback((px: number, py: number) => {
    const cam = camRef.current;
    const { w, h } = sizeRef.current;
    const wx = cam.x + (px - w / 2) / cam.scale;
    const wy = cam.y + (py - h / 2) / cam.scale;
    for (let i = plotsRef.current.length - 1; i >= 0; i--) {
      const p = plotsRef.current[i];
      const dx = wx - p.cx;
      const dy = wy - p.cy;
      if (Math.abs(dx) > p.half + 0.3 || Math.abs(dy) > p.half + 0.3) continue;
      if (Math.abs(dx) <= 1.5 && Math.abs(dy) <= 1.5) return { kind: "hq" as const, plot: p };
      for (const s of p.layout.landmarkSlots) {
        if (Math.abs(dx - s.x) < 0.6 && Math.abs(dy - s.y) < 0.6)
          return { kind: "landmark" as const, plot: p, index: s.i };
      }
      const cell = p.layout.cells.find(
        (b) => b.x === Math.round(dx) && b.y === Math.round(dy)
      );
      if (cell) return { kind: "building" as const, plot: p, cell };
      return { kind: "plot" as const, plot: p };
    }
    return null;
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchRef.current = Math.hypot(a.x - b.x, a.y - b.y);
      dragRef.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchRef.current != null) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0 && pinchRef.current > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        zoomAt(
          dist / pinchRef.current,
          (a.x + b.x) / 2 - rect.left,
          (a.y + b.y) / 2 - rect.top
        );
      }
      pinchRef.current = dist;
      return;
    }

    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 6) {
      drag.moved = true;
    }
    const cam = camRef.current;
    camRef.current = {
      ...cam,
      x: cam.x - (e.clientX - prev.x) / cam.scale,
      y: cam.y - (e.clientY - prev.y) / cam.scale,
    };
    requestDraw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.moved) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    const store = cityWorldStore.getState();
    play("click");
    if (!hit) {
      store.select(null);
      return;
    }
    const own = hit.plot.username === focusUsername;
    if (hit.kind === "hq") {
      store.selectHq(hit.plot.username);
    } else if (hit.kind === "landmark") {
      if (own) {
        // LandmarkPanel speaks CANONICAL goddess indices — translate from
        // the owned-subset slot index (review F1).
        const canonical = landmarkCanonicalIndex(hit.plot.city, hit.index);
        if (canonical >= 0) store.selectLandmark(canonical);
      } else store.selectUniverseCity(hit.plot.username);
    } else if (hit.kind === "building") {
      if (own) store.select(hit.cell.id);
      else
        store.selectUniverseBuilding({
          username: hit.plot.username,
          cardId: hit.cell.id,
        });
    } else {
      store.selectUniverseCity(hit.plot.username);
    }
  };

  // wheel needs a native listener (passive:false to allow preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(Math.exp(-ev.deltaY * 0.0012), ev.clientX - rect.left, ev.clientY - rect.top);
    };
    canvas.addEventListener("wheel", handler, { passive: false });
    return () => canvas.removeEventListener("wheel", handler);
  }, [zoomAt]);

  const legend = useMemo(() => {
    const keys = [
      "Cryptographer",
      "Zero-Day",
      "Overclocker",
      "Cache Keeper",
      "Server Marshal",
      "Bot Herder",
    ];
    const items = keys.map((k, i) => ({
      color: familyStyle(i).fill,
      label: professionName(k, locale),
    }));
    items.push({ color: familyStyle(6).fill, label: t.catalogUnassigned });
    return items;
  }, [locale, t]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="city-map-2d-stage relative">
        {(worldQuery.isPending || !cameraReady) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-[#33506B]">
              <Crosshair className="h-5 w-5 animate-pulse" aria-hidden="true" />
              <span className="text-xs font-semibold">{t.city2dLoading}</span>
            </div>
          </div>
        )}
        {(failed || (world != null && world.cities.length === 0)) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="px-6 text-center text-sm text-[#33506B]">{t.city2dEmpty}</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t.city2dCanvasLabel}
          className="touch-none select-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="absolute right-2 top-2 z-10 flex flex-col gap-1.5">
          <MapButton
            label={t.city2dMyCity}
            onClick={() => {
              play("changepage");
              if (!focusPlot(focusUsername)) fitWholeWorld();
            }}
          />
          <MapButton
            label={t.city2dWholeMap}
            onClick={() => {
              play("changepage");
              fitWholeWorld();
            }}
          />
          <MapButton label={t.city2dZoomIn} icon={<Plus className="h-3.5 w-3.5" />} onClick={() => zoomAt(1.3)} />
          <MapButton label={t.city2dZoomOut} icon={<Minus className="h-3.5 w-3.5" />} onClick={() => zoomAt(1 / 1.3)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-gray-500">
        {legend.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px] bg-[#F5C518]" />
          {t.city2dLandmark}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[2px] border-2 border-dashed border-[#E8590C]" />
          {t.city2dYou}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#C0392B]" />
          {t.city2dBountyTarget}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#8B2E2E]" />
          {t.city2dRaided}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-[3px] border border-[#2F5226] bg-[#6FA35C]" />
          {t.city2dAlbumProp}
        </span>
      </div>
    </div>
  );
}

function MapButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-[#33506B]/30 bg-[#F4F1E8]/95 text-[10px] font-bold text-[#33506B] shadow-sm transition-colors hover:border-[#33506B]/70"
    >
      {icon ?? <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}
