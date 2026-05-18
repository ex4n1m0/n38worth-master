"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Crown, Users, Wallet, TrendingUp, DollarSign, Swords, Coins, Briefcase, ChevronDown, ChevronUp, Trophy, Star } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";
import {
  OWNED_RANKS,
  CREDITS_RANKS,
  VALUE_RANKS,
  PORTFOLIO_RANKS,
  getValueRank,
  getPortfolioRank,
  getCreditsRank,
  getOwnedRank,
  type RankTier,
} from "@/lib/ranks";
import { navbarBtnStyle } from "@/lib/utils";

interface RankedPlayer {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  createdAt: string | null;
  lastOnlineAt: string | null;
  credits: number;
  ownerCount: number;
  ownedCount: number;
  portfolioValue: number;
  purchaseCount?: number;
}

interface RanksData {
  topEmpire: RankedPlayer[];
  topPortfolio: RankedPlayer[];
  topCredits: RankedPlayer[];
  topValue: RankedPlayer[];
  topHired: RankedPlayer[];
  totalPlayers: number;
}

const PRIZE_AMOUNTS = [3, 2, 1]; // 1st, 2nd, 3rd

const RANK_CATEGORIES = [
  {
    key: "topValue",
    title: "Highest Value",
    icon: DollarSign,
    color: "text-t1-400",
    bgColor: "bg-t1-500/10",
    borderColor: "border-t1-500/30",
    gradientFrom: "from-t1-900/30",
    gradientTo: "to-t2-900/10",
    getValue: (p: RankedPlayer) => `$${formatNumber(p.playerValue)}`,
    prizeLabel: "Value Prize",
  },
  {
    key: "topPortfolio",
    title: "Top Portfolio",
    icon: TrendingUp,
    color: "text-t2-400",
    bgColor: "bg-t2-500/10",
    borderColor: "border-t2-500/30",
    gradientFrom: "from-t2-900/30",
    gradientTo: "to-t1-900/10",
    getValue: (p: RankedPlayer) => `$${formatNumber(p.portfolioValue)}`,
    prizeLabel: "Portfolio Prize",
  },
  {
    key: "topCredits",
    title: "Most Credits",
    icon: Wallet,
    color: "text-t1-300",
    bgColor: "bg-t1-500/10",
    borderColor: "border-t1-500/30",
    gradientFrom: "from-t1-900/30",
    gradientTo: "to-t2-900/10",
    getValue: (p: RankedPlayer) => formatNumber(p.credits),
    prizeLabel: "Credits Prize",
  },
  {
    key: "topEmpire",
    title: "Biggest Empire",
    icon: Users,
    color: "text-t2-300",
    bgColor: "bg-t2-500/10",
    borderColor: "border-t2-500/30",
    gradientFrom: "from-t2-900/30",
    gradientTo: "to-t1-900/10",
    getValue: (p: RankedPlayer) => `${p.ownedCount} players`,
    prizeLabel: "Empire Prize",
  },
] as const;

// Rank ladder definitions for the "All Ranks" section
const RANK_LADDERS = [
  {
    name: "Empire",
    description: "Based on number of owned players",
    icon: Swords,
    color: "text-t1-400",
    bgColor: "bg-t1-500/10",
    borderColor: "border-t1-500/30",
    accentColor: "text-t1-300",
    barColor: "bg-t1-500",
    tiers: OWNED_RANKS,
    unit: "players",
    formatThreshold: (t: number) => `${t} players`,
  },
  {
    name: "Credits",
    description: "Based on credit balance",
    icon: Coins,
    color: "text-t2-400",
    bgColor: "bg-t2-500/10",
    borderColor: "border-t2-500/30",
    accentColor: "text-t2-300",
    barColor: "bg-t2-500",
    tiers: CREDITS_RANKS,
    unit: "¢",
    formatThreshold: (t: number) => `${formatNumber(t)}¢`,
  },
  {
    name: "Value",
    description: "Based on player value",
    icon: TrendingUp,
    color: "text-t1-400",
    bgColor: "bg-t1-500/10",
    borderColor: "border-t1-500/30",
    accentColor: "text-t1-300",
    barColor: "bg-t1-500",
    tiers: VALUE_RANKS,
    unit: "value",
    formatThreshold: (t: number) => `$${formatNumber(t)}`,
  },
  {
    name: "Portfolio",
    description: "Based on total portfolio value",
    icon: Briefcase,
    color: "text-t2-400",
    bgColor: "bg-t2-500/10",
    borderColor: "border-t2-500/30",
    accentColor: "text-t2-300",
    barColor: "bg-t2-500",
    tiers: PORTFOLIO_RANKS,
    unit: "value",
    formatThreshold: (t: number) => `$${formatNumber(t)}`,
  },
];

