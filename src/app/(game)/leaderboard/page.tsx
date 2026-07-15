"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerCard } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import {
  Crown,
  Users,
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
import { CreditBalance } from "@/components/CreditBalance";
import { ProfessionComboBar } from "@/components/ProfessionComboBar";
import { LeaderboardSidebars } from "@/components/LeaderboardSidebars";
import { EmpireRankStrip } from "@/components/EmpireRankStrip";
import { MassHireCard } from "@/components/MassHireCard";
import { TenSlotsCard } from "@/components/TenSlotsCard";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { useProfessionComboSelection } from "@/hooks/useProfessionComboSelection";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "@/components/OnboardingContext";
import { PROFESSIONS, PROFESSION_PERKS } from "@/lib/professions";

const SORT_OPTIONS = [
  { key: "last-online", label: "Last Online" },
  { key: "value", label: "Value" },
  { key: "credits", label: "Credits" },
  { key: "score", label: "Score" },
] as const;

const OWNER_FILTERS = [
  { key: "mine", label: "My Owned" },
  { key: "other", label: "Others Owned" },
  { key: "none", label: "No Owner" },
  { key: "owns", label: "Owns" },
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

        {/* Credit Balance - Mobile Only */}
        <div className="sm:hidden">
          <CreditBalance />
        </div>

        {/* Live Rankings — top players by empire, value, credits.
            Hidden until the player completes mission 0 (Own 20 cards). */}
        {gameUnlocked && <EmpireRankStrip />}

        {/* Live Activity sidebars — 4 compact rank lists.
            Hidden until the player completes mission 0. */}
        {gameUnlocked && <LeaderboardSidebars />}

        {/* Browse Players — the profession combo bar sits inside, just below
            the sort/filter buttons and above the card grid.
            Profession filters + combo bar are hidden until mission 0. */}
        <BrowsePlayersSection
          search={search}
          onSearch={handleSearch}
          debouncedSearch={debouncedSearch}
          gameUnlocked={gameUnlocked}
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
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("last-online");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  // Always 99 cards per page — the pinned Mass Hire card makes it an even 100.
  const pageSize = 99;
  const [ownerFilter, setOwnerFilter] = useState<"" | "mine" | "other" | "none" | "owns">("");
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [profession, setProfession] = useState("");
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
    refetchInterval: 60 * 1000,
  });
  const activePerks = new Set(perksData?.activeProfessions ?? []);

  const { data, isLoading } = useQuery({
    queryKey: [
      "players",
      debouncedSearch,
      sort,
      dir,
      pageSize,
      ownerFilter,
      playerType,
      profession,
      page,
      limit,
    ],
    queryFn: async () => {
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          sort,
          dir,
          ...(debouncedSearch && { search: debouncedSearch }),
          ...(ownerFilter && { ownerFilter }),
          ...(playerType && { playerType }),
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
    staleTime: 5 * 1000,
    refetchInterval: 20 * 1000,
  });

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
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const totalPages = data?.totalPages ?? 1;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
        {gameUnlocked && (
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-gray-500 mr-1">Profession:</span>
          {PROFESSIONS.map((p) => {
            const inCombo = comboFilledProfessions.includes(p.name);
            const perk = PROFESSION_PERKS[p.name];
            const perkActive = activePerks.has(p.name);
            return (
            <Button
              key={p.name}
              variant="ghost"
              size="sm"
              onClick={() => { play("buttons"); setProfession(profession === p.name ? "" : p.name); setPage(1); }}
              title={perk ? `${perk.name}${perkActive ? " (ACTIVE)" : ""} — ${perk.description}` : undefined}
              className={
                profession === p.name
                  ? "rounded-lg border border-amber-500/60 bg-amber-500/10 text-amber-300 font-semibold hover:bg-amber-500/15 hover:text-amber-200"
                  : inCombo
                    ? "rounded-lg border border-amber-400 bg-amber-500/25 text-amber-200 font-semibold shadow-[0_0_10px_rgba(245,158,11,0.45)] hover:bg-amber-500/30 hover:text-amber-100"
                    : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.imagePath} alt="" className="h-4 w-4 mr-1 object-contain" />
              {p.name}
              {perkActive && <Zap className="h-3 w-3 ml-1 text-green-400 fill-green-400" />}
              {inCombo && <span className="ml-1.5 text-amber-300">✓</span>}
            </Button>
            );
          })}
        </div>
        )}
        <div className="flex gap-2 flex-wrap">
          {SORT_OPTIONS.map((s) => (
            <Button
              key={s.key}
              variant="ghost"
              size="sm"
              onClick={() => {
                play("buttons");
                setSort(s.key);
                setPage(1);
              }}
              className={
                sort === s.key
                  ? "rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-cyan-300 font-semibold hover:bg-cyan-500/15 hover:text-cyan-200"
                  : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
              }
            >
              {s.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setDir(dir === "asc" ? "desc" : "asc");
              setPage(1);
            }}
            title={dir === "asc" ? "Ascending — tap for descending" : "Descending — tap for ascending"}
            className="rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-cyan-300 font-semibold hover:bg-cyan-500/15 hover:text-cyan-200"
          >
            {dir === "asc" ? <ArrowUp className="h-3.5 w-3.5 mr-1" /> : <ArrowDown className="h-3.5 w-3.5 mr-1" />}
            {dir === "asc" ? "Asc" : "Desc"}
          </Button>
          {OWNER_FILTERS.map((f) => (
            <Button
              key={f.key}
              variant="ghost"
              size="sm"
              onClick={() => {
                play("buttons");
                setOwnerFilter(ownerFilter === f.key ? "" : f.key);
                setPage(1);
              }}
              className={
                ownerFilter === f.key
                  ? "rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-cyan-300 font-semibold hover:bg-cyan-500/15 hover:text-cyan-200"
                  : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
              }
            >
              {f.key === "none" ? (
                <Crown className="h-3.5 w-3.5 mr-1" />
              ) : (
                <Users className="h-3.5 w-3.5 mr-1" />
              )}
              {f.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setPlayerType(playerType === "human" ? "" : "human");
              setPage(1);
            }}
            className={
              playerType === "human"
                ? "rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-cyan-300 font-semibold hover:bg-cyan-500/15 hover:text-cyan-200"
                : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
            }
          >
            <User className="h-3.5 w-3.5 mr-1" />
            Humans
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setPlayerType(playerType === "card" ? "" : "card");
              setPage(1);
            }}
            className={
              playerType === "card"
                ? "rounded-lg border border-cyan-500/60 bg-cyan-500/10 text-cyan-300 font-semibold hover:bg-cyan-500/15 hover:text-cyan-200"
                : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
            }
          >
            <CreditCard className="h-3.5 w-3.5 mr-1" />
            NPC
          </Button>
          {gameUnlocked && (
          <>
          {/* Profession: combo-friendly view — only carded players, ranked by
              value and interleaved across professions to build the 6-set. */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setSort(sort === "profession" ? "last-online" : "profession");
              setPage(1);
            }}
            className={
              sort === "profession"
                ? "rounded-lg border border-amber-500/60 bg-amber-500/10 text-amber-300 font-semibold hover:bg-amber-500/15 hover:text-amber-200"
                : "rounded-lg border border-gray-700 bg-transparent text-gray-400 font-semibold hover:text-white hover:border-gray-500 hover:bg-white/5"
            }
          >
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Profession
          </Button>
          </>
          )}
        </div>
      </div>

      {/* Profession combo bar — sits below the filters, above the card grid. */}
      {comboBar}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
        </div>
      ) : data?.players?.length === 0 ? (
        <Card className="border-gray-800 bg-gray-900/60">
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
            {data?.players?.map(
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
                <PlayerCard key={player.id} {...player} leaderboardMode comboSelection={comboSelection} />
              )
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-2">
              <button
                onClick={() => { play("buttons"); setPage((p) => Math.max(1, p - 1)); }}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              {getPageNumbers().map((p, i) =>
                typeof p === "string" ? (
                  <span
                    key={`ellipsis-${i}`}
                    className="px-2 text-gray-500 text-sm"
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => { play("buttons"); setPage(p); }}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                      p === page
                        ? "border-t1-500 bg-t1-600/20 text-t1-400 font-bold"
                        : "border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                onClick={() => { play("buttons"); setPage((p) => Math.min(totalPages, p + 1)); }}
                disabled={page === totalPages}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-700 bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
              <span className="text-xs text-gray-500 ml-2">
                {data?.total ?? 0} players
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
