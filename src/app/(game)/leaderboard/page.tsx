"use client";

import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerCard } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MyProfileCard } from "@/components/MyProfileCard";
import { LoginReward } from "@/components/LoginReward";
import { useCredits } from "@/hooks/useCredits";
import { toast } from "sonner";
import {
  Crown,
  Users,
  Loader2,
  Search,
  User,
  CreditCard,
  LayoutGrid,
  List,
  ShoppingCart,
  Target,
} from "lucide-react";
import Link from "next/link";
import { PortfolioRewardCountdown } from "@/components/PortfolioRewardCountdown";
import { RankBonusCountdown } from "@/components/RankBonusCountdown";
import { RandomPlayerCountdown } from "@/components/RandomPlayerCountdown";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "@/components/OnboardingContext";
import { formatNumber } from "@/lib/utils";

const SORT_OPTIONS = [
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "credits", label: "Credits" },
  { key: "most-players", label: "Most Players" },
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name" },
] as const;

// Compact buy button for mosaic cards
function MosaicBuyButton({
  targetId,
  targetUsername,
  cost,
  disabled,
}: {
  targetId: number;
  targetUsername: string;
  cost: number;
  disabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const { play } = useSound();

  const handleBuy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isPending) return;
    play("buy");

    setIsPending(true);
    try {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      toast.success(
        `You bought ${targetUsername}! Their value is now ${data.newValue} 💰`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      onClick={handleBuy}
      disabled={disabled || isPending}
      className={`flex items-center gap-0.5 sm:gap-1 px-2 sm:px-4 md:px-6 py-1.5 sm:py-2 md:py-3 rounded text-[14px] sm:text-[20px] md:text-[28px] lg:text-[36px] font-semibold transition-all ${
        disabled
          ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
          : "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white shadow-sm"
      }`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 md:h-6 md:w-6 lg:h-9 lg:w-9 animate-spin" />
      ) : (
        <>
          <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 md:h-6 md:w-6 lg:h-9 lg:w-9" />
          <span>{formatNumber(cost)}¢</span>
        </>
      )}
    </button>
  );
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const { state: onboarding, loading: onboardingLoading, refresh: refreshOnboarding } = useOnboarding();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  return (
    <div className="space-y-6">
      {/* Onboarding Progress Banner */}
      {onboarding.avatarCompleted && !onboarding.onboardingComplete && (
        <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/40 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Target className="h-5 w-5 text-blue-400" />
            <p className="text-blue-200 text-lg font-bold">
              Acquire 3 Starter NPCs to unlock the full game
            </p>
          </div>
          <p className="text-blue-300 text-sm">
            Progress: {onboarding.starterNpcOwnedCount}/3 acquired
          </p>
        </div>
      )}

      {/* Starter NPCs Section */}
      {onboarding.avatarCompleted &&
        !onboarding.onboardingComplete &&
        onboarding.starterNpcIds.length > 0 && (
          <StarterNpcsSection
            npcIds={onboarding.starterNpcIds}
            ownedCount={onboarding.starterNpcOwnedCount}
            onPurchase={refreshOnboarding}
          />
        )}

      {/* Rest of page content - hidden until onboarding is complete (show during loading to avoid flash for existing users) */}
      {(onboardingLoading || onboarding.onboardingComplete) && (
        <>
          {/* Buy Tip Message - Below Navigation */}
          <div className="bg-gradient-to-r from-t1-900/30 to-t2-900/30 border border-t1-500/30 rounded-lg p-6 text-center">
            <p className="text-t1-300 text-xl sm:text-2xl md:text-3xl font-bold">
              Own the best. Earn the most.
            </p>
            <p className="text-t2-400/70 text-xs sm:text-sm mt-2">
              Player Value is multiplied by the number of owned players for the portfolio reward calculation.
            </p>
          </div>

          {/* My Profile Card */}
          {session?.user?.name && <MyProfileCard />}

          {/* Login Reward */}
          <LoginReward />

          {/* Cron Countdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <PortfolioRewardCountdown />
            <RankBonusCountdown />
            <RandomPlayerCountdown />
          </div>

          {/* Browse Players */}
          <BrowsePlayersSection
            search={search}
            onSearch={handleSearch}
            debouncedSearch={debouncedSearch}
          />
        </>
      )}
    </div>
  );
}

