"use client";

import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerCard } from "@/components/PlayerCard";
import { Input } from "@/components/ui/input";
import { MyProfileCard } from "@/components/MyProfileCard";
import { CreateNPCButton } from "@/components/CreateNPCButton";
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
} from "lucide-react";
import Link from "next/link";

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

  const handleBuy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled || isPending) return;

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
      className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] sm:text-xs font-semibold transition-all ${
        disabled
          ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
          : "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white shadow-sm"
      }`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <>
          <ShoppingCart className="h-3 w-3" />
          <span>{cost}¢</span>
        </>
      )}
    </button>
  );
}

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const handleSearch = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  return (
    <div className="space-y-6">
      {/* My Profile Card */}
      {session?.user?.name && <MyProfileCard />}

      {/* Browse Players */}
      <BrowsePlayersSection
        search={search}
        onSearch={handleSearch}
        debouncedSearch={debouncedSearch}
      />
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
  const [hasPlayers, setHasPlayers] = useState(false);
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");
  const [viewMode, setViewMode] = useState<"mosaic" | "details">("mosaic");

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
        <CreateNPCButton />
        <div className="flex gap-2 flex-wrap">
          {/* View mode toggle */}
          {viewMode === "mosaic" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setViewMode("details"); setPage(1); }}
              className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <List className="h-4 w-4 mr-1" />
              Details
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setViewMode("mosaic"); setPage(1); }}
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
                            <div className="flex items-center gap-2 text-gray-300 text-[10px] sm:text-xs">
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
                      {/* Deletion countdown badge — only for NPC (card) players */}
                      {player.playerType === "card" && player.estimatedDeletionAt && (
                        <div className="absolute top-1 right-1 bg-red-600/80 text-white text-[9px] px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          ⚠ Deleting
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
                }) => (
                  <PlayerCard key={player.id} {...player} />
                )
              )}
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setPage(p)}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
