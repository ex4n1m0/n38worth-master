"use client";

/**
 * Buildings Catalog (2026-09-28, user request; 2026-09-30 rewrite): the
 * collection of every building the city can render — now the REAL Kenney
 * 3D kit the default Three.js renderer uses (see BuildingsCatalogMount).
 * Reached from the profile menu ("Buildings Catalog"); auth-walled like the
 * rest of the game shell (proxy matcher). The mount is client-only
 * (next/dynamic ssr:false, same pattern as the city scene — it owns a
 * WebGL context for the cell shots).
 */

import { useState } from "react";
import dynamic from "next/dynamic";
import { Building2, Sun, Moon } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { Button } from "@/components/ui/button";

const BuildingsCatalogMount = dynamic(
  () => import("@/components/city/catalog/BuildingsCatalogMount"),
  { ssr: false }
);

export default function CatalogPage() {
  const { t } = useLanguage();
  const [daylight, setDaylight] = useState(1);

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

      <BuildingsCatalogMount daylight={daylight} />
    </div>
  );
}
