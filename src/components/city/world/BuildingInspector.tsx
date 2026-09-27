"use client";

import { ExternalLink, ShieldCheck, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { getCityWorldStore, useCityWorldStore } from "@/hooks/useCityWorldStore";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { formatCompact } from "@/lib/utils";
import { UNASSIGNED_FAMILY, type CityBuilding } from "@/lib/city/types";

/** All buildings the inspector can resolve: visible detail + owner queue. */
function indexBuildings(
  families: readonly { buildings: readonly CityBuilding[] }[],
  queue: readonly CityBuilding[] | null
): Map<number, CityBuilding> {
  const map = new Map<number, CityBuilding>();
  for (const family of families) {
    for (const b of family.buildings) map.set(b.cardId, b);
  }
  for (const q of queue ?? []) {
    if (!map.has(q.cardId)) map.set(q.cardId, q);
  }
  return map;
}

/**
 * DOM inspector for the selected building. SERVER-SENT state only: tier,
 * value, and protection render exactly as /api/city/[username] (plus the
 * owner-only queue route) reported them. Existing card actions live on the
 * player profile — linked out, never duplicated here.
 */
export function BuildingInspector({
  families,
  queue,
}: {
  families: readonly { profession: string; buildings: readonly CityBuilding[] }[];
  queue: readonly CityBuilding[] | null;
}) {
  const { t, locale } = useLanguage();
  const selectedCardId = useCityWorldStore((s) => s.selectedCardId);

  if (selectedCardId === null) return null;

  // Rebuilt per render is fine at ≤200 detailed + queue rows, but only when
  // a selection exists (the common path stays map-free).
  const building = indexBuildings(families, queue).get(selectedCardId);
  if (!building) return null;

  const displayName = cardDisplayName(building.username, locale);
  const protectionName =
    building.protection === "hardlock"
      ? t.cityHardLock
      : building.protection === "firewall"
        ? t.cityFirewall
        : null;

  return (
    <aside
      className="city-world-inspector"
      role="region"
      aria-label={t.cityInspectorTitle}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-white">{displayName}</h3>
          <p className="text-[11px] text-gray-500">
            {building.profession && building.profession !== UNASSIGNED_FAMILY
              ? professionName(building.profession, locale)
              : t.cityUnassignedFamily}
          </p>
        </div>
        <button
          type="button"
          onClick={() => getCityWorldStore().select(null)}
          aria-label={t.cityInspectorClose}
          className="city-world-btn shrink-0"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="font-semibold text-gray-500">{t.cityInspectorTier}</dt>
        <dd className="font-bold tabular-nums text-cyan-300">
          {t.cityInspectorTierValue.replace("{tier}", String(building.tier))}
        </dd>
        <dt className="font-semibold text-gray-500">{t.cityInspectorValue}</dt>
        <dd className="font-bold tabular-nums text-white">
          {`${formatCompact(building.value)}¢`}
        </dd>
        <dt className="font-semibold text-gray-500">{t.cityInspectorProtection}</dt>
        <dd
          className={`flex items-center gap-1 font-semibold ${
            building.protection === "hardlock"
              ? "text-amber-400"
              : building.protection === "firewall"
                ? "text-cyan-400"
                : "text-gray-500"
          }`}
        >
          {building.protection ? (
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : null}
          {protectionName ?? t.cityInspectorNone}
        </dd>
      </dl>

      <a
        href={`/players/${encodeURIComponent(building.username)}`}
        className="city-world-link mt-3"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t.cityInspectorOpenProfile}
      </a>
    </aside>
  );
}
