"use client";

import { useSession } from "next-auth/react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerCard } from "@/components/PlayerCard";
import { PlayerCardSkeletonGrid } from "@/components/PlayerCardSkeleton";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Crown,
  Users,
  UserX,
  Loader2,
  Search,
  User,
  CreditCard,
  Sparkles,
  Zap,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { GoddessCountdown } from "@/components/GoddessCountdown";
import { LockedFeature } from "@/components/LockedFeature";
import { CoachMark } from "@/components/CoachMark";
import { FilterPill } from "@/components/PlayerFilters";
import { ProfessionComboBar } from "@/components/ProfessionComboBar";
import { EmpireRankStrip } from "@/components/EmpireRankStrip";
import { MassHireCard } from "@/components/MassHireCard";
import { TenSlotsCard } from "@/components/TenSlotsCard";
import { RevealCard } from "@/components/RevealCard";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { useProfessionComboSelection } from "@/hooks/useProfessionComboSelection";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "@/components/OnboardingContext";
import { PROFESSIONS, PROFESSION_PERKS } from "@/lib/professions";
import { UNLOCK_GAME_THRESHOLD } from "@/lib/missions-data";

const OWNER_FILTERS = [
  { key: "other", label: "Stealable" },
  { key: "mine", label: "Mine" },
  { key: "none", label: "Free" },
  { key: "owns", label: "Has Team" },
] as const;

export default function LeaderboardPage() {
  const { state: onboarding, loading: onboardingLoading } = useOnboarding();
  const { data: session } = useSession();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Profession-combo selection lives at the page level so the selection
  // survives browse pagination/filtering. Owned players in the browse grid can
  // be tapped to add them to the combo.
  const combo = useProfessionComboSelection();
  const missionLevel = useMissionLevel();
  const gameUnlocked = missionLevel >= 1;

  // Owned-card count for locked-feature previews (shares the ["missions"]
  // cache with useMissionLevel — no extra request).
  const { data: missionsData } = useQuery<{ ownedCount: number }>({
    queryKey: ["missions"],
    queryFn: async () => {
      const res = await fetch("/api/missions");
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
  });
  const ownedCount = missionsData?.ownedCount ?? 0;

  // Onboarding gate: until the user finishes the starter-NPC step, the
  // market/leaderboard is fully hidden. Send them back to their profile
  // where the avatar upload + starter-NPC cards now live.
  useEffect(() => {
    if (onboardingLoading) return;
    try {
      const isComplete = onboarding?.onboardingComplete === true;
      if (!isComplete && session?.user?.name) {
        router.replace(`/players/${session.user.name}`);
      }
    } catch (error) {
      console.error("Leaderboard onboarding redirect error:", error);
    }
  }, [onboardingLoading, onboarding?.onboardingComplete, session?.user?.name, router]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  // While we're loading state or about to redirect, render a quiet loader so
  // we don't flash the (still-locked) market UI for users mid-onboarding.
  if (onboardingLoading || onboarding?.onboardingComplete !== true) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Goddess Countdown Banner */}
        <GoddessCountdown />

        {/* Live Activity and Ranks — Recently Online, Biggest Empire, Most
            Credits, Hall of Champions in a single row.
            Locked behind mission 0 (Own 20 cards) — shown as a preview with
            the unlock condition until then. */}
        {gameUnlocked ? (
          <EmpireRankStrip variant="transparent" />
        ) : (
          <LockedFeature
            title="Ranks, live activity & Hall of Champions"
            ownedCount={ownedCount}
            threshold={UNLOCK_GAME_THRESHOLD}
          />
        )}

        {/* Browse Players — the profession combo bar sits inside, just below
            the sort/filter buttons and above the card grid.
            Profession filters + combo bar show as locked previews until mission 0. */}
        <BrowsePlayersSection
          search={search}
          onSearch={handleSearch}
          debouncedSearch={debouncedSearch}
          gameUnlocked={gameUnlocked}
          ownedCount={ownedCount}
          comboFilledProfessions={gameUnlocked ? combo.slots.filter((s) => s.player !== null).map((s) => s.profession) : []}
          comboSelection={gameUnlocked ? {
            isSelected: combo.isSelected,
            onToggle: combo.toggleSelection,
          } : undefined}
          comboBar={gameUnlocked ? <ProfessionComboBar combo={combo} /> : undefined}
        />
      </div>
    </ErrorBoundary>
  );
}

