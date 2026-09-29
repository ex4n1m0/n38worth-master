"use client";

import { Building2 } from "lucide-react";
import { useCityEnabled } from "@/hooks/useCityEnabled";
import { useLanguage } from "@/components/LanguageContext";

/**
 * "Visit {name}'s city" chip (Phase F): flag-gated link from a player's
 * profile to their public read-only city (/city/[username] — which redirects
 * to the build-mode home when the visitor IS the owner). Rendered only when
 * the city_enabled flag is on, so the entry point can ship dark.
 */
export function VisitCityLink({ username }: { username: string }) {
  const { t } = useLanguage();
  const { cityEnabled, cityEnabledLoading } = useCityEnabled();
  if (!cityEnabled || cityEnabledLoading) return null;
  return (
    <a
      href={`/city/${encodeURIComponent(username)}`}
      className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900/60 px-1.5 py-0.5 text-[11px] font-bold text-t1-300 transition-colors hover:border-t1-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400"
      aria-label={t.cityProfileVisitLink.replace("{name}", username)}
    >
      <Building2 className="h-3 w-3" aria-hidden="true" />
      {t.cityProfileVisitLink.replace("{name}", username)}
    </a>
  );
}
