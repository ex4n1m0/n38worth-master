"use client";

/**
 * Buildings Catalog (2026-09-28; 2026-10-02 comprehensive rebuild — see
 * BUILDING_CATALOG_STUDY.md): every building design in the game across ALL
 * surfaces — the 2D blueprint map, the shared card art and the 3D view —
 * drawn/photographed by the exact same primitives the live views use.
 */

import { Building2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { BuildingsCatalog } from "@/components/city/catalog/BuildingsCatalog";

export default function CatalogPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="h-6 w-6 text-emerald-400" aria-hidden="true" />
          {t.catalogTitle}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{t.catalogSubtitleAll}</p>
      </div>

      <BuildingsCatalog />
    </div>
  );
}
