"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Swords, ChevronLeft, ChevronRight } from "lucide-react";
import { RestoreAllButton } from "@/components/RestoreAllButton";
import { PlayerCard } from "@/components/PlayerCard";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface LostPlayer {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  valueFloor?: number;
  profession?: string | null;
  isVerified?: number;
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

export function LostPlayersGrid({ profileUsername }: LostPlayersGridProps) {
  const { data: session } = useSession();
  const [page, setPage] = useState(1);
  const [now] = useState(() => Date.now());

  const { data, isLoading } = useQuery<LostPlayersResponse>({
    queryKey: ["lost-players", profileUsername, page],
    queryFn: async () => {
      const res = await fetch(`/api/players/${profileUsername}/lost-players?page=${page}`);
      if (!res.ok) throw new Error("Failed to fetch lost players");
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 600 * 1000,
  });

  const lostPlayers = useMemo(() => {
    return (data?.lostPlayers ?? []).filter(
      (p) => now - new Date(p.lostAt).getTime() <= TWENTY_FOUR_HOURS_MS
    );
  }, [data?.lostPlayers, now]);
  const total = lostPlayers.length;
  const pageSize = data?.pageSize ?? 21;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading && lostPlayers.length === 0 && total === 0) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Swords className="h-4 w-4 text-red-400" />
            Taken From{" "}
            {session?.user?.name?.toLowerCase() === profileUsername.toLowerCase()
              ? "Me"
              : profileUsername}
          </h3>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-white/10 bg-gray-950/70 overflow-hidden">
              <div className="w-full aspect-square bg-gray-800/80" />
              <div className="p-2 space-y-1.5">
                <div className="h-3 w-3/4 rounded bg-gray-800/80" />
                <div className="h-3 w-1/2 rounded bg-gray-800/60" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
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

      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {lostPlayers.map((player) => (
          <PlayerCard
            key={player.id}
            id={player.id}
            username={player.username}
            avatarUrl={player.avatarUrl}
            playerValue={player.playerValue}
            valueFloor={player.valueFloor ?? 1}
            profession={player.profession ?? null}
            isVerified={player.isVerified}
            ownerName={player.currentOwnerUsername}
            leaderboardMode
            alwaysShowAvatar
          />
        ))}
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
