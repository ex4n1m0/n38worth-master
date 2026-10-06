"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useQuery } from "@tanstack/react-query";
import { Building2, Share2 } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { useCityEnabled } from "@/hooks/useCityEnabled";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { Lock } from "lucide-react";
import { CityWorld, type CityWorldData } from "@/components/city/world/CityWorld";

/**
 * Public read-only visit of another player's Mainframe City (Phase F).
 *
 * - Same public CDN-cached projection as the owner view
 *   (GET /api/city/[username]) — the owner-only extras (placement queue,
 *   build mode, my-layout fetch) are structurally absent for visitors:
 *   CityWorld's isOwner comparison keeps every mutation surface off.
 * - Visiting YOUR OWN username redirects to /city (the build-mode home).
 * - One fire-and-forget city-visit beacon per mount (self-visits excluded)
 *   rides the existing self-hosted analytics conventions.
 */
export function PublicCityView({ username }: { username: string }) {
  const { t } = useLanguage();
  const { play } = useSound();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { cityEnabled, cityEnabledLoading } = useCityEnabled();
  const isSelf = session?.user?.name === username;
  const beaconSent = useRef(false);

  const cityQuery = useQuery<CityWorldData>({
    queryKey: ["city", username],
    queryFn: async () => {
      const res = await fetch(`/api/city/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error("Failed to fetch city");
      return res.json();
    },
    enabled: cityEnabled && !!username && !isSelf,
    refetchInterval: 120_000,
  });

  // Self-visit → the canonical build-mode home (client-side: the session is
  // only known after hydration; the redirect is idempotent).
  useEffect(() => {
    if (isSelf) router.replace("/city");
  }, [isSelf, router]);

  // One beacon per mount, never for self-visits. Two guards close review
  // findings: wait for the session to resolve (a hard self-visit load would
  // otherwise record while isSelf is still false) and only count cities
  // that actually loaded (404/hidden usernames record nothing).
  useEffect(() => {
    if (beaconSent.current || isSelf || !cityEnabled) return;
    if (sessionStatus === "loading") return;
    if (!cityQuery.isSuccess) return;
    beaconSent.current = true;
    try {
      navigator.sendBeacon?.(
        "/api/analytics/city-visit",
        new Blob(
          [JSON.stringify({ username, path: `/city/visit?u=${username}` })],
          { type: "application/json" }
        )
      );
    } catch {
      /* analytics must never break the page */
    }
  }, [username, isSelf, cityEnabled, sessionStatus, cityQuery.isSuccess]);

  const onShare = async () => {
    play("toggle");
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "n38worth", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.info(t.cityPublicShareCopied);
      }
    } catch {
      /* user dismissed the share sheet — not an error */
    }
  };

  if (cityEnabledLoading || isSelf) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center py-2">
        <div className="h-6 w-52 animate-pulse rounded bg-gray-800/80" aria-busy="true" />
      </div>
    );
  }

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

  if (cityQuery.isPending) {
    return (
      <div className="space-y-4 py-2" aria-busy="true">
        <div className="h-7 w-72 animate-pulse rounded bg-gray-800/80" />
        <div className="h-[60vh] animate-pulse rounded-xl bg-gray-900/60" />
      </div>
    );
  }

  if (cityQuery.isError || !cityQuery.data) {
    return (
      <p className="py-16 text-center text-sm text-gray-500">
        {t.cityPublicNotFound}
      </p>
    );
  }

  return (
    <div className="space-y-4 py-2 pb-24 md:pb-2">
      <header className="flex flex-wrap items-center gap-2">
        <Building2 className="h-5 w-5 shrink-0 text-t1-400" aria-hidden="true" />
        <h1 className="text-lg font-bold text-white terminal-glow">
          {t.cityPublicBanner.replace("{name}", username)}
        </h1>
        <button
          type="button"
          onClick={onShare}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-[11px] font-bold text-gray-300 transition-colors hover:border-gray-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400"
          aria-label={t.cityPublicShare}
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t.cityPublicShare}
        </button>
      </header>
      <CityWorld projection={cityQuery.data} />
    </div>
  );
}
