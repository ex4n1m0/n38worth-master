"use client";

import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerCard, HireRevealModal } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { toast } from "sonner";
import {
  Crown,
  Users,
  Loader2,
  Search,
  User,
  CreditCard,
  ShoppingCart,
  Target,
  Zap,
  Camera,
  Handshake,
  Clock,
  UserPlus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { GoddessCountdown } from "@/components/GoddessCountdown";
import { CreditBalance } from "@/components/CreditBalance";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "@/components/OnboardingContext";
import { formatNumber, navbarBtnStyle } from "@/lib/utils";

const SORT_OPTIONS = [
  { key: "last-online", label: "Latest Online" },
  { key: "value", label: "Value" },
  { key: "credits", label: "Credits" },
  { key: "newest", label: "Newest" },
  { key: "most-hired", label: "Hired Times" },
] as const;

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

          {/* Goddess Countdown Banner */}
          <GoddessCountdown />

          {/* Credit Balance - Mobile Only */}
          <div className="sm:hidden">
            <CreditBalance />
          </div>

          {/* Bonus Cards Section - only for players with 10+ hired players */}
          <BonusCardsSection />

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

  const { ownedIds } = useOwnedPlayerIds();
  const canAfford = (credits ?? 0) >= npc.playerValue;
  const npcAvatarSrc = getAvatarSrc({
    avatarUrl: npc.avatarUrl,
    playerId: npc.id,
    playerUsername: npc.username,
    viewerUsername: session?.user?.name,
    ownedIds,
  });

  const handleHire = async () => {
    if (!canAfford || isPending) return;
    play("hire");
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
            <AvatarImage src={npcAvatarSrc} />
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
            onClick={handleHire}
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

// Bonus Cards Section - shown only to players with 10+ hired players
function BonusCardsSection() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { play } = useSound();

  const { data: me } = useQuery({
    queryKey: ["player", "me-bonus"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
  });

  const { data: bonusCardsData, isLoading } = useQuery({
    queryKey: ["bonus-cards"],
    queryFn: async () => {
      const res = await fetch("/api/game/bonus-cards");
      if (!res.ok) {
        if (res.status === 403) return null; // Not eligible yet
        throw new Error("Failed to fetch bonus cards");
      }
      return res.json();
    },
    enabled: !!session?.user?.name && (me?.ownedPlayers?.length ?? 0) >= 10,
    staleTime: 30 * 1000,
  });

  const ownedCount = me?.ownedPlayers?.length ?? 0;

  // Hide section entirely until the player has hired at least 10 players
  if (ownedCount < 10) return null;

  if (isLoading) {
    return (
      <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-lg p-4">
        <h3 className="text-purple-300 font-bold text-lg mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Bonus Cards
        </h3>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
      </div>
    );
  }

  if (!bonusCardsData?.bonusCards || bonusCardsData.bonusCards.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 border border-purple-500/30 rounded-lg p-4">
      <h3 className="text-purple-300 font-bold text-lg mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5" />
        Bonus Cards
      </h3>
      <p className="text-purple-400/80 text-sm mb-3">
        Special cards with passive bonuses. Free to hire, but have a 3-hour unbreakable partnership block.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {bonusCardsData.bonusCards.map((card: {
          id: number;
          username: string;
          avatarUrl: string | null;
          playerValue: number;
          ownerCount: number;
          blockSellUntil?: string | null;
          ownerName?: string | null;
        }) => (
          <PlayerCard
            key={card.id}
            {...card}
            ownedCount={0}
            credits={0}
            portfolioValue={0}
            isActive={1}
            playerType="card"
            onHired={() => {
              play("hire");
              queryClient.invalidateQueries({ queryKey: ["bonus-cards"] });
            }}
          />
        ))}
      </div>
    </div>
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
  const [noBoss, setNoBoss] = useState(false);
  const [hasPlayers, setHasPlayers] = useState(false);
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [hasRevealedAvatar, setHasRevealedAvatar] = useState(false);
  const [noPartner, setNoPartner] = useState(false);
  const [revealInfo, setRevealInfo] = useState<{ avatarUrl: string | null; username: string } | null>(null);
  const { play } = useSound();

  const currentUsername = session?.user?.name;
  const { ownedIds } = useOwnedPlayerIds();
  const limit = 9;

  const { data, isLoading } = useQuery({
    queryKey: [
      "players",
      debouncedSearch,
      sort,
      hasOwner,
      noBoss,
      hasPlayers,
      playerType,
      hasRevealedAvatar,
      noPartner,
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
        ...(noBoss && { noBoss: "true" }),
        ...(hasPlayers && { hasPlayers: "true" }),
        ...(playerType && { playerType }),
        ...(hasRevealedAvatar && { hasRevealedAvatar: "true" }),
        ...(noPartner && { noPartner: "true" }),
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
      {revealInfo && (
        <HireRevealModal
          avatarUrl={revealInfo.avatarUrl}
          username={revealInfo.username}
          onClose={() => setRevealInfo(null)}
        />
      )}
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
          <MassHireButton />
          <CreateNpcButton />
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
                  ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                  : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
              }
              style={navbarBtnStyle}
            >
              {s.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setHasOwner(!hasOwner);
              setPage(1);
            }}
            className={
              hasOwner
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Crown className="h-3.5 w-3.5 mr-1" />
            Have Boss
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setNoBoss(!noBoss);
              setPage(1);
            }}
            className={
              noBoss
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Crown className="h-3.5 w-3.5 mr-1" />
            No Boss
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setHasPlayers(!hasPlayers);
              setPage(1);
            }}
            className={
              hasPlayers
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Users className="h-3.5 w-3.5 mr-1" />
            Has Players
          </Button>
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
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <User className="h-3.5 w-3.5 mr-1" />
            Human
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
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <CreditCard className="h-3.5 w-3.5 mr-1" />
            Card
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setNoPartner(!noPartner);
              setPage(1);
            }}
            className={
              noPartner
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Handshake className="h-3.5 w-3.5 mr-1" />
            No Partner
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              play("buttons");
              setHasRevealedAvatar(!hasRevealedAvatar);
              setPage(1);
            }}
            className={
              hasRevealedAvatar
                ? "text-cyan-400 font-semibold !bg-transparent brightness-125 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
                : "text-gray-400 font-semibold !bg-transparent brightness-50 hover:brightness-125 hover:!bg-transparent border-0 drop-shadow-lg"
            }
            style={navbarBtnStyle}
          >
            <Camera className="h-3.5 w-3.5 mr-1" />
            Revealed Avatar
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
          {/* ── Details View ── */}
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
                purchaseCount?: number;
                bio?: string | null;
              }) => (
                <PlayerCard key={player.id} {...player} onHired={(avatarUrl, username) => setRevealInfo({ avatarUrl, username })} />
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

// Create NPC button — spawns a new ownerless NPC for 1,000¢ with a 10s cooldown
// Only shown to players who already own at least 10 players.
const CREATE_NPC_COST = 1000;
const CREATE_NPC_COOLDOWN_MS = 10_000;

function CreateNpcButton() {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { data: session } = useSession();
  const { play } = useSound();
  const [isPending, setIsPending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number>(0);
  const [now, setNow] = useState<number>(() => Date.now());

  const { data: me } = useQuery({
    queryKey: ["player", "me-npc"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
  });

  const ownedCount = me?.ownedPlayers?.length ?? 0;

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  if (ownedCount < 10) return null;

  const remainingMs = Math.max(0, cooldownUntil - now);
  const isCoolingDown = remainingMs > 0;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const canAfford = (credits ?? 0) >= CREATE_NPC_COST;
  const disabled = isPending || isCoolingDown || !canAfford;

  const handleClick = async () => {
    if (disabled) {
      if (isCoolingDown) toast.error(`Cooling down. ${remainingSec}s left`);
      else if (!canAfford) toast.error(`Need ${formatNumber(CREATE_NPC_COST)}¢ to create an NPC`);
      return;
    }
    play("buttons");
    setIsPending(true);
    try {
      const res = await fetch("/api/game/create-npc", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && typeof data.retryAfterMs === "number") {
          setCooldownUntil(Date.now() + data.retryAfterMs);
        }
        toast.error(data.error || "Failed to create NPC");
        return;
      }
      setCooldownUntil(Date.now() + CREATE_NPC_COOLDOWN_MS);
      toast.success(`NPC "${data.player?.username}" spawned in the marketplace! 🤖`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
      ]);
    } catch {
      toast.error("Failed to create NPC");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      className={`font-semibold drop-shadow-lg ${
        isCoolingDown || !canAfford
          ? "border border-gray-700 text-gray-500 bg-transparent cursor-not-allowed"
          : "text-white border-0 bg-transparent hover:brightness-125 hover:bg-transparent"
      }`}
      style={!isCoolingDown && canAfford ? navbarBtnStyle : undefined}
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Creating...
        </>
      ) : isCoolingDown ? (
        <>
          <Clock className="h-4 w-4 mr-1" />
          NPC in {remainingSec}s
        </>
      ) : (
        <>
          <UserPlus className="h-4 w-4 mr-1" />
          Create NPC ({formatNumber(CREATE_NPC_COST)}¢)
        </>
      )}
    </Button>
  );
}

