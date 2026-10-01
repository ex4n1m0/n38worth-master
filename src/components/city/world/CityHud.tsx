"use client";

import { Boxes, Building2, LocateFixed, Lock, Minus, Moon, Plus, Sun, SunMoon } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useCityWorldStore } from "@/hooks/useCityWorldStore";
import type { CitySectorInfo } from "@/lib/city/types";

/** Stable action bundle backed by the live scene (CityWorld provides it). */
export interface CityHudActions {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** Current building art style + toggle (remounts the scene). */
  artStyle: "kit" | "procedural";
  onToggleArt: () => void;
  /** Day/night pin + cycle (applied live). */
  daylightMode: "auto" | "day" | "night";
  onCycleDaylight: () => void;
}

/**
 * DOM HUD over the canvas world: camera controls + the live sector label.
 * When the camera centers on a LOCKED sector (Phase D), the sector chip is
 * followed by the server-computed unlock threshold. Real focusable buttons
 * with visible focus rings; canvas stays aria-hidden. (The build-mode /
 * place-mode cluster is gone — placement is derived from live value order.)
 */
export function CityHud({
  actions,
  sectorInfo,
}: {
  actions: CityHudActions;
  /** Server sector descriptors (locked threshold line). */
  sectorInfo: readonly CitySectorInfo[];
}) {
  const { t } = useLanguage();
  const { play } = useSound();
  const cameraSector = useCityWorldStore((s) => s.cameraSector);
  const lockedPeekSector = useCityWorldStore((s) => s.lockedPeekSector);

  const sectorLabel =
    cameraSector === -1
      ? t.cityHudSectorBetween
      : cameraSector === 0
        ? t.cityBootSector
        : t.cityHudSector.replace("{index}", String(cameraSector));

  // Locked-sector threshold line (Phase D): shows for the CENTERED sector
  // when it is locked, or — the realistic path, since pan bounds keep the
  // camera centered on unlocked sectors — for a locked pad the player just
  // TAPPED (peek, cleared on the next camera settle). Boot's threshold is
  // null by contract, so it never shows one. Server-computed value only.
  const peekedSector =
    lockedPeekSector === null
      ? undefined
      : sectorInfo.find((s) => s.index === lockedPeekSector);
  const centeredSector =
    cameraSector < 0
      ? undefined
      : sectorInfo.find((s) => s.index === cameraSector);
  const lockedSource =
    peekedSector && !peekedSector.unlocked
      ? peekedSector
      : centeredSector && !centeredSector.unlocked
        ? centeredSector
        : undefined;
  const lockedThreshold = lockedSource?.unlockThreshold ?? null;

  return (
    <div className="city-world-hud" data-city-hud>
      <div className="city-world-hud-cluster" role="group" aria-label={t.cityHudControls}>
        <button
          type="button"
          onClick={() => {
            play("toggle");
            actions.zoomOut();
          }}
          aria-label={t.cityHudZoomOut}
          className="city-world-btn"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            play("toggle");
            actions.zoomIn();
          }}
          aria-label={t.cityHudZoomIn}
          className="city-world-btn"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            play("toggle");
            actions.reset();
          }}
          aria-label={t.cityHudResetCamera}
          className="city-world-btn"
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => {
            play("toggle");
            actions.onToggleArt();
          }}
          aria-label={`${t.cityHudArt}: ${
            actions.artStyle === "kit" ? t.cityHudArtKit : t.cityHudArtClassic
          }`}
          title={`${t.cityHudArt}: ${
            actions.artStyle === "kit" ? t.cityHudArtKit : t.cityHudArtClassic
          }`}
          aria-pressed={actions.artStyle === "kit"}
          className="city-world-btn"
        >
          {actions.artStyle === "kit" ? (
            <Building2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Boxes className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            play("toggle");
            actions.onCycleDaylight();
          }}
          aria-label={`${t.cityHudDaylight}: ${
            actions.daylightMode === "auto"
              ? t.cityHudLightAuto
              : actions.daylightMode === "day"
                ? t.cityHudLightDay
                : t.cityHudLightNight
          }`}
          title={`${t.cityHudDaylight}: ${
            actions.daylightMode === "auto"
              ? t.cityHudLightAuto
              : actions.daylightMode === "day"
                ? t.cityHudLightDay
                : t.cityHudLightNight
          }`}
          className="city-world-btn"
        >
          {actions.daylightMode === "auto" ? (
            <SunMoon className="h-4 w-4" aria-hidden="true" />
          ) : actions.daylightMode === "day" ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        <span className="city-world-sector-chip" aria-live="polite">
          {sectorLabel}
        </span>
      </div>

      {lockedThreshold !== null ? (
        <div className="city-world-sector-locked" role="status">
          <Lock className="h-3 w-3 shrink-0 text-amber-300" aria-hidden="true" />
          <span>
            {t.cityHudSectorLocked.replace(
              "{threshold}",
              lockedThreshold.toLocaleString("en-US")
            )}
          </span>
        </div>
      ) : null}
    </div>
  );
}
