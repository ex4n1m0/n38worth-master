"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Crown, Calendar, Star, Loader2, Wallet, Gift, ChevronDown } from "lucide-react";
import { GoddessCard } from "@/components/GoddessCard";
import { BonusCardMarket } from "@/components/BonusCardMarket";
import { EmpireRankStrip } from "@/components/EmpireRankStrip";
import { PortfolioRewardCountdown } from "@/components/PortfolioRewardCountdown";
import { RankBonusCountdown } from "@/components/RankBonusCountdown";
import { LoginReward } from "@/components/LoginReward";
import { RandomPlayerCountdown } from "@/components/RandomPlayerCountdown";
import { RewardHistory } from "@/components/RewardHistory";
import { BossIncomeCard } from "@/components/BossIncomeCard";
import { MissionProgress } from "@/components/MissionProgress";

interface HallOfFameEntry {
  id: number;
  userId: number;
  username: string;
  wonAt: string;
}

interface GoddessData {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  originalValue: number;
  ownerCount: number;
  ownedCount: number;
  ownerName?: string | null;
  ownerValue?: number | null;
}



function BonusCardsMarketSection({ currentUserId }: { currentUserId: number | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["bonus-cards"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/bonus-cards");
        if (!res.ok) throw new Error("Failed to fetch bonus cards");
        return res.json();
      } catch (error) {
        console.error("Bonus cards fetch error:", error);
        throw error;
      }
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // Single-use action cards shown first, then the passive "others". The
  // 10-Min Knowledge card is excluded so there are exactly 6 bonus cards
  // (mirroring the 6 goddesses).
  const SINGLE_USE = new Set(["Mass Hire", "Create NPC", "+10 Player Slots"]);
  const bonusCards = ((data?.bonusCards ?? []) as Array<{
    id: number;
    username: string;
    avatarUrl: string | null;
    playerValue: number;
    originalValue: number;
    ownerCount: number;
    ownedCount: number;
    ownerName?: string | null;
    ownerValue?: number | null;
  }>)
    .filter((card) => card.username !== "10-Min Knowledge")
    .sort(
      (a, b) =>
        (SINGLE_USE.has(a.username) ? 0 : 1) - (SINGLE_USE.has(b.username) ? 0 : 1)
    );

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center gap-2">
        <Gift className="h-5 w-5 text-purple-400" />
        <h2 className="text-xl font-bold text-white">Bonus Cards</h2>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {bonusCards.map((card) => (
            <BonusCardMarket
              key={card.id}
              {...card}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HallOfFamePage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ? Number(session.user.id) : null;
  const [showRewards, setShowRewards] = useState(true);

  const { data: winners = [], isLoading } = useQuery<HallOfFameEntry[]>({
    queryKey: ["hall-of-fame"],
    queryFn: async () => {
      const res = await fetch("/api/hall-of-fame");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: goddessData, isLoading: goddessLoading } = useQuery<{
    goddesses: GoddessData[];
    currentUserId: number | null;
  }>({
    queryKey: ["goddesses"],
    queryFn: async () => {
      const res = await fetch("/api/goddesses");
      if (!res.ok) return { goddesses: [], currentUserId: null };
      return res.json();
    },
    refetchInterval: 10 * 1000,
  });

  return (
    <div className="space-y-6 pb-24 md:pb-8">
      {/* Rank category strips — pinned to the very top of the page. */}
      <EmpireRankStrip />

      {/* Rewards & Income — collapsible, open by default, pinned to the top. */}
      {currentUserId && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900/40 overflow-hidden">
          <button
            onClick={() => setShowRewards((v) => !v)}
            className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-white/[0.03] transition-colors"
          >
            <span className="flex items-center gap-2 font-bold text-white">
              <Wallet className="h-5 w-5 text-t1-400" />
              Your Rewards &amp; Income
            </span>
            <ChevronDown
              className={`h-5 w-5 text-gray-400 transition-transform ${showRewards ? "rotate-180" : ""}`}
            />
          </button>
          {showRewards && (
            <div className="p-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PortfolioRewardCountdown />
                <RankBonusCountdown />
                <BossIncomeCard userId={currentUserId} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RandomPlayerCountdown />
                <LoginReward />
              </div>
              <RewardHistory />
            </div>
          )}
        </div>
      )}

      {/* Mission Progress */}
      <MissionProgress />

      {/* Goddesses Section — the heading doubles as the win-condition explainer. */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Crown className="h-6 w-6 text-yellow-400" />
          <h2 className="text-xl sm:text-2xl font-black text-white">How to Win</h2>
        </div>
        <p className="text-sm sm:text-lg text-gray-200 leading-relaxed mb-4">
          <span className="font-bold text-yellow-300">Own all 6 Goddesses and hold them for one full hour.</span>{" "}
          The world then resets and your name is carved into the Hall of Fame forever.
        </p>
        
        {goddessLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : goddessData?.goddesses && goddessData.goddesses.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {goddessData.goddesses.map((goddess) => (
              <GoddessCard
                key={goddess.id}
                {...goddess}
                currentUserId={goddessData.currentUserId}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 rounded-2xl border border-gray-800 bg-gray-900/40">
            <p className="text-gray-500">No goddess data available</p>
          </div>
        )}
      </div>

      {/* Bonus Cards market — moved here from the Market page, just below the Goddesses. */}
      <BonusCardsMarketSection currentUserId={currentUserId} />

      {/* Hall of Champions — on desktop this lives in the rank-strip dropdown
          above; the full list below is shown on mobile only (the strip is
          hidden on small screens). */}
      <div className="md:hidden space-y-6">
      {/* Champions header */}
      <div className="pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-3">
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
                      : "border-gray-800 bg-gray-900/60 hover:border-gray-700"
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

    </div>
  );
}
