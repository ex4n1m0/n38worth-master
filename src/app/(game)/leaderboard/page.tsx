"use client";

import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlayerCard } from "@/components/PlayerCard";
import { PlayerCardSkeletonGrid } from "@/components/PlayerCardSkeleton";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Terminal,
  Users,
  UserX,
  Loader2,
  Search,
  Sparkles,
  Zap,
  ArrowUp,
  ArrowDown,
  LayoutGrid,
  ChevronDown,
} from "lucide-react";
import { GoddessCountdown } from "@/components/GoddessCountdown";
import { LockedFeature } from "@/components/LockedFeature";
import { CoachMark } from "@/components/CoachMark";
import { FilterPill } from "@/components/PlayerFilters";
import { MassHireCard } from "@/components/MassHireCard";
import { TenSlotsCard } from "@/components/TenSlotsCard";
import { RevealCard } from "@/components/RevealCard";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { useProfessionComboSelection } from "@/hooks/useProfessionComboSelection";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "@/components/OnboardingContext";
import { useLanguage } from "@/components/LanguageContext";
import { PROFESSIONS, professionName, professionPerk } from "@/lib/professions";
import { UNLOCK_GAME_THRESHOLD } from "@/lib/missions-data";

// `label` holds a dictionary key (resolved via `t[...]` at render time).
const OWNER_FILTERS = [
  { key: "other", label: "filterStealable" },
  { key: "mine", label: "filterMine" },
  { key: "none", label: "filterFree" },
  { key: "owns", label: "filterHasTeam" },
] as const;

/** localStorage key for the browse-grid density choice (4 or 8 per row). */
const GRID_COLS_KEY = "leaderboard-grid-cols";

