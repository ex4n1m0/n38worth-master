"use client";

/**
 * Buildings Catalog (2026-09-28; 2026-10-01 2D rebuild): every building the
 * SHARED 2D BLUEPRINT MAP can render, drawn by the exact same map2d
 * primitives (Catalog2D) — families × tiers, protection states, HQ stages,
 * Founder landmarks. No WebGL, no kit assets, always day.
 */

import { Building2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { Catalog2D } from "@/components/city/catalog/Catalog2D";

export default function CatalogPage() {
  const { t } = useLanguage();

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="h-6 w-6 text-emerald-400" aria-hidden="true" />
          {t.catalogTitle}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{t.catalogSubtitle2d}</p>
        <p className="text-xs text-gray-500 mt-0.5">{t.catalogStageLegend}</p>
      </div>

      <Catalog2D />
    </div>
  );
}
