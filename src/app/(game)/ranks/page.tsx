"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Crown, Users, Clock, Wallet, TrendingUp, DollarSign, Gift, Swords, Hourglass, Coins, Briefcase, ChevronDown, ChevronUp, Trophy, Star } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";
import {
  OWNED_RANKS,
  AGE_RANKS,
  CREDITS_RANKS,
  VALUE_RANKS,
  PORTFOLIO_RANKS,
  type RankTier,
} from "@/lib/ranks";

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
}

interface RanksData {
  topEmpire: RankedPlayer[];
  topLegacy: RankedPlayer[];
  topPortfolio: RankedPlayer[];
  topCredits: RankedPlayer[];
  topValue: RankedPlayer[];
  totalPlayers: number;
}

const PRIZE_AMOUNTS = [3, 2, 1]; // 1st, 2nd, 3rd

const RANK_CATEGORIES = [
  {
    key: "topValue",
    title: "Highest Value",
    icon: DollarSign,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    gradientFrom: "from-yellow-900/30",
    gradientTo: "to-amber-900/10",
    getValue: (p: RankedPlayer) => `$${formatNumber(p.playerValue)}`,
    prizeLabel: "Value Prize",
  },
  {
    key: "topPortfolio",
    title: "Top Portfolio",
    icon: TrendingUp,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    gradientFrom: "from-purple-900/30",
    gradientTo: "to-indigo-900/10",
    getValue: (p: RankedPlayer) => `$${formatNumber(p.portfolioValue)}`,
    prizeLabel: "Portfolio Prize",
  },
  {
    key: "topCredits",
    title: "Most Credits",
    icon: Wallet,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    gradientFrom: "from-emerald-900/30",
    gradientTo: "to-green-900/10",
    getValue: (p: RankedPlayer) => formatNumber(p.credits),
    prizeLabel: "Credits Prize",
  },
  {
    key: "topEmpire",
    title: "Biggest Empire",
    icon: Users,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    gradientFrom: "from-blue-900/30",
    gradientTo: "to-cyan-900/10",
    getValue: (p: RankedPlayer) => `${p.ownedCount} players`,
    prizeLabel: "Empire Prize",
  },
  {
    key: "topLegacy",
    title: "OG Players",
    icon: Clock,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    gradientFrom: "from-orange-900/30",
    gradientTo: "to-red-900/10",
    getValue: (p: RankedPlayer) =>
      p.createdAt ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: false }) : "N/A",
    prizeLabel: "Legacy Prize",
  },
] as const;

// Rank ladder definitions for the "All Ranks" section
const RANK_LADDERS = [
  {
    name: "Empire",
    description: "Based on number of owned players",
    icon: Swords,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    accentColor: "text-blue-300",
    barColor: "bg-blue-500",
    tiers: OWNED_RANKS,
    unit: "players",
    formatThreshold: (t: number) => `${t} players`,
  },
  {
    name: "Legacy",
    description: "Based on account age",
    icon: Hourglass,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
    accentColor: "text-orange-300",
    barColor: "bg-orange-500",
    tiers: AGE_RANKS,
    unit: "days",
    formatThreshold: (t: number) => t === 0 ? "0 days" : t < 30 ? `${t} days` : t < 365 ? `${Math.floor(t / 30)} months` : `${(t / 365).toFixed(1)} years`,
  },
  {
    name: "Credits",
    description: "Based on credit balance",
    icon: Coins,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    accentColor: "text-emerald-300",
    barColor: "bg-emerald-500",
    tiers: CREDITS_RANKS,
    unit: "¢",
    formatThreshold: (t: number) => `${formatNumber(t)}¢`,
  },
  {
    name: "Value",
    description: "Based on player value",
    icon: TrendingUp,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    accentColor: "text-rose-300",
    barColor: "bg-rose-500",
    tiers: VALUE_RANKS,
    unit: "value",
    formatThreshold: (t: number) => `$${formatNumber(t)}`,
  },
  {
    name: "Portfolio",
    description: "Based on total portfolio value",
    icon: Briefcase,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    accentColor: "text-purple-300",
    barColor: "bg-purple-500",
    tiers: PORTFOLIO_RANKS,
    unit: "value",
    formatThreshold: (t: number) => `$${formatNumber(t)}`,
  },
];

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