// Starter NPCs Section for onboarding
function StarterNpcsSection({
  npcIds,
  ownedCount,
  onPurchase,
}: {
  npcIds: number[];
  ownedCount: number;
  onPurchase: () => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { play } = useSound();

  const { data: npcs, isLoading } = useQuery({
    queryKey: ["starter-npcs", npcIds],
    queryFn: async () => {
      const results = await Promise.all(
        npcIds.map(async (id) => {
          const res = await fetch(`/api/players/id/${id}`);
          if (!res.ok) return null;
          return res.json();
        })
      );
      return results.filter(Boolean);
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-t1-400" />
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-cyan-900/20 to-blue-900/20 border border-cyan-500/30 rounded-lg p-4">
      <h3 className="text-cyan-300 font-bold text-lg mb-3 flex items-center gap-2">
        <Target className="h-5 w-5" />
        Starter NPCs ({ownedCount}/3 acquired)
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {npcs?.map((npc: { id: number; username: string; avatarUrl: string | null; playerValue: number; credits?: number }) => (
          <StarterNpcCard
            key={npc.id}
            npc={npc}
            ownedCount={ownedCount}
            onPurchase={onPurchase}
          />
        ))}
      </div>
      {npcIds.length < 3 && (
        <p className="text-yellow-400 text-sm mt-2 text-center">
          ⚠️ Only {npcIds.length} NPCs available under $20. Check back later!
        </p>
      )}
    </div>
  );
}

// Individual starter NPC card
function StarterNpcCard({
  npc,
  ownedCount,
  onPurchase,
}: {
  npc: { id: number; username: string; avatarUrl: string | null; playerValue: number; credits?: number };
  ownedCount: number;
  onPurchase: () => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const [isPending, setIsPending] = useState(false);
  const { data: credits } = useCredits();

  const canAfford = (credits ?? 0) >= npc.playerValue;

  const handleBuy = async () => {
    if (!canAfford || isPending) return;
    play("buy");
    setIsPending(true);
    try {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: npc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      toast.success(`You bought ${npc.username}! 🎉`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["starter-npcs"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
      ]);
      onPurchase();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Card className="border-cyan-500/30 bg-gray-900/80">
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={npc.avatarUrl || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-sm font-bold">
              {npc.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm truncate">
              {npc.username}
            </p>
            <p className="text-gray-400 text-xs">{formatNumber(npc.playerValue)}¢</p>
          </div>
          <Button
            size="sm"
            onClick={handleBuy}
            disabled={!canAfford || isPending}
            className={`shrink-0 ${
              canAfford
                ? "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white"
                : "bg-gray-700 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <ShoppingCart className="h-3 w-3 mr-1" />
                {formatNumber(npc.playerValue)}¢
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BrowsePlayersSection({
  search,
  onSearch,
  debouncedSearch,
}: {
  search: string;
  onSearch: (value: string) => void;
  debouncedSearch: string;
}) {
  const { data: session } = useSession();
  const { data: credits } = useCredits();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("last-online");
  const [hasOwner, setHasOwner] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [viewMode, setViewMode] = useState<"mosaic" | "details">("details");
  const { play } = useSound();

  const currentUsername = session?.user?.name;
  const limit = viewMode === "mosaic" ? 18 : 9;

  const { data, isLoading } = useQuery({
    queryKey: [
      "players",
      debouncedSearch,
      sort,
      hasOwner,
      hasPlayers,
      playerType,
      page,
      limit,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(hasOwner && { hasOwner: "true" }),
        ...(hasPlayers && { hasPlayers: "true" }),
        ...(playerType && { playerType }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    staleTime: 5 * 1000,
    refetchInterval: 20 * 1000,
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
        <div className="flex gap-2 flex-wrap">
          {/* View mode toggle */}
          {viewMode === "mosaic" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { play("buttons"); setViewMode("details"); setPage(1); }}
              className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <List className="h-4 w-4 mr-1" />
              Details
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { play("buttons"); setViewMode("mosaic"); setPage(1); }}
              className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              Mosaic
            </Button>
          )}
          {SORT_OPTIONS.map((s) => (
            <Button
              key={s.key}
              variant={sort === s.key ? "default" : "outline"}
              size="sm"
              onClick={() => {
                play("buttons");
                setSort(s.key);
                setPage(1);
              }}
              className={
                sort === s.key
                  ? "bg-t1-600 hover:bg-t1-500 text-white"
                  : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
              }
            >
              {s.label}
            </Button>
          ))}
          <Button
            variant={hasOwner ? "default" : "outline"}
            size="sm"
            onClick={() => {
              play("buttons");
              setHasOwner(!hasOwner);
              setPage(1);
            }}
            className={
              hasOwner
                ? "bg-amber-600 hover:bg-amber-500 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }
          >
            <Crown className="h-3.5 w-3.5 mr-1" />
            Has Owner
          </Button>
          <Button
            variant={hasPlayers ? "default" : "outline"}
            size="sm"
            onClick={() => {
              play("buttons");
              setHasPlayers(!hasPlayers);
              setPage(1);
            }}
            className={
              hasPlayers
                ? "bg-purple-600 hover:bg-purple-500 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            Has Players
          </Button>
          <Button
            variant={playerType === "human" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              play("buttons");
              setPlayerType(playerType === "human" ? "" : "human");
              setPage(1);
            }}
            className={
              playerType === "human"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }
          >
            <User className="h-3.5 w-3.5 mr-1" />
            Human
          </Button>
          <Button
            variant={playerType === "card" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              play("buttons");
              setPlayerType(playerType === "card" ? "" : "card");
              setPage(1);
            }}
            className={
              playerType === "card"
                ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                : "border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800"
            }
          >
            <CreditCard className="h-3.5 w-3.5 mr-1" />
            Card
          </Button>
        </div>
      </div>

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
          {viewMode === "mosaic" ? (
            /* ── Mosaic View ── */
            <div className="grid grid-cols-3 gap-1 sm:gap-2">
              {data?.players?.map(
                (player: {
                  id: number;
                  username: string;
                  avatarUrl: string | null;
                  playerValue: number;
                  ownerCount: number;
                  ownedCount: number;
                  credits?: number;
                  playerType?: string;
                  estimatedDeletionAt?: string | null;
                }) => {
                  const isOwnProfile = currentUsername === player.username;
                  const canAfford = (credits ?? 0) >= player.playerValue;

                  return (
                    <div
                      key={player.id}
                      className="group relative aspect-square overflow-hidden rounded-lg bg-gray-800 border border-gray-800 hover:border-t1-500 transition-all"
                    >
                      <Link
                        href={`/players/${player.username}`}
                        className="block w-full h-full"
                      >
                        {player.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={player.avatarUrl}
                            alt={player.username}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-gray-800">
                            <User className="h-1/3 w-1/3 text-gray-600" />
                          </div>
                        )}
                      </Link>
                      {/* Overlay with name and buy button */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-8">
                        <div className="flex items-end justify-between gap-1">
                          <Link
                            href={`/players/${player.username}`}
                            className="flex-1 min-w-0"
                          >
                            <p className="text-white text-xs sm:text-sm font-medium truncate">
                              {player.username}
                            </p>
                            <div className="flex items-center gap-2 text-gray-300 text-[30px] sm:text-[36px]">
                              <span>
                                ₡{player.playerValue?.toLocaleString()}
                              </span>
                              {player.ownerCount > 0 && (
                                <span className="flex items-center gap-0.5">
                                  <Crown className="h-2.5 w-2.5" />
                                  {player.ownerCount}
                                </span>
                              )}
                            </div>
                          </Link>
                          {session && !isOwnProfile && (
                            <MosaicBuyButton
                              targetId={player.id}
                              targetUsername={player.username}
                              cost={player.playerValue}
                              disabled={!canAfford}
                            />
                          )}
                        </div>
                      </div>
                      {/* Player type badge */}
                      {player.playerType === "card" && (
                        <div className="absolute top-1 right-1 bg-cyan-600/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                          NPC
                        </div>
                      )}
                      {/* Own profile badge */}
                      {isOwnProfile && (
                        <div className="absolute top-1 left-1 bg-t1-600/80 text-white text-[9px] px-1.5 py-0.5 rounded-full">
                          You
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          ) : (
            /* ── Details View ── */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
                }) => (
                  <PlayerCard key={player.id} {...player} />
                )
              )}
            </div>
          )}

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