function BrowsePlayersSection({
  search,
  onSearch,
  debouncedSearch,
  comboSelection,
  comboBar,
  comboFilledProfessions = [],
  gameUnlocked = true,
  ownedCount = 0,
}: {
  search: string;
  onSearch: (value: string) => void;
  debouncedSearch: string;
  comboSelection?: {
    isSelected: (playerId: number) => boolean;
    onToggle: (
      player: {
        playerId: number;
        username: string;
        playerValue: number;
        avatarUrl: string | null;
        isNpc: number;
        valueFloor: number;
      },
      profession: string
    ) => boolean;
  };
  comboBar?: ReactNode;
  comboFilledProfessions?: string[];
  gameUnlocked?: boolean;
  ownedCount?: number;
}) {
  // Default view (user-specified): free (ownerless) cards, most recently
  // online first, all types, affordable filter off.
  const [sort, setSort] = useState("last-online");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  // Infinite scroll: cards load in batches as the user approaches the bottom
  // (no pagination). Batch of 48 ≈ a few screens ahead on desktop (4 cols).
  const pageSize = 48;
  const [ownerFilter, setOwnerFilter] = useState<"" | "mine" | "other" | "none" | "owns">("none");
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [profession, setProfession] = useState("");
  const [affordable, setAffordable] = useState(false);
  const { play } = useSound();

  const limit = pageSize;

  // Active profession perks — used to light up filter buttons and show what
  // each profession's perk does.
  const { data: perksData } = useQuery({
    queryKey: ["profession-perks"],
    queryFn: async () => {
      const res = await fetch("/api/game/profession-perks");
      if (!res.ok) throw new Error("Failed to fetch perks");
      return res.json() as Promise<{ activeProfessions: string[] }>;
    },
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
  });
  const activePerks = new Set(perksData?.activeProfessions ?? []);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: [
      "players",
      debouncedSearch,
      sort,
      dir,
      pageSize,
      ownerFilter,
      playerType,
      profession,
      affordable,
      limit,
    ],
    queryFn: async ({ pageParam }) => {
      try {
        const params = new URLSearchParams({
          page: String(pageParam),
          limit: String(limit),
          sort,
          dir,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(ownerFilter && { ownerFilter }),
          ...(playerType && { playerType }),
          ...(profession && { profession }),
          ...(affordable && { affordable: "true" }),
        });
        const res = await fetch(`/api/players?${params}`);
        if (!res.ok) throw new Error("Failed to fetch players");
        return res.json();
      } catch (error) {
        console.error("Players fetch error:", error);
        throw error;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPageParam < (lastPage.totalPages ?? 1) ? lastPageParam + 1 : undefined,
    staleTime: 30 * 1000,
    // No polling here: a deep-scrolled list would refetch EVERY loaded batch
    // on each interval (N requests per tick — Vercel cost). Updates come from
    // cache invalidation (own actions + Pusher events) instead.
    refetchOnWindowFocus: false,
  });

  const players = data?.pages.flatMap((p) => p.players ?? []) ?? [];
  const total: number = data?.pages[0]?.total ?? 0;

  // Sentinel just below the grid: when it enters the viewport (well, 800px
  // before — roughly two card-rows ahead), load the next batch.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "800px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Mass Hire card data (pinned, independent of sort/filter).
  const { data: massHireData } = useQuery<{
    cardId: number;
    ownedCount: number;
    cooldownEndsAt: number;
  }>({
    queryKey: ["mass-hire-card"],
    queryFn: async () => {
      const res = await fetch("/api/mass-hire-card");
      if (!res.ok) return { cardId: 0, ownedCount: 0, cooldownEndsAt: 0 };
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 300 * 1000,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        {gameUnlocked ? comboBar : (
          <LockedFeature
            title="Profession combos — collect all 6, sell for 10x"
            ownedCount={ownedCount}
            threshold={UNLOCK_GAME_THRESHOLD}
          />
        )}
        {gameUnlocked ? (
        <div className="flex gap-2 flex-wrap items-center">
          {/* Profession sort: combo-friendly view — only carded players, ranked
              by value and interleaved across professions to build the 6-set. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("toggle");
              setSort(sort === "profession" ? "value" : "profession");
            }}
            className={
              sort === "profession"
                ? "h-auto rounded-xl border border-amber-500/60 bg-amber-500/10 px-6 py-3 text-base text-amber-300 font-semibold hover:bg-amber-500/15 hover:text-amber-200"
                : "h-auto rounded-xl border border-gray-600 bg-transparent px-6 py-3 text-base text-gray-400 font-semibold hover:text-white hover:border-gray-400 hover:bg-white/5"
            }
          >
            <Sparkles className="h-5 w-5 mr-1" />
            Profession
          </Button>
          {PROFESSIONS.map((p) => {
            const inCombo = comboFilledProfessions.includes(p.name);
            const perk = PROFESSION_PERKS[p.name];
            const perkActive = activePerks.has(p.name);
            return (
            <Button
              key={p.name}
              variant="ghost"
              size="sm"
              onClick={() => { play("toggle"); setProfession(profession === p.name ? "" : p.name); }}
              title={perk ? `${perk.name}${perkActive ? " (ACTIVE)" : ""} — ${perk.description}` : undefined}
              className={
                profession === p.name
                  ? "h-auto rounded-xl border border-amber-500/60 bg-amber-500/10 px-6 py-3 text-base text-amber-300 font-semibold hover:bg-amber-500/15 hover:text-amber-200"
                  : inCombo
                    ? "h-auto rounded-xl border border-amber-400 bg-amber-500/25 px-6 py-3 text-base text-amber-200 font-semibold shadow-[0_0_10px_rgba(245,158,11,0.45)] hover:bg-amber-500/30 hover:text-amber-100"
                    : "h-auto rounded-xl border border-gray-600 bg-transparent px-6 py-3 text-base text-gray-400 font-semibold hover:text-white hover:border-gray-400 hover:bg-white/5"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imagePath} alt="" className="h-9 w-9 mr-2 object-contain" />
              {p.name.split(" ")[0]}
              {perkActive && <Zap className="h-5 w-5 ml-1 text-green-400 fill-green-400" />}
              {inCombo && <span className="ml-1.5 text-amber-300">✓</span>}
            </Button>
            );
          })}
        </div>
        ) : (
          <LockedFeature
            title="Profession filters & hourly perks"
            ownedCount={ownedCount}
            threshold={UNLOCK_GAME_THRESHOLD}
          />
        )}
        {/* Filters — three labeled rows, one pill style everywhere
            (FilterPill, amber = active). Sort is single-select: tapping the
            active sort pill flips its direction. "All" makes the empty
            (no-filter) state explicit and tappable. */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-gray-400 mr-1">Sort:</span>
          <FilterPill
            active={sort === "value"}
            onClick={() => {
              play("toggle");
              if (sort === "value") setDir((d) => (d === "asc" ? "desc" : "asc"));
              else setSort("value");
            }}
            tone="amber"
            title="Sort by avatar value — tap again to flip direction"
          >
            Value
            {sort === "value" && (dir === "asc" ? <ArrowUp className="h-7 w-7" /> : <ArrowDown className="h-7 w-7" />)}
          </FilterPill>
          <FilterPill
            active={sort === "last-online"}
            onClick={() => {
              play("toggle");
              if (sort === "last-online") setDir((d) => (d === "asc" ? "desc" : "asc"));
              else setSort("last-online");
            }}
            tone="amber"
            title="Sort by last online — tap again to flip direction"
          >
            Last Online
            {sort === "last-online" && (dir === "asc" ? <ArrowUp className="h-7 w-7" /> : <ArrowDown className="h-7 w-7" />)}
          </FilterPill>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-gray-400 mr-1">Owner:</span>
          <FilterPill
            active={ownerFilter === ""}
            onClick={() => { play("toggle"); setOwnerFilter(""); }}
            tone="amber"
          >
            All
          </FilterPill>
          {OWNER_FILTERS.map((f) => (
            <FilterPill
              key={f.key}
              active={ownerFilter === f.key}
              onClick={() => { play("toggle"); setOwnerFilter(ownerFilter === f.key ? "" : f.key); }}
              tone="amber"
            >
              {f.key === "mine" ? <Crown className="h-7 w-7" /> : f.key === "none" ? <UserX className="h-7 w-7" /> : <Users className="h-7 w-7" />}
              {f.label}
            </FilterPill>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base text-gray-400 mr-1">Type:</span>
          <FilterPill
            active={playerType === ""}
            onClick={() => { play("toggle"); setPlayerType(""); }}
            tone="amber"
          >
            All
          </FilterPill>
          <FilterPill
            active={playerType === "human"}
            onClick={() => { play("toggle"); setPlayerType(playerType === "human" ? "" : "human"); }}
            tone="amber"
          >
            <User className="h-7 w-7" /> Humans
          </FilterPill>
          <FilterPill
            active={playerType === "card"}
            onClick={() => { play("toggle"); setPlayerType(playerType === "card" ? "" : "card"); }}
            tone="amber"
          >
            <CreditCard className="h-7 w-7" /> NPC
          </FilterPill>
          <span className="w-px h-4 bg-gray-700 mx-1" />
          <FilterPill
            active={affordable}
            onClick={() => { play("toggle"); setAffordable((a) => !a); }}
            tone="amber"
            title="Only show avatars you can afford right now (owned avatars hidden)"
          >
            <Sparkles className="h-7 w-7" /> Affordable
          </FilterPill>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-7 w-7 text-gray-500" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10 bg-transparent border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
      </div>

      <CoachMark id="hire-get" className="max-w-lg">
        Tap <span className="font-bold text-green-300">GET</span> on an avatar to
        hire it. Each hire raises that avatar&apos;s value — and pays credits to
        the previous owner. Own avatars, then earn when others hire them from you!
      </CoachMark>

      {isLoading ? (
        <PlayerCardSkeletonGrid count={12} />
      ) : players.length === 0 ? (
        <Card className="border-gray-800 bg-transparent">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400">No players found</p>
            {search && (
              <p className="text-sm text-gray-500 mt-1">
                Try a different search term
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Details View ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Pinned Mass Hire card — always top-left on every page. */}
            {massHireData?.cardId && (
              <MassHireCard
                ownedCount={massHireData.ownedCount}
                cooldownEndsAt={massHireData.cooldownEndsAt}
              />
            )}
            {/* Pinned 10 Slots card — +10 hire slots for 10% of credits. */}
            {gameUnlocked && <TenSlotsCard />}
            {/* Pinned Reveal card — see all avatars for 10 min, 10% of credits. */}
            {gameUnlocked && <RevealCard />}
            {players.map(
              (player: {
                id: number;
                username: string;
                avatarUrl: string | null;
                playerValue: number;
                valueFloor?: number;
                ownerCount: number;
                ownedCount: number;
                credits?: number;
                portfolioValue?: number;
                isActive?: number;
                lastOnlineAt?: string | null;
                estimatedDeletionAt?: string | null;
                ownerName?: string | null;
                ownerValue?: number | null;
                purchaseCount?: number;
                bio?: string | null;
                playerType?: string;
                photoScore?: number;
                photoAuthorName?: string | null;
                photoAuthorUrl?: string | null;
                photoSourceUrl?: string | null;
                blockSellUntil?: string | null;
                permBlockUntil?: string | null;
              }) => (
                // content-visibility skips layout/paint for off-screen cards so
                // the page stays fast even with the whole collection loaded.
                <div
                  key={player.id}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "auto 420px" }}
                >
                  <PlayerCard {...player} leaderboardMode comboSelection={comboSelection} />
                </div>
              )
            )}
          </div>

          {/* Infinite-scroll sentinel — triggers the next batch ~800px early. */}
          <div ref={sentinelRef} className="h-1" />
          <div className="flex items-center justify-center py-3 text-xs text-gray-500">
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-t1-400" />
                Loading more cards…
              </span>
            ) : hasNextPage ? (
              <span>
                {players.length} of {total} cards — scroll for more
              </span>
            ) : (
              <span>All {total} cards loaded</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
