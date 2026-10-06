"use client";

import { useState } from "react";
import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Building2, Gem, Grid3x3, Lock, Map, TrendingUp } from "lucide-react";
import { useCityEnabled } from "@/hooks/useCityEnabled";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";
import { CityGrid } from "@/components/city/CityGrid";
import { CityWorld } from "@/components/city/world/CityWorld";
import type { CityProjection } from "@/lib/city/types";

/** /api/city/[username] response: CityProjection + owner.profession. */
type CityData = CityProjection & {
  owner: CityProjection["owner"] & { profession: string | null };
};

/** Bounded skeleton (flag loading + city query loading). */
function CitySkeleton() {
  return (
    <div className="space-y-4 py-2" aria-busy="true">
      <div className="h-6 w-52 animate-pulse rounded bg-gray-800/80" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="h-7 w-24 animate-pulse rounded-lg bg-gray-800/80"
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className="aspect-[3/4] animate-pulse rounded-xl bg-gray-800/60"
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Mainframe City — the player's OWN city (Boot Sector vertical slice).
 *
 * Pure derived view: every figure (stage, protection, portfolio, sectors,
 * goddess ownership) arrives from /api/city/[username] and is rendered
 * as-is; nothing is recomputed client-side. Live updates flow through the
 * existing Pusher ownership-changed handler invalidating ["city"] — a hire
 * constructs a new building in place.
 */
export default function CityPage() {
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { play } = useSound();
  const { cityEnabled, cityEnabledLoading } = useCityEnabled();
  const username = session?.user?.name;
  // DEV-ONLY fixture viewing (?fixture=5000 / ?fixture=six): fetch a
  // deterministic seeded city from the route's gated fixture branch instead
  // of the session user. Stripped from production builds (NODE_ENV is
  // inlined); the route itself still requires NODE_ENV=development AND
  // CITY_FIXTURES=1 server-side.
  const [fixtureUser] = useState(() => {
    if (process.env.NODE_ENV !== "development" || typeof window === "undefined") {
      return null;
    }
    const m = new URLSearchParams(window.location.search).get("fixture");
    return m && /^(\d{1,4}|six)$/.test(m) ? `fixture-${m}` : null;
  });
  const cityUser = fixtureUser ?? username;
  // World vs grid: the grid stays user-reachable so the SceneErrorBoundary
  // fallback view is never a dead end (temporary toggle, Phase B).
  const [viewMode, setViewMode] = useState<"world" | "grid">("world");

  const cityQuery = useQuery<CityData>({
    queryKey: ["city", cityUser],
    queryFn: async () => {
      // no-store: this is the OWN city — the player must see placements and
      // tier changes immediately after acting, never a heuristically cached
      // response (the CDN's s-maxage still covers public traffic elsewhere).
      const res = await fetch(`/api/city/${encodeURIComponent(cityUser!)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch city");
      return res.json();
    },
    // Skip until the flag is on and the session username exists.
    enabled: cityEnabled && !!cityUser,
    // Slow fallback poll — Pusher ownership-changed invalidates ["city"].
    refetchInterval: 120_000,
  });

  // ── Feature flag states ──
  if (cityEnabledLoading) return <CitySkeleton />;
  if (!cityEnabled) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center py-2">
        <div className="flex max-w-md items-center gap-4 rounded-xl border border-gray-800 bg-gray-900/40 p-4 sm:p-6">
          <div className="shrink-0 rounded-lg bg-gray-800/60 p-3">
            <Lock className="h-6 w-6 text-gray-500" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-300">
              {t.cityLockedTitle}
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">{t.cityLockedBody}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── City query states ──
  if (cityQuery.isPending) return <CitySkeleton />;
  if (cityQuery.isError || !cityQuery.data) {
    return (
      <p className="py-16 text-center text-sm text-gray-500">
        {t.cityLoadError}
      </p>
    );
  }

  const city = cityQuery.data;
  // Display-only sums of server-provided counts (no formula duplication).
  const totalBuildings = city.detailedCount + city.aggregatedCount;
  const goddessesOwned = city.landmarks.filter((l) => l.owned).length;

  const stats = [
    {
      icon: Building2,
      label: t.cityStatBuildings,
      value: formatCompact(totalBuildings),
    },
    {
      icon: TrendingUp,
      label: t.cityStatPortfolio,
      value: `${formatCompact(city.owner.portfolioValue)}¢`,
    },
    {
      icon: Map,
      label: t.cityStatSectors,
      value: String(city.owner.sectorsUnlocked),
    },
    {
      icon: Gem,
      label: t.cityStatGoddesses,
      value: `${goddessesOwned}/${city.landmarks.length}`,
    },
  ];

  return (
    // pb-24 on mobile: the inspector bottom sheet + floating HUD bits must
    // clear the fixed 60px bottom tab bar (image-analyst Phase E, shot 06).
    <div className="space-y-5 py-2 pb-24 md:pb-2">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Building2
            className="h-5 w-5 shrink-0 text-t1-400"
            aria-hidden="true"
          />
          <h1 className="text-lg font-bold text-white terminal-glow">
            {t.cityTitle}
          </h1>
          {city.families.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                play("toggle");
                setViewMode((mode) => (mode === "world" ? "grid" : "world"));
              }}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-[11px] font-bold text-gray-300 transition-colors hover:border-gray-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400"
              aria-pressed={viewMode === "grid"}
            >
              {viewMode === "world" ? (
                <>
                  <Grid3x3 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.cityGridToggle}
                </>
              ) : (
                <>
                  <Boxes className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.cityWorldToggle}
                </>
              )}
            </button>
          ) : null}
        </div>
        <p className="text-xs text-gray-500">{t.citySubtitle}</p>
        <div className="flex flex-wrap items-center gap-2">
          {stats.map(({ icon: Icon, label, value }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-800 bg-white/[0.03] px-2.5 py-1"
            >
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-t1-400"
                aria-hidden="true"
              />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {label}
              </span>
              <span className="text-xs font-bold tabular-nums text-white">
                {value}
              </span>
            </span>
          ))}
        </div>
      </header>

      {city.families.length === 0 ? (
        // Fresh city (0 hires): the world STILL renders below — HQ core at
        // the center, the shared universe around it — so a brand-new player
        // sees their city exist from day one. Only a slim hire hint shows;
        // the old full-empty placeholder that replaced the scene is gone.
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-800 bg-white/[0.02] px-3.5 py-2.5">
          <Building2 className="h-4 w-4 shrink-0 text-t1-400" aria-hidden="true" />
          <p className="min-w-0 text-xs text-gray-500">{t.cityEmptyBody}</p>
        </div>
      ) : null}
      {viewMode === "grid" && city.families.length > 0 ? (
        <CityGrid families={city.families} />
      ) : (
        <CityWorld projection={city} />
      )}
    </div>
  );
}
