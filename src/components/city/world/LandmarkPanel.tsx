"use client";

import { ExternalLink, Landmark as LandmarkIcon, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { getCityWorldStore, useCityWorldStore } from "@/hooks/useCityWorldStore";
import { cardDisplayName } from "@/lib/display-names";
import { GODDESS_USERNAMES, goddessPower } from "@/lib/goddesses";
import { LANDMARK_HEX_COLORS } from "@/lib/city/landmark-colors";
import type { CityLandmark } from "@/lib/city/types";

/**
 * The Six landmarks panel (Phase E): the goddess-collection a11y bridge.
 *
 * The canvas is aria-hidden, so this DOM list IS the landmark surface for
 * keyboard/screen-reader users: six rows (display name + owned state), tap
 * or Enter focuses the camera on the monument and selects it; the selected
 * row expands into the goddess's WORLD STATE — localized power text from
 * goddessPower (the existing, server-canonical description) + owned/dormant
 * status + profile link. Nothing here computes economy state; `owned` flags
 * arrive from the public city projection.
 */
export function LandmarkPanel({
  landmarks,
  onFocusLandmark,
}: {
  landmarks: readonly CityLandmark[];
  onFocusLandmark: (index: number) => void;
}) {
  const { t, locale } = useLanguage();
  const selectedLandmark = useCityWorldStore((s) => s.selectedLandmark);

  const ownedCount = landmarks.filter((l) => l.owned).length;
  const detail =
    selectedLandmark !== null && selectedLandmark < landmarks.length
      ? landmarks[selectedLandmark]
      : null;

  return (
    <section className="city-world-landmarks" aria-label={t.cityLandmarksTitle}>
      <header className="flex items-center gap-1.5">
        <LandmarkIcon className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-t1-300">
          {t.cityLandmarksTitle}
        </h3>
        <span className="ml-auto text-[10px] font-bold tabular-nums text-gray-500">
          {t.cityLandmarksCount.replace("{count}", String(ownedCount))}
        </span>
      </header>

      <ul className="city-world-district-list">
        {GODDESS_USERNAMES.map((username, i) => {
          const owned = landmarks[i]?.owned ?? false;
          const selected = selectedLandmark === i;
          return (
            <li key={username} className="city-world-district-row">
              <button
                type="button"
                onClick={() => {
                  getCityWorldStore().selectLandmark(selected ? null : i);
                  if (!selected) onFocusLandmark(i);
                }}
                aria-pressed={selected}
                aria-label={t.cityLandmarkFocusAria.replace(
                  "{name}",
                  cardDisplayName(username, locale)
                )}
                className={`city-landmark-row-btn ${selected ? "city-landmark-row-btn-selected" : ""}`}
              >
                <span
                  className={`city-world-district-dot ${owned ? "" : "city-landmark-dot-dormant"}`}
                  style={
                    owned
                      ? { backgroundColor: LANDMARK_HEX_COLORS[i] ?? "#7dd3fc" }
                      : undefined
                  }
                  aria-hidden="true"
                />
                <span
                  className={`min-w-0 truncate text-left text-[11px] font-semibold ${
                    owned ? "text-gray-200" : "text-gray-600"
                  }`}
                >
                  {cardDisplayName(username, locale)}
                </span>
                <span className="sr-only">
                  {owned ? t.cityLandmarkOwned : t.cityLandmarkDormant}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {detail ? (
        <div className="city-landmark-detail" role="region" aria-label={t.cityLandmarkPower}>
          <header className="flex items-start justify-between gap-2">
            <h4 className="min-w-0 truncate text-sm font-bold text-white">
              {cardDisplayName(detail.username, locale)}
            </h4>
            <button
              type="button"
              onClick={() => getCityWorldStore().selectLandmark(null)}
              aria-label={t.cityInspectorClose}
              className="city-world-btn shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>
          <p
            className={`mt-0.5 text-[11px] font-bold ${
              detail.owned ? "text-cyan-300" : "text-gray-600"
            }`}
          >
            {detail.owned ? t.cityLandmarkOwned : t.cityLandmarkDormant}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
            {goddessPower(detail.username, locale)}
          </p>
          <a
            href={`/players/${encodeURIComponent(detail.username)}`}
            className="city-world-link mt-2"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.cityLandmarkOpenProfile}
          </a>
        </div>
      ) : null}
    </section>
  );
}
