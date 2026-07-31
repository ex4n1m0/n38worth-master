"use client";

import { useQuery } from "@tanstack/react-query";
import { Crown, Calendar, Star } from "lucide-react";

interface HallOfFameEntry {
  id: number;
  userId: number;
  username: string;
  wonAt: string;
}

/**
 * The Hall of Champions winners list (one entry per completed game).
 * Rendered at the top of the History page.
 */
export function HallOfChampions() {
  const { data: winners = [], isLoading } = useQuery<HallOfFameEntry[]>({
    queryKey: ["hall-of-fame"],
    queryFn: async () => {
      const res = await fetch("/api/hall-of-fame");
      if (!res.ok) return [];
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      {/* Champions header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Crown className="h-6 w-6 text-yellow-400" />
          Hall of Champions
        </h2>
        {winners.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-3 py-1 text-xs font-semibold text-yellow-300">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {winners.length} game{winners.length !== 1 ? "s" : ""} won · Latest: {winners[0]?.username}
          </span>
        )}
      </div>

      {/* Winners List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-gray-900/60 animate-pulse"
            />
          ))}
        </div>
      ) : winners.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-gray-800 bg-gray-900/40">
          <Crown className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">No Champions Yet</h3>
          <p className="text-sm text-gray-500 max-w-sm mx-auto">
            The throne awaits. Be the first to collect all 6 Goddesses and etch your name in history!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {winners.map((winner, index) => {
            const isFirst = index === 0;
            const isTop3 = index < 3;
            const gameNumber = winners.length - index;
            const wonDate = new Date(winner.wonAt);
            const formattedDate = wonDate.toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            });
            const formattedTime = wonDate.toLocaleTimeString("en-US", {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <div
                key={winner.id}
                className={`relative rounded-2xl border p-5 transition-all ${
                  isFirst
                    ? "border-yellow-500/40 bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-yellow-500/10 shadow-lg shadow-yellow-500/5"
                    : isTop3
                      ? "border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-transparent"
                      : "border-gray-800 bg-transparent hover:border-gray-700"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Rank Badge */}
                  <div
                    className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 ${
                      isFirst
                        ? "bg-gradient-to-br from-yellow-500 to-amber-600 text-black"
                        : isTop3
                          ? "bg-gradient-to-br from-amber-500/20 to-yellow-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-gray-800 text-gray-400 border border-gray-700"
                    }`}
                  >
                    {isFirst ? (
                      <Crown className="h-6 w-6" />
                    ) : (
                      <span className="text-lg font-bold">#{gameNumber}</span>
                    )}
                  </div>

                  {/* Winner Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-lg font-bold truncate ${
                          isFirst
                            ? "text-yellow-400"
                            : isTop3
                              ? "text-amber-300"
                              : "text-white"
                        }`}
                      >
                        {winner.username}
                      </span>
                      {isFirst && (
                        <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formattedDate} at {formattedTime}</span>
                    </div>
                  </div>

                  {/* Game Number */}
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        isFirst
                          ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                          : "bg-gray-800 text-gray-500"
                      }`}
                    >
                      Game #{gameNumber}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
