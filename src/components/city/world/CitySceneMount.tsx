"use client";

import { useEffect, useMemo, useRef } from "react";
import { cityWorldStore } from "@/lib/city/scene/store";
import type { CityBuilding } from "@/lib/city/types";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { cardDisplayName } from "@/lib/display-names";
import {
  MISSIONS,
  finalGoddessLabel,
  missionLabel,
} from "@/lib/missions-data";
import { formatCompact } from "@/lib/utils";
import { CityScene, type CitySceneProjection, type CitySceneStrings } from "./scene/CityScene";

interface CitySceneMountProps {
  projection: CitySceneProjection;
  queue: readonly CityBuilding[] | null;
  onSceneReady: (scene: CityScene) => void;
  onContextLost: () => void;
  /** Mount-time failure (WebGL unavailable, chunk error, init throw). */
  onError: () => void;
  /** Build-mode tap on a placed building → start relocating it. */
  onRelocate: (cardId: number) => void;
}

/**
 * The actual Pixi mount (loaded via next/dynamic ssr:false from
 * CitySceneHost, so pixi.js never enters the server bundle). Owns the
 * CityScene lifecycle plus the store↔scene wiring:
 *
 * - store.selectedCardId → scene selection visuals + floating name chip
 * - store.placeMode → ghost begin/move/end (+ PREVIEW validity reports)
 * - store.reducedMotion → motion policy swap
 * - scene taps → selection callback into the store
 * - locale-aware FX/HQ strings (i18n resolved HERE, scene gets plain text)
 *
 * Data flows DOWN only: every sync comes from react-query data via props —
 * the scene never fetches and never mutates.
 */
export default function CitySceneMount({
  projection,
  queue,
  onSceneReady,
  onContextLost,
  onError,
  onRelocate,
}: CitySceneMountProps) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<CityScene | null>(null);

  // Locale-aware strings for the imperative scene (canvas Text: HQ CORE tag,
  // tier-up flash chip, lost-signal chip, floating display names, sector
  // identity chips).
  const strings = useMemo<CitySceneStrings>(
    () => ({
      coreTag: t.cityHqCoreTag,
      lostSignalLabel: t.cityFxLostSignal,
      tierUpLabel: (tier, value) =>
        t.cityFxTierUp
          .replace("{tier}", String(tier))
          .replace("{value}", `${formatCompact(value)}¢`),
      displayName: (username) => cardDisplayName(username, locale),
      // Sector identity (Phase D): Boot keeps its fixed label; every other
      // sector is named by the mission whose completion OPENS it — the
      // server's missionTier is the mission LEVEL (= mission index + 1), so
      // the ladder index is missionTier - 1; the final sector uses the
      // dynamic-threshold label (finalGoddessLabel) matching its
      // server-computed unlockThreshold. Server values only, rendered.
      sectorLabel: (info) => {
        if (info.index === 0) return t.cityBootSector;
        const tier = info.missionTier;
        if (tier === null) return "";
        if (tier === MISSIONS.length && info.unlockThreshold !== null) {
          return finalGoddessLabel(info.unlockThreshold, locale);
        }
        return missionLabel(tier - 1, locale);
      },
    }),
    [t, locale]
  );
  const latest = useRef({ projection, queue, onRelocate, strings });

  // Latest-props ref for the mount-once create effect (ref writes belong
  // in effects, not render — react-hooks/refs).
  useEffect(() => {
    latest.current = { projection, queue, onRelocate, strings };
  });

  // ── scene lifecycle (mount once per Mount instance) ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let scene: CityScene | null = null;

    (async () => {
      try {
        const created = await CityScene.create({
          host,
          sectorCount: Math.max(1, Math.min(9, latest.current.projection.owner.sectorsUnlocked)),
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          callbacks: {
            onSelectCard: (cardId) => {
              cityWorldStore.getState().select(cardId);
              if (cardId !== null) play("buttons");
            },
            onPickup: (cardId) => latest.current.onRelocate(cardId),
            onContextLost: () => onContextLost(),
          },
        });
        if (disposed) {
          created.destroy();
          return;
        }
        scene = created;
        sceneRef.current = created;
        created.setStrings(latest.current.strings);
        created.sync(latest.current.projection, latest.current.queue);
        onSceneReady(created);
      } catch (err) {
        console.error("[city] scene init failed:", err);
        onError();
      }
    })();

    return () => {
      disposed = true;
      scene?.destroy();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once by design
  }, []);

  // ── locale changes → refresh scene strings ──
  useEffect(() => {
    sceneRef.current?.setStrings(strings);
  }, [strings]);

  // ── data → scene ──
  useEffect(() => {
    sceneRef.current?.sync(projection, queue);
  }, [projection, queue]);

  // ── store → scene ──
  useEffect(() => {
    const unsubscribe = cityWorldStore.subscribe((state, prev) => {
      const scene = sceneRef.current;
      if (!scene) return;
      if (state.selectedCardId !== prev.selectedCardId) {
        scene.setSelected(state.selectedCardId);
      }
      if (state.selectedLandmark !== prev.selectedLandmark) {
        scene.setSelectedLandmark(state.selectedLandmark);
      }
      if (state.placeMode !== prev.placeMode) {
        if (!state.placeMode) scene.endPlacement();
        else scene.beginPlacement(state.placeMode.cardId, state.placeMode.tile);
      } else if (
        state.placeMode &&
        prev.placeMode &&
        state.placeMode.tile !== prev.placeMode.tile
      ) {
        scene.updateGhost(state.placeMode.tile);
      }
      if (state.reducedMotion !== prev.reducedMotion) {
        scene.setReducedMotion(state.reducedMotion);
      }
    });
    return unsubscribe;
  }, []);

  // ── reduced-motion resolution (single media query listener) ──
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => cityWorldStore.getState().setReducedMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
      ref={hostRef}
      className="city-world-canvas-host"
      tabIndex={0}
      role="application"
      aria-label={t.cityWorldCanvasLabel}
    />
  );
}