/** Get the rank title for a player based on the leaderboard category */
function getPlayerRankTitle(player: RankedPlayer, categoryKey: string): string {
  switch (categoryKey) {
    case "topValue":
      return getValueRank(player.playerValue).title;
    case "topPortfolio":
      return getPortfolioRank(player.portfolioValue).title;
    case "topCredits":
      return getCreditsRank(player.credits).title;
    case "topEmpire":
      return getOwnedRank(player.ownedCount).title;
    default:
      return "";
  }
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

function RankTierCard({
  tier,
  index,
  totalTiers,
  color,
  barColor,
  formatThreshold,
}: {
  tier: RankTier;
  index: number;
  totalTiers: number;
  color: string;
  barColor: string;
  formatThreshold: (t: number) => string;
}) {
  const progress = ((index + 1) / totalTiers) * 100;
  const isMax = index === totalTiers - 1;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-6 text-center">
        {isMax ? (
          <Crown className={`h-4 w-4 ${color} mx-auto`} />
        ) : (
          <span className="text-xs text-gray-600 font-mono">{index + 1}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={`text-sm font-semibold ${isMax ? color : "text-gray-200"}`}>
            {tier.title}
          </span>
          <span className="text-xs text-gray-500 shrink-0">
            {index === 0 ? "Start" : `≥ ${formatThreshold(tier.threshold)}`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all duration-500`}
            style={{ width: `${progress}%`, opacity: 0.3 + (progress / 100) * 0.7 }}
          />
        </div>
      </div>
    </div>
  );
}

function RankLadderSection({
  ladder,
}: {
  ladder: typeof RANK_LADDERS[number];
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const Icon = ladder.icon;
  const visibleTiers = isExpanded ? ladder.tiers : ladder.tiers.slice(0, 4);

  return (
    <Card className={`${ladder.bgColor} ${ladder.borderColor} border overflow-hidden`}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-base flex items-center gap-2 ${ladder.color}`}>
          <Icon className="h-5 w-5" />
          {ladder.name} Ranks
        </CardTitle>
        <p className="text-xs text-gray-500 mt-0.5">{ladder.description}</p>
      </CardHeader>
      <CardContent className="pt-0 space-y-0.5">
        {visibleTiers.map((tier, index) => (
          <RankTierCard
            key={tier.title}
            tier={tier}
            index={index}
            totalTiers={ladder.tiers.length}
            color={ladder.color}
            barColor={ladder.barColor}
            formatThreshold={ladder.formatThreshold}
          />
        ))}
        {ladder.tiers.length > 4 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors pt-2 w-full justify-center"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Show All {ladder.tiers.length} Tiers
              </>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export default function RanksPage() {
  const { data: session } = useSession();
  const { ownedIds } = useOwnedPlayerIds();
  const viewerUsername = session?.user?.name;
  const { data, isLoading } = useQuery<RanksData>({
    queryKey: ["ranks"],
    queryFn: async () => {
      const res = await fetch("/api/ranks");
      if (!res.ok) throw new Error("Failed to fetch ranks");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const [activeTab, setActiveTab] = useState<"leaderboard" | "titles">("leaderboard");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-t1-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-24 text-gray-400">
        Failed to load ranks
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Crown className="h-6 w-6 text-t1-400" />
          Hall of Fame
        </h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-400">{data.totalPlayers} players total</p>
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 p-1 rounded-xl bg-gray-900/60 border border-gray-800">
        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-125 ${
            activeTab === "leaderboard"
              ? "text-cyan-400 border-0 drop-shadow-lg brightness-125 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
              : "text-gray-400 brightness-50 border-0"
          }`}
          style={navbarBtnStyle}
        >
          <Trophy className="h-4 w-4" />
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab("titles")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:brightness-125 ${
            activeTab === "titles"
              ? "text-cyan-400 border-0 drop-shadow-lg brightness-125 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]"
              : "text-gray-400 brightness-50 border-0"
          }`}
          style={navbarBtnStyle}
        >
          <Star className="h-4 w-4" />
          All Rank Titles
        </button>
      </div>

      {/* Leaderboard Tab */}
      {activeTab === "leaderboard" && (
        <div className="space-y-6">
          {/* Featured: Most Hired */}
          <Card className="overflow-hidden border-2 border-amber-500/60 shadow-lg shadow-amber-500/20">
            <div className="bg-gradient-to-br from-yellow-900/40 via-amber-900/30 to-orange-900/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-xl sm:text-2xl flex items-center gap-2 text-amber-300">
                    <Trophy className="h-6 w-6 sm:h-7 sm:w-7 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                    Most Hired
                  </CardTitle>
                  <span className="text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full border border-amber-400/60 bg-amber-500/20 text-amber-200 uppercase tracking-wider">
                    ★ Hall of Fame ★
                  </span>
                </div>
                <p className="text-xs text-amber-200/70 mt-1">
                  Players hired the most times across the realm
                </p>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {(data.topHired ?? []).map((player, index) => {
                  const isTopThree = index < 3;
                  const isFirst = index === 0;
                  return (
                    <Link
                      key={player.id}
                      href={`/players/${player.username}`}
                      className={`flex items-center gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-lg transition-all group ${
                        isFirst
                          ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/10 hover:from-amber-500/30 hover:to-yellow-500/20 ring-1 ring-amber-400/30"
                          : isTopThree
                            ? "hover:bg-white/10 bg-white/5"
                            : "hover:bg-white/5"
                      }`}
                    >
                      <span
                        className={`w-8 text-center font-bold text-base sm:text-lg ${
                          index === 0
                            ? "text-amber-400"
                            : index === 1
                              ? "text-gray-300"
                              : index === 2
                                ? "text-orange-400"
                                : "text-gray-500"
                        }`}
                      >
                        {index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}
                      </span>
                      <Avatar
                        className={
                          isFirst
                            ? "h-20 w-20 sm:h-24 sm:w-24 ring-4 ring-amber-400/80 shadow-lg shadow-amber-500/40"
                            : isTopThree
                              ? `h-16 w-16 sm:h-18 sm:w-18 ring-2 ${
                                  index === 1 ? "ring-gray-300/70" : "ring-orange-400/60"
                                }`
                              : "h-12 w-12 sm:h-14 sm:w-14 ring-1 ring-amber-400/30"
                        }
                      >
                        <AvatarImage src={getAvatarSrc({ avatarUrl: player.avatarUrl, playerId: player.id, playerUsername: player.username, viewerUsername, ownedIds })} />
                        <AvatarFallback className="text-sm bg-gray-800">
                          {player.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-white truncate group-hover:text-amber-300 transition-colors ${isFirst ? "text-lg sm:text-xl" : isTopThree ? "text-base" : "text-sm"}`}>
                          {player.username}
                        </p>
                        {isTopThree && (
                          <p className="text-[11px] text-amber-300/80">
                            Most-Hired Champion
                          </p>
                        )}
                      </div>
                      <span className={`font-bold text-amber-300 shrink-0 ${isFirst ? "text-xl sm:text-2xl" : isTopThree ? "text-lg" : "text-base"}`}>
                        {formatNumber(player.purchaseCount ?? 0)}
                        <span className="text-xs text-amber-400/70 ml-1 font-normal">hires</span>
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {RANK_CATEGORIES.map((category) => {
            const players = data[category.key as keyof RanksData] as RankedPlayer[];
            return (
              <Card
                key={category.key}
                className={`overflow-hidden border ${category.borderColor}`}
              >
                <div className={`bg-gradient-to-br ${category.gradientFrom} ${category.gradientTo}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className={`text-lg flex items-center gap-2 ${category.color}`}>
                      <category.icon className="h-5 w-5" />
                      {category.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {players.map((player, index) => {
                      const isTopThree = index < 3;
                      const rankTitle = getPlayerRankTitle(player, category.key);
                      return (
                        <Link
                          key={player.id}
                          href={`/players/${player.username}`}
                          className={`flex items-center gap-3 p-2 rounded-lg transition-colors group ${
                            isTopThree
                              ? "hover:bg-white/10 bg-white/5"
                              : "hover:bg-white/5"
                          }`}
                        >
                          <span
                            className={`w-6 text-center font-bold text-sm ${
                              index === 0
                                ? "text-t1-400"
                                : index === 1
                                  ? "text-t2-400"
                                  : index === 2
                                    ? "text-t1-300"
                                    : "text-gray-500"
                            }`}
                          >
                            {index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}
                          </span>
                          <Avatar
                            className={
                              isTopThree
                                ? `h-11 w-11 ring-2 ${
                                    index === 0
                                      ? "ring-t1-400/70"
                                      : index === 1
                                        ? "ring-t2-400/60"
                                        : "ring-t1-300/50"
                                  }`
                                : "h-8 w-8"
                            }
                          >
                            <AvatarImage src={getAvatarSrc({ avatarUrl: player.avatarUrl, playerId: player.id, playerUsername: player.username, viewerUsername, ownedIds })} />
                            <AvatarFallback className="text-xs bg-gray-800">
                              {player.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-white truncate group-hover:text-t1-400 transition-colors">
                                {player.username}
                              </p>
                              <span className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${category.borderColor} ${category.bgColor} ${category.color}`}>
                                {rankTitle}
                              </span>
                            </div>
                            {isTopThree && (
                              <p className="text-[10px] text-gray-500">
                                +{PRIZE_AMOUNTS[index]}¢/hr
                              </p>
                            )}
                          </div>
                          <span className={`text-sm font-semibold ${category.color} shrink-0`}>
                            {category.getValue(player)}
                          </span>
                        </Link>
                      );
                    })}
                  </CardContent>
                </div>
              </Card>
            );
          })}
          </div>
        </div>
      )}

      {/* All Rank Titles Tab */}
      {activeTab === "titles" && (
        <div className="space-y-6">
          {/* Introduction */}
          <div className="rounded-xl bg-gradient-to-br from-t1-900/20 to-t2-900/20 border border-t1-500/20 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-5 w-5 text-t1-400" />
              <h3 className="text-sm sm:text-base font-semibold text-t1-400">
                Rank Title System
              </h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Every player earns titles across 4 different categories. Each category has 10 tiers — 
              from beginner to legendary. Your titles update automatically as you progress. 
              Rank titles are displayed on your player card for everyone to see.
            </p>
          </div>

          {/* Rank Ladders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {RANK_LADDERS.map((ladder) => (
              <RankLadderSection key={ladder.name} ladder={ladder} />
            ))}
          </div>

          {/* Summary Table */}
          <Card className="border-t1-500/30 bg-card overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base text-foreground flex items-center gap-2">
                <Trophy className="h-5 w-5 text-t1-400" />
                Quick Reference — All Titles
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-medium">Tier</th>
                      {RANK_LADDERS.map((l) => (
                        <th key={l.name} className={`text-left py-2.5 px-3 font-medium ${l.color}`}>
                          <span className="flex items-center gap-1">
                            <l.icon className="h-3 w-3" />
                            {l.name}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 10 }, (_, i) => (
                      <tr
                        key={i}
                        className={`border-b border-border/50 ${
                          i === 9 ? "bg-t1-500/5" : i >= 7 ? "bg-white/[0.02]" : ""
                        }`}
                      >
                        <td className="py-2 px-3 text-muted-foreground font-mono">
                          {i === 9 ? (
                            <Crown className="h-3 w-3 text-t1-400 inline" />
                          ) : (
                            i + 1
                          )}
                        </td>
                        {RANK_LADDERS.map((l) => {
                          const tier = l.tiers[i];
                          if (!tier) return <td key={l.name} className="py-2 px-3">—</td>;
                          return (
                            <td key={l.name} className="py-2 px-3">
                              <span className={`font-semibold ${i === 9 ? l.color : "text-foreground"}`}>
                                {tier.title}
                              </span>
                              <span className="text-muted-foreground ml-1">
                                {i === 0 ? "" : `(${l.formatThreshold(tier.threshold)})`}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
