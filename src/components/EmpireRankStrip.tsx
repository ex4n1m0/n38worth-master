"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Users, Briefcase, Coins, Crown, Calendar, Star, Trophy } from "lucide-react";
import React from "react";
import Link from "next/link";
import { formatCompact } from "@/lib/utils";

interface RankPlayer {
  id: number;
  username: string;
  ownedCount: number;
  portfolioValue: number;
  playerValue: number;
  credits: number;
}

interface RanksResponse {
  topEmpire: RankPlayer[];
  topPortfolio: RankPlayer[];
  topValue: RankPlayer[];
  topCredits: RankPlayer[];
}

interface ChampionEntry {
  id: number;
  userId: number;
  username: string;
  wonAt: string;
}

interface StripConfig {
  key: keyof RanksResponse;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  labelClass: string;
  getValue: (p: RankPlayer) => number;
  suffix?: string;
}

const STRIPS: StripConfig[] = [
  {
    key: "topEmpire",
    label: "Biggest Empire",
    icon: Users,
    iconClass: "text-purple-400",
    labelClass: "text-purple-300",
    getValue: (p) => p.ownedCount,
  },
  {
    key: "topPortfolio",
    label: "Top Portfolio",
    icon: Briefcase,
    iconClass: "text-emerald-400",
    labelClass: "text-emerald-300",
    getValue: (p) => p.portfolioValue,
    suffix: "¢",
  },
  {
    key: "topCredits",
    label: "Most Credits",
    icon: Coins,
    iconClass: "text-cyan-400",
    labelClass: "text-cyan-300",
    getValue: (p) => p.credits,
    suffix: "¢",
  },
];

// Medal colouring for the top 3 positions.
const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

/** A single compact, always-visible ranking card showing the top 3. */
function RankCard({ cfg, entries }: { cfg: StripConfig; entries: RankPlayer[] }) {
  const Icon = cfg.icon;
  const top = entries.filter((p) => cfg.getValue(p) > 0).slice(0, 5);
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className={`flex items-center gap-1.5 mb-2 ${cfg.labelClass}`}>
        <Icon className={`h-4 w-4 shrink-0 ${cfg.iconClass}`} />
        <span className="text-[11px] font-bold uppercase tracking-wide truncate">{cfg.label}</span>
      </div>
      {top.length === 0 ? (
        <p className="text-[11px] text-gray-600 italic">No entries yet</p>
      ) : (
        <ol className="space-y-1">
          {top.map((p, i) => (
            <li key={p.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
              <span className={`w-3.5 shrink-0 text-center font-mono font-bold ${RANK_COLORS[i] ?? "text-gray-500"}`}>
                {i + 1}
              </span>
              <Link href={`/players/${p.username}`} className="flex-1 truncate font-medium text-gray-200 hover:underline">
                {p.username}
              </Link>
              <span className="shrink-0 font-mono tabular-nums text-gray-400">
                {formatCompact(cfg.getValue(p))}
                {cfg.suffix ?? ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function EmpireRankStrip() {
  const { data: session } = useSession();

  const { data } = useQuery<RanksResponse>({
    queryKey: ["ranks"],
    queryFn: async () => {
      const res = await fetch("/api/ranks");
      if (!res.ok) throw new Error("Failed to fetch ranks");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const { data: champions = [] } = useQuery<ChampionEntry[]>({
    queryKey: ["hall-of-fame"],
    queryFn: async () => {
      const res = await fetch("/api/hall-of-fame");
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  if (!session) return null;

  const topChampions = champions.slice(0, 5);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-5 w-5 text-t1-400" />
        <h2 className="font-bold text-white">Live Rankings</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {STRIPS.map((cfg) => (
          <RankCard key={cfg.key} cfg={cfg} entries={data?.[cfg.key] ?? []} />
        ))}

        {/* Hall of Champions — latest 3 winners, always visible. */}
        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/[0.04] p-2.5">
          <div className="flex items-center gap-1.5 mb-2 text-yellow-300">
            <Crown className="h-4 w-4 shrink-0 text-yellow-400" />
            <span className="text-[11px] font-bold uppercase tracking-wide truncate">Hall of Champions</span>
          </div>
          {topChampions.length === 0 ? (
            <p className="text-[11px] text-gray-600 italic">No champions yet</p>
          ) : (
            <ol className="space-y-1">
              {topChampions.map((w, i) => (
                <li key={w.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                  <span className="w-3.5 shrink-0 flex items-center justify-center">
                    {i === 0 ? (
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                    ) : (
                      <span className="font-mono font-bold text-gray-500">{champions.length - i}</span>
                    )}
                  </span>
                  <Link href={`/players/${w.username}`} className={`flex-1 truncate font-semibold hover:underline ${i === 0 ? "text-yellow-300" : "text-white"}`}>
                    {w.username}
                  </Link>
                  <span className="shrink-0 flex items-center gap-0.5 text-gray-500">
                    <Calendar className="h-2.5 w-2.5" />
                    {new Date(w.wonAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
