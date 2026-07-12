"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  TrendingUp,
  Coins,
  Crown,
  Users,
  Sparkles,
  ChevronRight,
  Star,
  Gem,
  User,
  CreditCard,
  Swords,
} from "lucide-react";
import {
  getOwnedRank,
  getValueRank,
  getOwnedRankColor,
  getValueRankColor,
} from "@/lib/ranks";
import { formatCompact } from "@/lib/utils";

/**
 * Compact "My Profile" card shown on the leaderboard.
 * - Square avatar (matching PlayerCard format)
 * - Key stats with warm gradient accents
 * - Quick link to full profile
 */
export function MyProfileCard() {
  const { data: session } = useSession();
  const username = session?.user?.name;

  const { data: player } = useQuery({
    queryKey: ["player", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!username,
    refetchInterval: 60 * 1000,
    staleTime: 20 * 1000,
  });

  if (!username || !player) return null;

  return (
    <Link
      href={`/players/${username}`}
      className="group block relative overflow-hidden rounded-3xl"
    >
      {/* Ambient gradient glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/25 via-pink-500/25 to-purple-600/25 pointer-events-none" />
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-pink-500/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-orange-500/25 blur-3xl pointer-events-none" />

      <div className="relative rounded-3xl border border-white/10 bg-gray-950/70 backdrop-blur-sm p-4 sm:p-5 group-hover:border-pink-400/40 transition-all duration-300">
        <div className="flex items-center gap-4">
          {/* Square avatar — matching PlayerCard format */}
          <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 relative overflow-hidden rounded-2xl ring-2 ring-white/10 group-hover:ring-pink-400/60 transition-all shadow-lg shadow-black/40">
            <Avatar className="w-full h-full rounded-2xl">
              <AvatarImage
                src={player.avatarUrl || undefined}
                className="object-cover"
              />
              <AvatarFallback className="rounded-2xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white font-bold text-xl">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {/* Header: username + badges */}
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 text-white shadow-md">
                <Sparkles className="h-2.5 w-2.5" />
                YOU
              </span>
              <h3 className="text-lg sm:text-xl font-black bg-gradient-to-r from-orange-300 via-pink-300 to-purple-300 bg-clip-text text-transparent truncate">
                {username}
              </h3>
              {player.valueFloor >= 100 && (
                <Gem className="h-4 w-4 text-purple-400 shrink-0" />
              )}
              {player.valueFloor >= 10 && player.valueFloor < 100 && (
                <Star className="h-4 w-4 text-yellow-400 shrink-0" />
              )}
            </div>

            {/* Rank chips */}
            <div className="flex items-center gap-1 flex-wrap mb-2">
              {player.playerType === "human" ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border text-emerald-200 bg-emerald-500/15 border-emerald-400/30">
                  <User className="h-2.5 w-2.5" />
                  {player.username === "Agent" ? "AGI" : "Human"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border text-cyan-200 bg-cyan-500/15 border-cyan-400/30">
                  <CreditCard className="h-2.5 w-2.5" />
                  Card
                </span>
              )}
              <span
                className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${getOwnedRankColor(
                  player.ownedCount
                )}`}
              >
                <Swords className="h-2.5 w-2.5" />
                {getOwnedRank(player.ownedCount).title}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${getValueRankColor(
                  player.playerValue
                )}`}
              >
                <TrendingUp className="h-2.5 w-2.5" />
                {getValueRank(player.playerValue).title}
              </span>
            </div>

            {/* Key stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <MiniStat
                icon={<TrendingUp className="h-3 w-3" />}
                label="Value"
                value={`${formatCompact(player.playerValue)}¢`}
                color="text-orange-300"
              />
              <MiniStat
                icon={<Coins className="h-3 w-3" />}
                label="Credits"
                value={`${formatCompact(
                  parseFloat((player.credits ?? 0).toFixed(2))
                )}¢`}
                color="text-yellow-300"
              />
              <MiniStat
                icon={<Crown className="h-3 w-3" />}
                label="Bosses"
                value={String(player.ownerCount)}
                color="text-rose-300"
              />
              <MiniStat
                icon={<Users className="h-3 w-3" />}
                label="Squad"
                value={String(player.ownedCount)}
                color="text-violet-300"
              />
            </div>
          </div>

          {/* Chevron */}
          <ChevronRight className="hidden sm:block h-6 w-6 text-gray-500 group-hover:text-pink-400 group-hover:translate-x-1 transition-all shrink-0" />
        </div>
      </div>
    </Link>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold ${color}`}>
        {icon}
        {label}
      </span>
      <span className="text-sm font-bold text-white font-mono truncate">{value}</span>
    </div>
  );
}
