"use client";

/**
 * Buildings Catalog (2026-09-28, user request): the collection of every
 * building the city can render — 7 families × 7 tiers, protection states,
 * HQ core variants and the Six landmarks. Reached from the profile menu
 * ("Buildings Catalog"); auth-walled like the rest of the game shell
 * (proxy matcher). The Pixi mount is client-only (next/dynamic ssr:false,
 * same pattern as the city scene).
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Building2, Sun, Moon } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { Button } from "@/components/ui/button";
import { PROFESSIONS, professionName } from "@/lib/professions";
import { cardDisplayName } from "@/lib/display-names";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import type { CatalogStrings } from "@/components/city/catalog/BuildingsCatalogMount";

const BuildingsCatalogMount = dynamic(
  () => import("@/components/city/catalog/BuildingsCatalogMount"),
  { ssr: false }
);

export default function CatalogPage() {
  const { t, locale } = useLanguage();
  const [daylight, setDaylight] = useState(1);

  const strings = useMemo<CatalogStrings>(() => {
    const professions = PROFESSIONS.map((p) => p.name as string | null);
    const stage = (n: number) => t.catalogStage.replace("{n}", String(n));
    return {
      sectionFamiliesCivic: t.catalogSectionFamiliesCivic,
      sectionFamiliesGrand: t.catalogSectionFamiliesGrand,
      sectionProtection: t.catalogSectionProtection,
      sectionHq: t.catalogSectionHq,
      sectionLandmarks: t.catalogSectionLandmarks,
      sectionCivic: t.catalogSectionCivic,
      familyNames: [
        ...professions.map((name) => professionName(name, locale)),
        t.catalogUnassigned,
      ],
      familyProfessions: [...professions, null],
      protectionLabels: [t.catalogNoProtection, t.catalogFirewall, t.catalogHardLock],
      hqStageLabels: [stage(1), stage(2), stage(3)],
      stageLabels: [stage(1), stage(2), stage(3)],
      landmarkNames: GODDESS_USERNAMES.map((u) => cardDisplayName(u, locale)),
      unownedLabel: t.catalogUnowned,
      civicNames: [
        t.cityCivicPolice,
        t.cityCivicFire,
        t.cityCivicSchool,
        t.cityCivicHospital,
      ],
      civicTierLabels: [t.cityCivicT1, t.cityCivicT2, t.cityCivicT3],
    };
  }, [t, locale]);

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-emerald-400" aria-hidden="true" />
            {t.catalogTitle}
          </h1>
          <p className="text-sm text-gray-400 mt-1">{t.catalogSubtitle}</p>
          <p className="text-xs text-gray-500 mt-0.5">{t.catalogStageLegend}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0" role="group" aria-label={t.catalogTitle}>
          <Button
            variant={daylight >= 0.5 ? "default" : "outline"}
            size="sm"
            onClick={() => setDaylight(1)}
            aria-pressed={daylight >= 0.5}
          >
            <Sun className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t.catalogDay}
          </Button>
          <Button
            variant={daylight >= 0.5 ? "outline" : "default"}
            size="sm"
            onClick={() => setDaylight(0)}
            aria-pressed={daylight < 0.5}
          >
            <Moon className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {t.catalogNight}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden">
        <BuildingsCatalogMount strings={strings} daylight={daylight} />
      </div>

      {/* Screen-reader summary of the (canvas-rendered) catalog contents. */}
      <ul className="sr-only">
        {strings.familyNames.map((name, i) => (
          <li key={name + i}>
            {name} — T1–T14
          </li>
        ))}
      </ul>
    </div>
  );
}