/** Desktop grid classes per density — phones stay 2-up either way. */
const GRID_COLS_CLASS: Record<4 | 8, string> = {
  4: "grid-cols-2 lg:grid-cols-4",
  8: "grid-cols-2 md:grid-cols-4 lg:grid-cols-8",
};

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
        router.replace(`/player?u=${session.user.name}`);
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

        {/* (The ranks strip — Most Credits / Widest Grid / The Root Wall /
            Top Score / Top Portfolio / Top Value / Recent Hires / Recently
            Online — lives on the Home tab, just above Global Chat.) */}

        {/* Browse Players — sort/filter pills and the Avatar grid. Cards in
            the grid feed the GLOBAL combo (persistent ComboDock: pill in the
            mobile tab bar / desktop corner, expand with C). Profession
            filters show as a locked preview until mission 0. */}
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
            selectedProfessions: combo.slots.filter((s) => s.player !== null).map((s) => s.profession),
          } : undefined}
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
    /** Professions already filled in the combo — drives the "combo needs
     *  this profession" pulse on grid cards. */
    selectedProfessions?: string[];
  };
  comboFilledProfessions?: string[];
  gameUnlocked?: boolean;
  ownedCount?: number;
}) {
  const { t, locale } = useLanguage();
  // Default view (user-specified): all Avatars (any owner status, any type),
  // most recently online first.
  const [sort, setSort] = useState("last-online");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const { play } = useSound();
  // Browse-grid density: default 8 per row, user-selectable 4/8 (persisted).
  const [cols, setCols] = useState<4 | 8>(8);
  useEffect(() => {
    const stored = localStorage.getItem(GRID_COLS_KEY);
    if (stored === "4" || stored === "8") setCols(Number(stored) as 4 | 8);
  }, []);
  const handleColsChange = (value: 4 | 8) => {
    play("toggle");
    setCols(value);
    localStorage.setItem(GRID_COLS_KEY, String(value));
  };
  // Infinite scroll: Avatars load in batches as the user approaches the bottom
  // (no pagination). Batch of 48 ≈ a few screens ahead on desktop (4–8 cols).
  const pageSize = 48;
  const [ownerFilter, setOwnerFilter] = useState<"" | "mine" | "other" | "none" | "owns">("");
  const [profession, setProfession] = useState("");

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
      profession,
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
          ...(profession && { profession }),
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
        {gameUnlocked ? (
        <div className="flex gap-1.5 flex-wrap items-center">
          {/* Profession sort: combo-friendly view — only Avatar players, ranked
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
                ? "h-auto rounded-lg border border-amber-500/60 bg-amber-500/10 px-2.5 py-1.5 text-[13px] text-amber-300 font-semibold hover:bg-amber-500/15 hover:text-amber-200"
                : "h-auto rounded-lg border border-gray-600 bg-transparent px-2.5 py-1.5 text-[13px] text-gray-400 font-semibold hover:text-white hover:border-gray-400 hover:bg-white/5"
            }
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            {t.leaderboardProfession}
          </Button>
          {PROFESSIONS.map((p) => {
            const inCombo = comboFilledProfessions.includes(p.name);
            const perk = professionPerk(p.name, locale);
            const perkActive = activePerks.has(p.name);
            return (
            <Button
              key={p.name}
              variant="ghost"
              size="sm"
              onClick={() => { play("toggle"); setProfession(profession === p.name ? "" : p.name); }}
              title={perk ? (perkActive ? t.perkTooltipActive : t.perkTooltip).replace("{name}", perk.name).replace("{description}", perk.description) : undefined}
              className={
                profession === p.name
                  ? "h-auto rounded-lg border border-amber-500/60 bg-amber-500/10 px-2.5 py-1.5 text-[13px] text-amber-300 font-semibold hover:bg-amber-500/15 hover:text-amber-200"
                  : inCombo
                    ? "h-auto rounded-lg border border-amber-400 bg-amber-500/25 px-2.5 py-1.5 text-[13px] text-amber-200 font-semibold shadow-[0_0_10px_rgba(245,158,11,0.45)] hover:bg-amber-500/30 hover:text-amber-100"
                    : "h-auto rounded-lg border border-gray-600 bg-transparent px-2.5 py-1.5 text-[13px] text-gray-400 font-semibold hover:text-white hover:border-gray-400 hover:bg-white/5"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imagePath} alt="" className="h-4 w-4 mr-1 object-contain" />
              {professionName(p.name, locale).split(" ")[0]}
              {perkActive && <Zap className="h-3.5 w-3.5 ml-1 text-green-400 fill-green-400" />}
              {inCombo && <span className="ml-1 text-amber-300">✓</span>}
            </Button>
            );
          })}
        </div>
        ) : (
          <LockedFeature
            title={t.leaderboardProfessionFiltersTitle}
            ownedCount={ownedCount}
            threshold={UNLOCK_GAME_THRESHOLD}
          />
        )}
        {/* Filters — one compact row of sort pills + density, one row of owner
            pills (FilterPill, amber = active). Sort is single-select: tapping
            the active sort pill flips its direction. "All" makes the empty
            (no-filter) state explicit and tappable. */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-gray-500 mr-0.5">{t.leaderboardSort}</span>
          <FilterPill
            active={sort === "value"}
            onClick={() => {
              play("toggle");
              if (sort === "value") setDir((d) => (d === "asc" ? "desc" : "asc"));
              else setSort("value");
            }}
            tone="amber"
            title={t.leaderboardSortByValue}
          >
            {t.value}
            {sort === "value" && (dir === "asc" ? <ArrowUp /> : <ArrowDown />)}
          </FilterPill>
          <FilterPill
            active={sort === "last-online"}
            onClick={() => {
              play("toggle");
              if (sort === "last-online") setDir((d) => (d === "asc" ? "desc" : "asc"));
              else setSort("last-online");
            }}
            tone="amber"
            title={t.leaderboardSortByLastOnline}
          >
            {t.lastOnline}
            {sort === "last-online" && (dir === "asc" ? <ArrowUp /> : <ArrowDown />)}
          </FilterPill>
          {/* Grid density — how many Avatars per row on desktop. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={t.leaderboardAvatarsPerRow}
                aria-label={t.leaderboardAvatarsPerRowAria.replace("{count}", String(cols))}
                className="ml-auto flex h-auto items-center gap-1.5 rounded-lg border border-gray-600 bg-transparent px-2.5 py-1.5 text-[13px] font-semibold text-gray-400 hover:text-white hover:border-gray-400 hover:bg-white/5"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                {t.leaderboardPerRow.replace("{count}", String(cols))}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-900 border-gray-700">
              <DropdownMenuRadioGroup
                value={String(cols)}
                onValueChange={(v) => handleColsChange(Number(v) as 4 | 8)}
              >
                <DropdownMenuRadioItem value="4" className="text-gray-200 focus:bg-gray-800 focus:text-white">
                  {t.leaderboardPerRowCount.replace("{count}", "4")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="8" className="text-gray-200 focus:bg-gray-800 focus:text-white">
                  {t.leaderboardPerRowCount.replace("{count}", "8")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-gray-500 mr-0.5">{t.leaderboardOwner}</span>
          <FilterPill
            active={ownerFilter === ""}
            onClick={() => { play("toggle"); setOwnerFilter(""); }}
            tone="amber"
          >
            {t.leaderboardAll}
          </FilterPill>
          {OWNER_FILTERS.map((f) => (
            <FilterPill
              key={f.key}
              active={ownerFilter === f.key}
              onClick={() => { play("toggle"); setOwnerFilter(ownerFilter === f.key ? "" : f.key); }}
              tone="amber"
            >
              {f.key === "mine" ? <Terminal /> : f.key === "none" ? <UserX /> : <Users />}
              {t[f.label]}
            </FilterPill>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder={t.searchPlayers}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="pl-10 h-8 bg-transparent border-gray-800 text-white placeholder:text-gray-500 text-[13px]"
          />
        </div>
      </div>

      <CoachMark id="hire-get" className="max-w-lg">
        {t.coachGetTap} <span className="font-bold text-green-300">GET</span> {t.coachGetRest}
      </CoachMark>

      {isLoading ? (
        <PlayerCardSkeletonGrid count={12} />
      ) : players.length === 0 ? (
        <Card className="border-gray-800 bg-transparent">
          <CardContent className="py-12 text-center">
            <Users className="h-12 w-12 mx-auto mb-3 text-gray-600" />
            <p className="text-gray-400">{t.noPlayersFound}</p>
            {search && (
              <p className="text-sm text-gray-500 mt-1">
                {t.leaderboardTryDifferentSearch}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Details View ── */}
          <div className={`grid ${GRID_COLS_CLASS[cols]} gap-3`}>
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
                // content-visibility skips layout/paint for off-screen Avatars so
                // the page stays fast even with the whole collection loaded.
                <div
                  key={player.id}
                  style={{ contentVisibility: "auto", containIntrinsicSize: "auto 320px" }}
                >
                  <PlayerCard {...player} leaderboardMode showBuilding comboSelection={comboSelection} />
                </div>
              )
            )}
          </div>

          {/* Infinite-scroll sentinel — triggers the next batch ~800px early. */}
          <div ref={sentinelRef} className="h-1" />
          <div className="flex items-center justify-center py-3 text-xs text-gray-500">
            {isFetchingNextPage ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-t1-400" />
                {t.leaderboardLoadingMore}
              </span>
            ) : hasNextPage ? (
              <span>
                {t.leaderboardXofYAvatars.replace("{loaded}", String(players.length)).replace("{total}", String(total))}
              </span>
            ) : (
              <span>{t.leaderboardAllLoaded.replace("{total}", String(total))}</span>
            )}
          </div>
          {/* Clearance so the fixed desktop ComboDock pill never covers the
              last grid row / list footer. */}
          <div className="hidden md:block h-14" aria-hidden />
        </>
      )}
    </div>
  );
}
