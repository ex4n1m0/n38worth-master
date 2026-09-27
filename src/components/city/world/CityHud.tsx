"use client";

import { Check, Hammer, LocateFixed, Lock, Minus, Plus, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { getCityWorldStore, useCityWorldStore } from "@/hooks/useCityWorldStore";
import type { CitySectorInfo } from "@/lib/city/types";

/** Stable action bundle backed by the live scene (CityWorld provides it). */
export interface CityHudActions {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

/**
 * DOM HUD over the canvas world: camera controls, sector label, build-mode
 * toggle + indicator, and the live place-mode status (valid/invalid +
 * reason — the PREVIEW predicate's verdict, server stays authoritative).
 * When the camera centers on a LOCKED sector (Phase D), the sector chip is
 * followed by the server-computed unlock threshold. Real focusable buttons
 * with visible focus rings; canvas stays aria-hidden.
 */
export function CityHud({
  actions,
  onCommitPlacement,
  placementPending,
  sectorInfo,
  readOnly = false,
}: {
  actions: CityHudActions;
  /** Enter/tap commit path shared with the keyboard layer. */
  onCommitPlacement: () => void;
  placementPending: boolean;
  /** Server sector descriptors (locked threshold line). */
  sectorInfo: readonly CitySectorInfo[];
  /** Visitors (Phase F public cities) get no build-mode entry point. */
  readOnly?: boolean;
}) {
  const { t } = useLanguage();
  const { play } = useSound();
  const cameraSector = useCityWorldStore((s) => s.cameraSector);
  const lockedPeekSector = useCityWorldStore((s) => s.lockedPeekSector);
  const buildMode = useCityWorldStore((s) => s.buildMode);
  const placeMode = useCityWorldStore((s) => s.placeMode);
  const placeIssue = useCityWorldStore((s) => s.placeIssue);

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
          disabled={placementPending}
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
          disabled={placementPending}
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
          disabled={placementPending}
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </button>
        {readOnly ? null : (
          <button
            type="button"
            onClick={() => {
              play("toggle");
              getCityWorldStore().setBuildMode(!buildMode);
            }}
            aria-pressed={buildMode}
            aria-label={t.cityHudBuildMode}
            title={buildMode ? t.cityHudBuildModeOn : t.cityHudBuildModeOff}
            className={`city-world-btn ${buildMode ? "city-world-btn-active" : ""}`}
            disabled={placementPending}
          >
            <Hammer className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
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

      {placeMode ? (
        <div className="city-world-place-status" role="status">
          <span
            className={`city-world-place-dot ${placeIssue ? "city-world-place-dot-invalid" : ""}`}
            aria-hidden="true"
          />
          <span className="city-world-place-text">
            {placeIssue
              ? placeIssue === "occupied"
                ? t.cityPlaceInvalidOccupied
                : placeIssue === "sector-locked"
                  ? t.cityPlaceInvalidSector
                  : placeIssue === "reserved"
                    ? t.cityPlaceInvalidReserved
                    : t.cityPlaceInvalidBounds
              : t.cityPlaceValid}
          </span>
          <span className="city-world-place-hint">{t.cityPlaceHint}</span>
          <button
            type="button"
            onClick={() => {
              play("confirm");
              onCommitPlacement();
            }}
            disabled={placementPending || !!placeIssue}
            className="city-world-btn city-world-btn-primary"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {t.cityPlaceCommit}
          </button>
          <button
            type="button"
            onClick={() => {
              play("close");
              getCityWorldStore().endPlaceMode();
            }}
            aria-label={t.cityPlaceCancel}
            className="city-world-btn"
            disabled={placementPending}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : buildMode ? (
        <div className="city-world-place-status" role="status">
          <Hammer className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
          <span className="city-world-place-text">{t.cityHudPickupHint}</span>
        </div>
      ) : null}
    </div>
  );
}