/** Calculate seconds remaining until the next :00 mark (top of hour) */
function getSecondsToNextHour() {
  const now = new Date();
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  const minutesLeft = 59 - mins;
  const secondsLeft = 59 - secs;
  return minutesLeft * 60 + secondsLeft;
}

function PrizeCountdown() {
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      setTotalSeconds(getSecondsToNextHour());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-yellow-500/20">
      <Clock className="h-3.5 w-3.5 text-yellow-400" />
      <span className="font-mono font-bold text-white text-sm">
        {pad(minutes)}:{pad(seconds)}
      </span>
    </div>
  );
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
          <Crown className="h-6 w-6 text-yellow-400" />
          Hall of Fame
        </h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-400">{data.totalPlayers} players total</p>
        </div>
      </div>

      {/* Global Prize Countdown */}
      <div className="rounded-xl bg-gradient-to-br from-yellow-900/20 to-amber-900/20 border border-yellow-500/20 p-4 sm:p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-yellow-400" />
            <h3 className="text-sm sm:text-base font-semibold text-yellow-400">
              Rank Prizes — Every Hour
            </h3>
          </div>
          <PrizeCountdown />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Top 3 players in each category receive credits every hour: 🥇 +{PRIZE_AMOUNTS[0]}¢ &nbsp; 🥈 +{PRIZE_AMOUNTS[1]}¢ &nbsp; 🥉 +{PRIZE_AMOUNTS[2]}¢
        </p>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 p-1 rounded-xl bg-gray-900/60 border border-gray-800">
        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "leaderboard"
              ? "bg-gradient-to-r from-yellow-600/30 to-amber-600/30 text-yellow-400 border border-yellow-500/30 shadow-sm"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50"
          }`}
        >
          <Trophy className="h-4 w-4" />
          Leaderboard
        </button>
        <button
          onClick={() => setActiveTab("titles")}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === "titles"
              ? "bg-gradient-to-r from-purple-600/30 to-pink-600/30 text-purple-400 border border-purple-500/30 shadow-sm"
              : "text-gray-400 hover:text-white hover:bg-gray-800/50"
          }`}
        >
          <Star className="h-4 w-4" />
          All Rank Titles
        </button>
      </div>

      {/* Leaderboard Tab */}
      {activeTab === "leaderboard" && (
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
                                ? "text-yellow-400"
                                : index === 1
                                  ? "text-gray-300"
                                  : index === 2
                                    ? "text-orange-400"
                                    : "text-gray-500"
                            }`}
                          >
                            {index < 3 ? ["🥇", "🥈", "🥉"][index] : index + 1}
                          </span>
                          <Avatar className={`h-8 w-8 ${isTopThree ? "ring-1 ring-white/20" : ""}`}>
                            <AvatarImage src={player.avatarUrl || undefined} />
                            <AvatarFallback className="text-xs bg-gray-800">
                              {player.username.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate group-hover:text-t1-400 transition-colors">
                              {player.username}
                            </p>
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
      )}

      {/* All Rank Titles Tab */}
      {activeTab === "titles" && (
        <div className="space-y-6">
          {/* Introduction */}
          <div className="rounded-xl bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/20 p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <Star className="h-5 w-5 text-purple-400" />
              <h3 className="text-sm sm:text-base font-semibold text-purple-400">
                Rank Title System
              </h3>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              Every player earns titles across 5 different categories. Each category has 10 tiers — 
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
          <Card className="border-gray-800 bg-gray-900/60 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-400" />
                Quick Reference — All Titles
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-2.5 px-3 text-gray-500 font-medium">Tier</th>
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
                        className={`border-b border-gray-800/50 ${
                          i === 9 ? "bg-yellow-500/5" : i >= 7 ? "bg-white/[0.02]" : ""
                        }`}
                      >
                        <td className="py-2 px-3 text-gray-500 font-mono">
                          {i === 9 ? (
                            <Crown className="h-3 w-3 text-yellow-400 inline" />
                          ) : (
                            i + 1
                          )}
                        </td>
                        {RANK_LADDERS.map((l) => {
                          const tier = l.tiers[i];
                          if (!tier) return <td key={l.name} className="py-2 px-3">—</td>;
                          return (
                            <td key={l.name} className="py-2 px-3">
                              <span className={`font-semibold ${i === 9 ? l.color : "text-gray-300"}`}>
                                {tier.title}
                              </span>
                              <span className="text-gray-600 ml-1">
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