// Mass Hire button — hires as many affordable players as possible, cheapest first
// Only shown to players who already own at least 10 players.
function MassHireButton() {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { data: session } = useSession();
  const { play } = useSound();
  const [isPending, setIsPending] = useState(false);
  const [progress, setProgress] = useState<{ hired: number } | null>(null);

  const { data: me } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
  });

  const ownedCount = me?.ownedPlayers?.length ?? 0;

  // Hide button entirely until the player has hired at least 10 players
  if (ownedCount < 10) return null;

  const MASS_HIRE_FEE = 1000;

  const handleMassHire = async () => {
    if (isPending) return;
    if (!credits || credits < MASS_HIRE_FEE) {
      toast.error(`Mass Hire costs ${formatNumber(MASS_HIRE_FEE)}¢. You don't have enough credits.`);
      return;
    }

    setIsPending(true);
    setProgress({ hired: 0 });
    play("buttons");

    // Fetch current hire slot availability before starting
    const slotRes = await fetch("/api/settings/ownership-limit");
    let slotsRemaining = Infinity;
    if (slotRes.ok) {
      const slotData = await slotRes.json();
      slotsRemaining = Math.max(0, slotData.limit - slotData.currentOwned);
      if (slotsRemaining === 0) {
        toast.error("You've reached your hire limit. Buy more slots to expand your team!");
        setIsPending(false);
        setProgress(null);
        return;
      }
    }

    // Deduct the flat Mass Hire fee server-side before starting
    const feeRes = await fetch("/api/game/mass-hire-fee", { method: "POST" });
    if (!feeRes.ok) {
      const feeData = await feeRes.json();
      toast.error(feeData.error || "Failed to charge Mass Hire fee");
      setIsPending(false);
      setProgress(null);
      return;
    }

    let remainingCredits = credits - MASS_HIRE_FEE;
    let hiredCount = 0;
    let spent = 0;
    let failedCount = 0;
    let page = 1;
    const limit = 100;

    try {
      while (true) {
        // Fetch cheapest available players (API excludes self and already-owned)
        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
          sort: "cheapest",
        });
        const res = await fetch(`/api/players?${params}`);
        if (!res.ok) break;
        const data = await res.json();
        const players: Array<{ id: number; username: string; playerValue: number }> =
          data.players || [];

        if (players.length === 0) break;

        // Ensure ascending order by value
        players.sort((a, b) => a.playerValue - b.playerValue);

        // If the very cheapest on this page is already unaffordable, stop entirely
        if (players[0].playerValue > remainingCredits) break;

        let anyHiredThisPage = false;
        for (const p of players) {
          if (hiredCount >= slotsRemaining) break;
          if (p.playerValue > remainingCredits) {
            // Since sorted cheapest first, remaining on this page are also unaffordable
            break;
          }
          try {
            const buyRes = await fetch("/api/game/purchase", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ targetId: p.id }),
            });
            const buyData = await buyRes.json();
            if (!buyRes.ok) {
              failedCount++;
              continue;
            }
            remainingCredits -= p.playerValue;
            spent += p.playerValue;
            hiredCount++;
            anyHiredThisPage = true;
            setProgress({ hired: hiredCount });
          } catch {
            failedCount++;
          }
        }
        if (hiredCount >= slotsRemaining) break;

        // If nothing was hired on this page (all failed or unaffordable), stop to avoid infinite loop
        if (!anyHiredThisPage) break;

        // If we got a full page and still have credits, try next page for more cheap players
        if (players.length < limit) break;
        if (remainingCredits <= 0) break;
        page++;
        // Safety cap
        if (page > 20) break;
      }

      if (hiredCount === 0) {
        toast.error("No affordable players available to hire");
      } else {
        toast.success(
          `Mass Hire complete! Hired ${hiredCount} player${hiredCount === 1 ? "" : "s"} for ${formatNumber(spent)}¢` +
            ` (+ ${formatNumber(MASS_HIRE_FEE)}¢ fee)` +
            (failedCount > 0 ? ` (${failedCount} failed)` : "")
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["my-players"] }),
      ]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Mass Hire failed");
    } finally {
      setIsPending(false);
      setProgress(null);
    }
  };

  return (
    <Button
      size="sm"
      onClick={handleMassHire}
      disabled={isPending}
      className="text-white font-semibold drop-shadow-lg border-0 bg-transparent hover:brightness-125 hover:bg-transparent disabled:opacity-60"
      style={navbarBtnStyle}
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          {progress ? `Hiring ${progress.hired}...` : "Hiring..."}
        </>
      ) : (
        <>
          <Zap className="h-4 w-4 mr-1" />
          Mass Hire (1,000¢)
        </>
      )}
    </Button>
  );
}

