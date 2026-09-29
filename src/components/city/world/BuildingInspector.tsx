"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useLanguage } from "@/components/LanguageContext";
import { useCredits } from "@/hooks/useCredits";
import { useSound } from "@/hooks/useSound";
import { getCityWorldStore, useCityWorldStore } from "@/hooks/useCityWorldStore";
import { cardDisplayName } from "@/lib/display-names";
import { professionName } from "@/lib/professions";
import { formatCompact } from "@/lib/utils";
import { AssignProfessionDialog } from "@/components/AssignProfessionDialog";
import {
  UNASSIGNED_FAMILY,
  type CityBuilding,
  type CityNeighbor,
} from "@/lib/city/types";
import type { CityWorldData } from "./CityWorld";

/** All buildings the inspector can resolve: every visible detailed card. */
function indexBuildings(
  families: readonly { buildings: readonly CityBuilding[] }[]
): Map<number, CityBuilding> {
  const map = new Map<number, CityBuilding>();
  for (const family of families) {
    for (const b of family.buildings) map.set(b.cardId, b);
  }
  return map;
}

/** Value rank across the whole city (the orbit rule made explicit): the
 *  projection's canonical order (value desc, cardId asc) — rank 1 is the
 *  innermost ring. Recomputed per render, only while a card is selected. */
function valueRanks(
  families: readonly { buildings: readonly CityBuilding[] }[]
): Map<number, number> {
  const ranked = new Map<number, number>();
  const all = families.flatMap((f) => f.buildings);
  all
    .slice()
    .sort((a, b) => b.value - a.value || a.cardId - b.cardId)
    .forEach((b, i) => ranked.set(b.cardId, i + 1));
  return ranked;
}

/** Total detailed buildings (rank "{rank} of {total}" denominator). */
function rankTotal(
  families: readonly { buildings: readonly CityBuilding[] }[]
): number {
  let n = 0;
  for (const family of families) n += family.buildings.length;
  return n;
}

/** Resolve the selected satellite building against the neighbors payload. */
function findForeign(
  neighbors: readonly CityNeighbor[],
  sel: { owner: number; cardId: number }
): { neighbor: CityNeighbor; building: CityNeighbor["buildings"][number] } | null {
  for (const neighbor of neighbors) {
    if (neighbor.cardId !== sel.owner) continue;
    const building = neighbor.buildings.find((b) => b.cardId === sel.cardId);
    if (building) return { neighbor, building };
  }
  return null;
}

/**
 * Minimized inspector (2026-09-28 slim-bar disclosure): one slim bar instead
 * of the full bottom sheet — restore re-opens the profile, X deselects. The
 * avatar thumbnail keeps the SELECTED building identifiable while the map
 * stays fully visible.
 */
function InspectorBar({
  username,
  displayName,
  onRestore,
  onClose,
  restoreAria,
  closeAria,
  avatarAlt,
}: {
  username: string;
  displayName: string;
  onRestore: () => void;
  onClose: () => void;
  restoreAria: string;
  closeAria: string;
  avatarAlt: string;
}) {
  return (
    <aside
      className="city-world-inspector city-world-inspector-bar"
      role="region"
      aria-label={displayName}
    >
      <button
        type="button"
        onClick={onRestore}
        aria-expanded="false"
        aria-controls="city-inspector-body"
        aria-label={restoreAria}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-gray-800/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-t1-400"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- CDN avatar
            route, not a static asset; next/image adds nothing here. */}
        <img
          src={`/api/avatar/${encodeURIComponent(username)}`}
          alt={avatarAlt}
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.fallbackApplied) return;
            img.dataset.fallbackApplied = "1";
            img.src = "/NEW_HIDDEN.webp";
          }}
          className="h-5 w-5 shrink-0 rounded object-cover ring-1 ring-gray-700"
        />
        <span className="min-w-0 truncate text-xs font-bold text-white">
          {displayName}
        </span>
        <ChevronUp
          className="ml-auto h-3.5 w-3.5 shrink-0 text-gray-500"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeAria}
        className="city-world-btn shrink-0"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </aside>
  );
}

