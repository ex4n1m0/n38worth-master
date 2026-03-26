"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Crown, Users, Clock, Wallet, TrendingUp, DollarSign, Gift } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";

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
    getValue: (p: RankedPlayer) =>
      p.createdAt ? formatDistanceToNow(new Date(p.createdAt), { addSuffix: false }) : "N/A",
    prizeLabel: "Legacy Prize",
  },
] as const;

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

const MEDAL_LABELS = ["🥇", "🥈", "🥉"];
const MEDAL_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {RANK_CATEGORIES.map((category) => {
          const players = data[category.key as keyof RanksData] as RankedPlayer[];
          return (
            <Card
              key={category.key}
              className={`${category.bgColor} ${category.borderColor} border`}
            >
              <CardHeader className="pb-3">
                <CardTitle className={`text-lg flex items-center gap-2 ${category.color}`}>
                  <category.icon className="h-5 w-5" />
                  {category.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {players.map((player, index) => (
                  <Link
                    key={player.id}
                    href={`/players/${player.username}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
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
                      {index + 1}
                    </span>
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={player.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs bg-gray-800">
                        {player.username.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate group-hover:text-t1-400 transition-colors">
                        {player.username}
                      </p>
                    </div>
                    <span className={`text-sm font-semibold ${category.color} shrink-0`}>
                      {category.getValue(player)}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
