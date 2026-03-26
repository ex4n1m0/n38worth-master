"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, User, Search, Crown, Users, CreditCard, ShoppingCart } from "lucide-react";
import Link from "next/link";
import { useCredits } from "@/hooks/useCredits";
import { toast } from "sonner";

// Compact buy button for mosaic cards
function MosaicBuyButton({ 
  targetId, 
  targetUsername, 
  cost,
  disabled 
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
      
      toast.success(`You bought ${targetUsername}! Their value is now ${data.newValue} 💰`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players-mosaic"] }),
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

export default function BrowseMosaicPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { data: credits } = useCredits();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [playerType, setPlayerType] = useState<"" | "human" | "card">("");

  const currentUsername = session?.user?.name;

  const handleSearch = (value: string) => {
    setSearch(value);
    setTimeout(() => setDebouncedSearch(value), 300);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["players-mosaic", debouncedSearch, playerType, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "99",
        sort: "last-online",
        ...(debouncedSearch && { search: debouncedSearch }),
        ...(playerType && { playerType }),
      });
      const res = await fetch(`/api/players?${params}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    staleTime: 5 * 1000,
    refetchInterval: 30 * 1000,
  });

  const players: {
    id: number;
    username: string;
    avatarUrl: string | null;
    playerValue: number;
    ownerCount: number;
    ownedCount: number;
    playerType?: string;
  }[] = data?.players ?? [];

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/leaderboard">
          <Button
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <h1 className="text-xl font-bold text-white">
          Browse All Players
          <span className="text-sm font-normal text-gray-400 ml-2">
            ({data?.total ?? 0} players)
          </span>
        </h1>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search players..."
            value={search}
            onChange={(e) => {
              handleSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10 bg-gray-900 border-gray-800 text-white placeholder:text-gray-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={playerType === "human" ? "default" : "outline"}
            size="sm"
            onClick={() => { setPlayerType(playerType === "human" ? "" : "human"); setPage(1); }}
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
            onClick={() => { setPlayerType(playerType === "card" ? "" : "card"); setPage(1); }}
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

      {/* Mosaic Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-t1-400" />
        </div>
      ) : players.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
          <Users className="h-12 w-12 mb-3 opacity-50" />
          <p className="text-lg">No players found</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1 sm:gap-2">
            {players.map((p) => {
              const isOwnProfile = currentUsername === p.username;
              const canAfford = (credits ?? 0) >= p.playerValue;
              
              return (
                <div
                  key={p.id}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-gray-800 border border-gray-800 hover:border-t1-500 transition-all"
                >
                  <Link
                    href={`/players/${p.username}`}
                    className="block w-full h-full"
                  >
                    {p.avatarUrl ? (
                      <img
                        src={p.avatarUrl}
                        alt={p.username}
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
                      <Link href={`/players/${p.username}`} className="flex-1 min-w-0">
                        <p className="text-white text-xs sm:text-sm font-medium truncate">
                          {p.username}
                        </p>
                        <div className="flex items-center gap-2 text-gray-300 text-[10px] sm:text-xs">
                          <span>₡{p.playerValue?.toLocaleString()}</span>
                          {p.ownerCount > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Crown className="h-2.5 w-2.5" />
                              {p.ownerCount}
                            </span>
                          )}
                        </div>
                      </Link>
                      {/* Buy button - only show if logged in and not own profile */}
                      {session && !isOwnProfile && (
                        <MosaicBuyButton
                          targetId={p.id}
                          targetUsername={p.username}
                          cost={p.playerValue}
                          disabled={!canAfford}
                        />
                      )}
                    </div>
                  </div>
                  {/* Player type badge */}
                  {p.playerType === "card" && (
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
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30"
              >
                ←
              </Button>
              <span className="text-sm text-gray-400">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-30"
              >
                →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