/**
 * DOM inspector for the selected building — a short avatar profile with the
 * OWNER ACTIONS from the Avatars tab: OVERCLOCK (costs 100% of the card's
 * value, doubles it → the building re-ranks toward the core on the next
 * projection) and, for NPC cards, assign/change profession (resets the card
 * to its value floor → the building sinks outward). Visitors of a public
 * city get the read-only profile only. SERVER-SENT state only: tier, value,
 * and protection render exactly as /api/city/[username] reported them;
 * actions reuse the same /api/game endpoints the Avatars tab calls.
 *
 * SATELLITE buildings (cards owned by one of the owner's owned cards) and
 * UNIVERSE-city buildings (cards inside another player's mini city on the
 * shared map) get the STEAL action instead — the exact /api/game/purchase
 * call the Avatars tab makes (firewalls, slots, credits, mission locks all
 * enforced server-side); on success the projection refetch pulls the card
 * into the home orbit.
 *
 * HQ CORES (own + foreign, 2026-09-28) open the Core HQ panel instead: the
 * city owner's profile with portfolio/sector/goddess figures and links to
 * their profile and public city. The HQ is never hireable.
 */
export function BuildingInspector({
  projection,
  isOwner,
}: {
  /** The viewed city's projection (owner page + public visits alike). */
  projection: CityWorldData;
  /** Viewer === city owner: only then are card actions offered. */
  isOwner?: boolean;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const families = projection.families;
  const neighbors = projection.neighbors;
  const selectedCardId = useCityWorldStore((s) => s.selectedCardId);
  const selectedForeign = useCityWorldStore((s) => s.selectedForeign);
  const selectedHq = useCityWorldStore((s) => s.selectedHq);
  const selectedUniverseBuilding = useCityWorldStore(
    (s) => s.selectedUniverseBuilding
  );
  // Slim-bar disclosure: minimize keeps the SELECTION (unlike X, which
  // deselects) and a NEW selection always re-opens the full sheet.
  const [minimized, setMinimized] = useState(false);
  useEffect(() => {
    setMinimized(false);
  }, [selectedCardId, selectedForeign, selectedHq, selectedUniverseBuilding]);

  const foreign =
    selectedForeign !== null && neighbors && neighbors.length > 0
      ? findForeign(neighbors, selectedForeign)
      : null;

  // Foreign city payload (2026-09-28): a foreign HQ core (satellite relay /
  // universe relay) or a universe-city building resolves against that city's
  // PUBLIC projection — the same CDN-cached /api/city/[username] the mini
  // cities lazy-load. The own city's projection arrives as a prop.
  const foreignCityUser =
    selectedHq !== null && selectedHq !== projection.owner.username
      ? selectedHq
      : selectedUniverseBuilding !== null
        ? selectedUniverseBuilding.username
        : null;
  const foreignCityQuery = useQuery<CityWorldData>({
    queryKey: ["city", foreignCityUser],
    queryFn: async () => {
      const res = await fetch(
        `/api/city/${encodeURIComponent(foreignCityUser as string)}`
      );
      if (!res.ok) throw new Error("Failed to fetch city");
      return res.json();
    },
    enabled: foreignCityUser !== null,
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
  const universeBuilding =
    selectedUniverseBuilding !== null && foreignCityQuery.data
      ? indexBuildings(foreignCityQuery.data.families).get(
          selectedUniverseBuilding.cardId
        ) ?? null
      : null;

  const pumpCost = selectedCardId !== null
    ? indexBuildings(families).get(selectedCardId)?.value ?? null
    : null;
  const canAffordPump = pumpCost !== null && (myCredits ?? 0) >= pumpCost;

  // OVERCLOCK — same endpoint/shape as the Avatars tab (OwnershipList/
  // PlayerCard): targetId = the card's user id; optimistic credits debit,
  // server is the authority. Success invalidates ["city"] so the doubled
  // value re-ranks the orbit and the building GLIDES toward the core.
  const pumpMutation = useMutation({
    mutationFn: async (targetId: number) => {
      const res = await fetch("/api/game/pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.overclockFailed);
      return data as { newValue: number; cost: number };
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined && pumpCost !== null ? old - pumpCost : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data, targetId) => {
      const building = indexBuildings(families).get(targetId);
      toast.success(
        t.overclockedToast
          .replace(
            "{name}",
            cardDisplayName(building?.username ?? "", locale)
          )
          .replace("{value}", formatCompact(data.newValue))
          .replace("{cost}", formatCompact(data.cost))
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        // Doubled value → the orbit re-ranks and the building drifts inward.
        queryClient.invalidateQueries({ queryKey: ["city"], refetchType: "active" }),
      ]);
    },
  });

  // STEAL / HIRE (satellite + universe buildings) — the Avatars tab's hire
  // call verbatim (targetId = the card's user id; blockDurationHours left at
  // its default so cost = value). Every guard is server-side; the disabled
  // states below only mirror the predictable rejections (credits,
  // co-ownership, an ACTIVE firewall on the neighbor's ownership row).
  const stealCost =
    foreign?.building.value ?? universeBuilding?.value ?? null;
  const canAffordSteal = stealCost !== null && (myCredits ?? 0) >= stealCost;

  const stealMutation = useMutation({
    mutationFn: async (v: { targetId: number; cost: number; username: string }) => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: v.targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.purchaseFailed);
      return data as {
        newValue?: number;
        targetId?: number;
        targetUsername?: string;
        countdownStarted?: boolean;
      };
    },
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - v.cost : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data, v) => {
      if (data.countdownStarted) {
        play("win");
        toast.success(t.countdownStartedTitle, {
          description: t.countdownStartedDesc,
          duration: 15000,
        });
        await queryClient.invalidateQueries();
        return;
      }
      toast.success(
        t.stolenToast
          .replace("{name}", cardDisplayName(v.username, locale))
          .replace("{value}", formatCompact(v.cost))
      );
      // Hire changed the owned-card count → the navbar mission progress and
      // slots counters must refresh (AGENTS.md instant-update rule), and the
      // ["city"] refetch moves the card into the home orbit (the satellite
      // loses it, with loss/construct FX from the diff).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["missions"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
        queryClient.invalidateQueries({ queryKey: ["city"], refetchType: "active" }),
      ]);
    },
  });

  if (
    selectedCardId === null &&
    foreign === null &&
    selectedHq === null &&
    selectedUniverseBuilding === null
  ) {
    return null;
  }

  // ── minimized: slim bar over the map, selection preserved ──────────────
  if (minimized) {
    const activeUsername =
      selectedHq ??
      selectedUniverseBuilding?.username ??
      foreign?.building.username ??
      (selectedCardId !== null
        ? indexBuildings(families).get(selectedCardId)?.username
        : undefined);
    if (!activeUsername) return null;
    return (
      <InspectorBar
        username={activeUsername}
        displayName={cardDisplayName(activeUsername, locale)}
        onRestore={() => {
          play("toggle");
          setMinimized(false);
        }}
        onClose={() =>
          selectedHq !== null
            ? getCityWorldStore().selectHq(null)
            : selectedUniverseBuilding !== null
              ? getCityWorldStore().selectUniverseBuilding(null)
              : foreign
                ? getCityWorldStore().selectForeign(null)
                : getCityWorldStore().select(null)
        }
        restoreAria={t.cityInspectorRestore}
        closeAria={t.cityInspectorClose}
        avatarAlt={t.cityInspectorAvatarAlt.replace(
          "{name}",
          cardDisplayName(activeUsername, locale)
        )}
      />
    );
  }

  // ── HQ CORE panel (own + foreign cores, 2026-09-28) ────────────────────
  if (selectedHq !== null) {
    // The VIEWED city's core resolves against the projection we already
    // hold; any other core (satellite relay / universe relay) is fetched.
    const isViewedCityCore = selectedHq === projection.owner.username;
    const city = isViewedCityCore ? projection : foreignCityQuery.data ?? null;
    const displayName = cardDisplayName(selectedHq, locale);
    return (
      <aside
        id="city-inspector-body"
        className="city-world-inspector"
        role="region"
        aria-label={t.cityHqInspectorTitle}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN avatar
                route, not a static asset; next/image adds nothing here. */}
            <img
              src={`/api/avatar/${encodeURIComponent(selectedHq)}`}
              alt={t.cityInspectorAvatarAlt.replace("{name}", displayName)}
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallbackApplied) return;
                img.dataset.fallbackApplied = "1";
                img.src = "/NEW_HIDDEN.webp";
              }}
              className="h-11 w-11 shrink-0 rounded-lg object-cover ring-2 ring-t1-500"
            />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">{displayName}</h3>
              <p className="truncate text-[11px] font-semibold tracking-widest text-t1-300">
                {t.cityHqCoreTag} · @{selectedHq}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                play("toggle");
                setMinimized(true);
              }}
              aria-label={t.cityInspectorMinimize}
              aria-expanded="true"
              aria-controls="city-inspector-body"
              className="city-world-btn"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => getCityWorldStore().selectHq(null)}
              aria-label={t.cityInspectorClose}
              className="city-world-btn"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        {!city || foreignCityQuery.isPending ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t.cityInspectorLoading}
          </p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="font-semibold text-gray-500">{t.cityStatPortfolio}</dt>
              <dd className="font-bold tabular-nums text-white">
                {`${formatCompact(city.owner.portfolioValue)}¢`}
              </dd>
              <dt className="font-semibold text-gray-500">{t.cityStatBuildings}</dt>
              <dd className="font-bold tabular-nums text-white">
                {formatCompact(city.detailedCount + city.aggregatedCount)}
              </dd>
              <dt className="font-semibold text-gray-500">{t.cityStatSectors}</dt>
              <dd className="font-bold tabular-nums text-white">
                {String(city.owner.sectorsUnlocked)}
              </dd>
              <dt className="font-semibold text-gray-500">{t.cityStatGoddesses}</dt>
              <dd className="font-bold tabular-nums text-white">
                {`${city.landmarks.filter((l) => l.owned).length}/${city.landmarks.length}`}
              </dd>
            </dl>
            <p className="mt-2 rounded-md border border-gray-800 px-2 py-1.5 text-[11px] font-bold text-gray-400">
              {isViewedCityCore && isOwner
                ? t.cityHqNoteOwn
                : t.cityHqNoteForeign.replace("{name}", displayName)}
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {!isViewedCityCore ? (
                <a
                  href={`/city/${encodeURIComponent(selectedHq)}`}
                  className="city-world-link"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {t.cityUniverseVisit}
                </a>
              ) : null}
              <a
                href={`/players/${encodeURIComponent(selectedHq)}`}
                className="city-world-link"
              >
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t.cityInspectorOpenProfile}
              </a>
            </div>
          </>
        )}
      </aside>
    );
  }

  // ── universe-city building: profile + steal (2026-09-28) ───────────────
  if (selectedUniverseBuilding !== null) {
    const cityOwnerName = cardDisplayName(selectedUniverseBuilding.username, locale);
    if (foreignCityQuery.isPending || (!universeBuilding && !foreignCityQuery.isError)) {
      return (
        <aside
          id="city-inspector-body"
          className="city-world-inspector"
          role="region"
          aria-label={t.cityInspectorTitle}
        >
          <p className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            {t.cityInspectorLoading}
          </p>
        </aside>
      );
    }
    if (!universeBuilding) {
      return (
        <aside
          id="city-inspector-body"
          className="city-world-inspector"
          role="region"
          aria-label={t.cityInspectorTitle}
        >
          <p className="text-xs text-gray-500">{t.cityInspectorUniverseGone}</p>
          <button
            type="button"
            onClick={() => getCityWorldStore().selectUniverseBuilding(null)}
            className="city-world-btn mt-2 w-full justify-center"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            {t.cityInspectorClose}
          </button>
        </aside>
      );
    }
    const building = universeBuilding;
    const displayName = cardDisplayName(building.username, locale);
    const professionLabel =
      building.profession && building.profession !== UNASSIGNED_FAMILY
        ? professionName(building.profession, locale)
        : t.cityUnassignedFamily;
    const protectionName =
      building.protection === "hardlock"
        ? t.cityHardLock
        : building.protection === "firewall"
          ? t.cityFirewall
          : null;
    const avatarRing =
      building.protection === "hardlock"
        ? "ring-amber-500"
        : building.protection === "firewall"
          ? "ring-cyan-400"
          : "ring-gray-700";
    return (
      <aside
        id="city-inspector-body"
        className="city-world-inspector"
        role="region"
        aria-label={t.cityInspectorTitle}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN avatar
                route, not a static asset; next/image adds nothing here. */}
            <img
              src={`/api/avatar/${encodeURIComponent(building.username)}`}
              alt={t.cityInspectorAvatarAlt.replace("{name}", displayName)}
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallbackApplied) return;
                img.dataset.fallbackApplied = "1";
                img.src = "/NEW_HIDDEN.webp";
              }}
              className={`h-11 w-11 shrink-0 rounded-lg object-cover ring-2 ${avatarRing}`}
            />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">{displayName}</h3>
              <p className="truncate text-[11px] text-gray-500">
                {professionLabel} · @{building.username}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                play("toggle");
                setMinimized(true);
              }}
              aria-label={t.cityInspectorMinimize}
              aria-expanded="true"
              aria-controls="city-inspector-body"
              className="city-world-btn"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => getCityWorldStore().selectUniverseBuilding(null)}
              aria-label={t.cityInspectorClose}
              className="city-world-btn"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="font-semibold text-gray-500">{t.cityInspectorCityOf}</dt>
          <dd className="truncate font-bold text-purple-300">
            {t.cityInspectorForeignCity.replace("{name}", cityOwnerName)}
          </dd>
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

        {session?.user?.name ? (
          <div className="mt-3">
            {building.protection === "hardlock" ? (
              // Market parity: hard-locked cards are locked everywhere
              // (buyPlayerCore AND purchasePlayer reject permBlockUntil).
              <p className="rounded-md border border-amber-900 px-2 py-1.5 text-[11px] font-bold text-amber-300">
                {t.cityStealHardLockNote}
              </p>
            ) : building.protection === "firewall" ? (
              <p className="rounded-md border border-cyan-900 px-2 py-1.5 text-[11px] font-bold text-cyan-300">
                {t.cityStealFirewallNote}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  play("hire");
                  stealMutation.mutate({
                    targetId: building.cardId,
                    cost: building.value,
                    username: building.username,
                  });
                }}
                disabled={!canAffordSteal || stealMutation.isPending}
                className={`flex w-full items-center justify-center gap-1 rounded-md border-2 px-1.5 py-1 text-[11px] font-bold transition-colors ${
                  canAffordSteal
                    ? "border-purple-500 bg-transparent text-white hover:bg-purple-500/15"
                    : "cursor-not-allowed border-gray-700 bg-transparent text-gray-500"
                }`}
              >
                {stealMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                {t.citySteal}
                <span className="tabular-nums">{formatCompact(building.value)}¢</span>
              </button>
            )}
          </div>
        ) : null}

        <div className="mt-3 flex flex-col gap-1.5">
          <a
            href={`/city/${encodeURIComponent(selectedUniverseBuilding.username)}`}
            className="city-world-link"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.cityUniverseVisit}
          </a>
          <a
            href={`/players/${encodeURIComponent(building.username)}`}
            className="city-world-link"
          >
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t.cityInspectorOpenProfile}
          </a>
        </div>
      </aside>
    );
  }

  // ── satellite (foreign) building: profile + steal ──────────────────────
  if (foreign) {
    const { neighbor, building } = foreign;
    const displayName = cardDisplayName(building.username, locale);
    const neighborName = cardDisplayName(neighbor.username, locale);
    const professionLabel =
      building.profession && building.profession !== UNASSIGNED_FAMILY
        ? professionName(building.profession, locale)
        : t.cityUnassignedFamily;
    const protectionName =
      building.protection === "hardlock"
        ? t.cityHardLock
        : building.protection === "firewall"
          ? t.cityFirewall
          : null;
    const avatarRing =
      building.protection === "hardlock"
        ? "ring-amber-500"
        : building.protection === "firewall"
          ? "ring-cyan-400"
          : "ring-gray-700";
    return (
      <aside
        id="city-inspector-body"
        className="city-world-inspector"
        role="region"
        aria-label={t.cityInspectorTitle}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN avatar
                route, not a static asset; next/image adds nothing here. */}
            <img
              src={`/api/avatar/${encodeURIComponent(building.username)}`}
              alt={t.cityInspectorAvatarAlt.replace("{name}", displayName)}
              width={44}
              height={44}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                if (img.dataset.fallbackApplied) return;
                img.dataset.fallbackApplied = "1";
                img.src = "/NEW_HIDDEN.webp";
              }}
              className={`h-11 w-11 shrink-0 rounded-lg object-cover ring-2 ${avatarRing}`}
            />
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-white">{displayName}</h3>
              <p className="truncate text-[11px] text-gray-500">
                {professionLabel} · @{building.username}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                play("toggle");
                setMinimized(true);
              }}
              aria-label={t.cityInspectorMinimize}
              aria-expanded="true"
              aria-controls="city-inspector-body"
              className="city-world-btn"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => getCityWorldStore().selectForeign(null)}
              aria-label={t.cityInspectorClose}
              className="city-world-btn"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="font-semibold text-gray-500">{t.cityInspectorSatelliteOf}</dt>
          <dd className="truncate font-bold text-purple-300">
            {t.cityInspectorForeignCity.replace("{name}", neighborName)}
            <span className="ml-1 font-semibold text-gray-500">
              ({formatCompact(neighbor.visibleOwnedCount)})
            </span>
          </dd>
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

        {isOwner === true ? (
          <div className="mt-3">
            {building.ownedByCityOwner ? (
              <p className="rounded-md border border-gray-700 px-2 py-1.5 text-[11px] font-bold text-gray-400">
                {t.cityStealOwnedNote}
              </p>
            ) : building.protection === "firewall" ? (
              <p className="rounded-md border border-cyan-900 px-2 py-1.5 text-[11px] font-bold text-cyan-300">
                {t.cityStealFirewallNote}
              </p>
            ) : building.protection === "hardlock" ? (
              // Market parity: hard-locked cards are locked everywhere
              // (buyPlayerCore AND purchasePlayer reject permBlockUntil).
              <p className="rounded-md border border-amber-900 px-2 py-1.5 text-[11px] font-bold text-amber-300">
                {t.cityStealHardLockNote}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  play("hire");
                  stealMutation.mutate({
                    targetId: building.cardId,
                    cost: building.value,
                    username: building.username,
                  });
                }}
                disabled={!canAffordSteal || stealMutation.isPending}
                className={`flex w-full items-center justify-center gap-1 rounded-md border-2 px-1.5 py-1 text-[11px] font-bold transition-colors ${
                  canAffordSteal
                    ? "border-purple-500 bg-transparent text-white hover:bg-purple-500/15"
                    : "cursor-not-allowed border-gray-700 bg-transparent text-gray-500"
                }`}
              >
                {stealMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                {t.citySteal}
                <span className="tabular-nums">{formatCompact(building.value)}¢</span>
              </button>
            )}
          </div>
        ) : null}

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

  // ── home-orbit building: existing profile + overclock/assign ───────────
  // Rebuilt per render is fine at ≤200 detailed rows, but only when a
  // selection exists (the common path stays map-free).
  const building = selectedCardId !== null
    ? indexBuildings(families).get(selectedCardId)
    : undefined;
  if (!building) return null;
  const rank = valueRanks(families).get(selectedCardId!) ?? null;

  const displayName = cardDisplayName(building.username, locale);
  const professionLabel =
    building.profession && building.profession !== UNASSIGNED_FAMILY
      ? professionName(building.profession, locale)
      : t.cityUnassignedFamily;
  const protectionName =
    building.protection === "hardlock"
      ? t.cityHardLock
      : building.protection === "firewall"
        ? t.cityFirewall
        : null;
  // Avatar ring mirrors the in-world protection visual (cyan firewall,
  // amber hard lock) so the popup and the building read as one object.
  const avatarRing =
    building.protection === "hardlock"
      ? "ring-amber-500"
      : building.protection === "firewall"
        ? "ring-cyan-400"
        : "ring-gray-700";
  // Owner actions exist only on the viewer's OWN city (session username ===
  // city owner), never on public visits.
  const ownerActions = isOwner === true;

  return (
    <aside
      id="city-inspector-body"
      className="city-world-inspector"
      role="region"
      aria-label={t.cityInspectorTitle}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Avatar lazy-loads from the CDN-cached /api/avatar/[username]
              route — the city payload intentionally carries no avatar URLs
              (legacy data: URI rows made inline payloads unusably large). A
              failed load (fixture NPCs, retired rows) falls back to the
              masked-placeholder art once. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- CDN avatar
              route, not a static asset; next/image adds nothing here. */}
          <img
            src={`/api/avatar/${encodeURIComponent(building.username)}`}
            alt={t.cityInspectorAvatarAlt.replace("{name}", displayName)}
            width={44}
            height={44}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallbackApplied) return;
              img.dataset.fallbackApplied = "1";
              img.src = "/NEW_HIDDEN.webp";
            }}
            className={`h-11 w-11 shrink-0 rounded-lg object-cover ring-2 ${avatarRing}`}
          />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold text-white">{displayName}</h3>
            <p className="truncate text-[11px] text-gray-500">
              {professionLabel} · @{building.username}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              play("toggle");
              setMinimized(true);
            }}
            aria-label={t.cityInspectorMinimize}
            aria-expanded="true"
            aria-controls="city-inspector-body"
            className="city-world-btn"
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => getCityWorldStore().select(null)}
            aria-label={t.cityInspectorClose}
            className="city-world-btn"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="font-semibold text-gray-500">{t.cityInspectorRank}</dt>
        <dd className="font-bold tabular-nums text-white">
          {rank !== null
            ? t.cityInspectorRankValue
                .replace("{rank}", String(rank))
                .replace("{total}", formatCompact(rankTotal(families)))
            : "—"}
        </dd>
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

      {ownerActions ? (
        <div className="mt-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              play("confirm");
              pumpMutation.mutate(building.cardId);
            }}
            disabled={!canAffordPump || pumpMutation.isPending}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md border-2 px-1.5 py-1 text-[11px] font-bold transition-colors ${
              canAffordPump
                ? "border-fuchsia-500 bg-transparent text-white hover:bg-fuchsia-500/15"
                : "cursor-not-allowed border-gray-700 bg-transparent text-gray-500"
            }`}
          >
            {pumpMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            {t.landChipOverclock}
            <span className="tabular-nums">{formatCompact(building.value)}¢</span>
          </button>
          {building.isNpc === 1 ? (
            <AssignProfessionDialog
              targetId={building.cardId}
              targetUsername={building.username}
              currentProfession={
                building.profession && building.profession !== UNASSIGNED_FAMILY
                  ? building.profession
                  : null
              }
              triggerClassName="flex-1 justify-center rounded-md border border-purple-800 bg-transparent px-1.5 py-1 text-[11px] font-bold text-purple-200 hover:bg-purple-900/30 hover:text-white h-auto"
            />
          ) : null}
        </div>
      ) : null}

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
