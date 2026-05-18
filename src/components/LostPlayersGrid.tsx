"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCredits } from "@/hooks/useCredits";
import { formatNumber, getDynamicMosaicFontSize, getDynamicMosaicHireFontSize } from "@/lib/utils";
import { Swords, ChevronLeft, ChevronRight, Crown, Loader2, ShoppingCart } from "lucide-react";
import { RestoreAllButton } from "@/components/RestoreAllButton";
import { toast } from "sonner";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface LostPlayer {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  currentOwnerUsername: string | null;
  lostAt: string;
}

interface LostPlayersResponse {
  lostPlayers: LostPlayer[];
  total: number;
  totalValue: number;
  page: number;
  pageSize: number;
}

interface LostPlayersGridProps {
  profileUsername: string;
}

function MosaicHireButton({
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

  const handleHire = async (e: React.MouseEvent) => {
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
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description: "You own all 6 Goddesses! Hold them for 60 minutes to win the game!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(`You hired ${targetUsername}! Their value is now ${data.newValue} 💰`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
          queryClient.invalidateQueries({ queryKey: ["lost-players"] }),
        ]);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      onClick={handleHire}
      disabled={disabled || isPending}
      className={`flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-1 sm:py-1.5 rounded ${getDynamicMosaicHireFontSize(cost)} font-semibold transition-all whitespace-nowrap ${
        disabled
          ? "bg-gray-700/50 text-gray-500 cursor-not-allowed"
          : "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white shadow-sm"
      }`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
      ) : (
        <>
          <ShoppingCart className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          <span>{formatNumber(cost)}¢</span>
        </>
      )}
    </button>
  );
}

export function LostPlayersGrid({ profileUsername }: LostPlayersGridProps) {
  const { data: session } = useSession();
  const { data: credits } = useCredits();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<LostPlayersResponse>({
    queryKey: ["lost-players", profileUsername, page],
    queryFn: async () => {
      const res = await fetch(`/api/players/${profileUsername}/lost-players?page=${page}`);
      if (!res.ok) throw new Error("Failed to fetch lost players");
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const lostPlayers = useMemo(() => {
    const now = Date.now();
    return (data?.lostPlayers ?? []).filter(
      (p) => now - new Date(p.lostAt).getTime() <= TWENTY_FOUR_HOURS_MS
    );
  }, [data?.lostPlayers]);
  const total = lostPlayers.length;
  const pageSize = data?.pageSize ?? 21;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading && lostPlayers.length === 0 && total === 0) return null;
  if (!isLoading && total === 0) return null;

  const viewerUsername = session?.user?.name;

  // Build page number list with ellipsis for large sets
  function getPageNumbers(current: number, total: number): (number | "...")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | "...")[] = [];
    if (current <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", total);
    } else if (current >= total - 3) {
      pages.push(1, "...", total - 4, total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, "...", current - 1, current, current + 1, "...", total);
    }
    return pages;
  }

  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Swords className="h-4 w-4 text-red-400" />
          Taken From{" "}
          {viewerUsername?.toLowerCase() === profileUsername.toLowerCase()
            ? "Me"
            : profileUsername}
          {total > 0 && (
            <span className="text-gray-400 font-normal text-xs ml-1">({total})</span>
          )}
        </h3>
        {viewerUsername?.toLowerCase() === profileUsername.toLowerCase() && (
          <RestoreAllButton eligibleCount={total} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {lostPlayers.map((player) => {
          const isOwnProfile = session?.user?.name === player.username;
          const canHire = (credits ?? 0) >= player.playerValue;

          return (
            <div
              key={player.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-gray-800 border border-gray-800 hover:border-t1-500 transition-all"
            >
              <Link
                href={`/players/${player.username}`}
                className="block w-full h-full"
              >
                {/* Lost players are not on viewer's team — always show UNHIRED2.png */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/UNHIRED2.png"
                  alt={player.username}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </Link>

              {/* Overlay with name, value, owner, and hire button */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-2 pt-8">
                <div className="flex items-end justify-between gap-1">
                  <Link
                    href={`/players/${player.username}`}
                    className="flex-1 min-w-0"
                  >
                    <p className="text-white text-base sm:text-lg font-medium truncate">
                      {player.username}
                    </p>
                    <div className={`flex items-center gap-2 text-gray-300 ${getDynamicMosaicFontSize(player.playerValue)}`}>
                      <span className="truncate">
                        ₡{player.playerValue?.toLocaleString()}
                      </span>
                      {player.currentOwnerUsername && (
                        <span className="flex items-center gap-0.5 shrink-0 text-amber-400/80">
                          <Crown className="h-2.5 w-2.5" />
                          <span className="truncate max-w-[60px]">{player.currentOwnerUsername}</span>
                        </span>
                      )}
                    </div>
                  </Link>
                  {session && !isOwnProfile && (
                    <MosaicHireButton
                      targetId={player.id}
                      targetUsername={player.username}
                      cost={player.playerValue}
                      disabled={!canHire}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4 flex-wrap">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-gray-900/60 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pageNumbers.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-gray-500 text-xs">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p as number)}
                className={`w-8 h-8 rounded-lg border text-xs font-semibold transition-all ${
                  page === p
                    ? "border-red-400/60 bg-red-500/20 text-red-300"
                    : "border-white/10 bg-gray-900/60 text-gray-400 hover:text-white hover:border-white/30"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-white/10 bg-gray-900/60 text-gray-400 hover:text-white hover:border-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
