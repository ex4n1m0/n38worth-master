"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, Star } from "lucide-react";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { formatCompact, formatLastOnline } from "@/lib/utils";

/**
 * Shorten goddess usernames for compact UIs (Live Activity and Ranks) by hiding
 * the "Goddess of " prefix — "Goddess of Wealth" → "Wealth", "Goddess" →
 * "Goddess". The full name is still used everywhere else in the game.
 */
function shortName(username: string): string {
  if (username === "Goddess") return "Goddess";
  if (username.startsWith("Goddess of ")) return username.slice("Goddess of ".length);
  return username;
}

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

interface OnlineHuman {
  id: number;
  username: string;
  lastOnlineAt: string;
}

interface SidebarData {
  lastOnlineHumans: OnlineHuman[];
}

interface StripConfig {
  key: keyof RanksResponse;
  label: string;
  getValue: (p: RankPlayer) => number;
  suffix?: string;
}

const STRIPS: StripConfig[] = [
  {
    key: "topEmpire",
    label: "Biggest Empire",
    getValue: (p) => p.ownedCount,
  },
  {
    key: "topCredits",
    label: "Most Credits",
    getValue: (p) => p.credits,
    suffix: "¢",
  },
];

// Medal colouring for the top 3 positions.
const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

/** Shared shell for every Avatar in the strip. Titles are always plain white. */
function StripCard({
  label,
  children,
  accent,
}: {
  label: string;
  children: React.ReactNode;
  /** Optional border/background override (used by Hall of Champions). */
  accent?: string;
}) {
  const shell = accent ?? "border border-white/10 bg-transparent";
  return (
    <div className={`rounded-xl p-2.5 ${shell}`}>
      <div className="mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wide truncate text-white">{label}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyList({ text = "No entries yet" }: { text?: string }) {
  return <p className="text-[11px] text-gray-600 italic">{text}</p>;
}

/** A compact, always-visible ranking Avatar showing the top 5. */
function RankCard({ cfg, entries }: { cfg: StripConfig; entries: RankPlayer[] }) {
  const top = entries.filter((p) => cfg.getValue(p) > 0).slice(0, 5);
  return (
    <StripCard
      label={cfg.label}
    >
      {top.length === 0 ? (
        <EmptyList />
      ) : (
        <ol className="space-y-1">
          {top.map((p, i) => (
            <li key={p.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
              <span className={`w-3.5 shrink-0 text-center font-mono font-bold ${RANK_COLORS[i] ?? "text-gray-500"}`}>
                {i + 1}
              </span>
              <Link href={`/players/${p.username}`} className="flex-1 truncate font-medium text-gray-200 hover:underline">
                {shortName(p.username)}
              </Link>
              <span className="shrink-0 font-mono tabular-nums text-gray-400">
                {formatCompact(cfg.getValue(p))}
                {cfg.suffix ?? ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </StripCard>
  );
}

/**
 * "Live Activity and Ranks" — a single row combining recent activity and the
 * headline rankings: Recently Online, Biggest Empire, Most Credits, and
 * (optionally) the Hall of Champions. Used on the landing page (transparent)
 * and the in-game Cards page (default). The in-game page passes
 * showChampions={false} because the Hall of Champions lives at the top of
 * the History page there.
 */
export function EmpireRankStrip({ variant = "default", showChampions = true }: { variant?: "default" | "transparent"; showChampions?: boolean } = {}) {
  const transparent = variant === "transparent";

  const { data } = useQuery<RanksResponse>({
    queryKey: ["ranks"],
    queryFn: async () => {
      const res = await fetch("/api/ranks");
      if (!res.ok) throw new Error("Failed to fetch ranks");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
  });

  const { data: sidebarData } = useQuery<SidebarData>({
    queryKey: ["leaderboard-sidebars"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard-sidebars");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 15 * 1000,
    refetchInterval: 150 * 1000,
  });

  const { data: champions = [] } = useQuery<ChampionEntry[]>({
    queryKey: ["hall-of-fame"],
    queryFn: async () => {
      const res = await fetch("/api/hall-of-fame");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showChampions,
    staleTime: 60 * 1000,
  });

  const humans = sidebarData?.lastOnlineHumans ?? [];
  const topChampions = champions.slice(0, 5);

  // Ticking clock so "online" badges stay accurate without calling Date.now()
  // during render (which would be impure).
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  // "Online" = last online within the last 3 minutes.
  const isOnline = (lastOnlineAt: string) =>
    now > 0 && now - new Date(lastOnlineAt).getTime() < 3 * 60 * 1000;

  return (
    <div className={transparent ? "p-3 sm:p-4" : "rounded-2xl border border-gray-800 p-3 sm:p-4"}>
      <div className={`grid grid-cols-2 gap-2 ${showChampions ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {/* 1. Recently Online */}
        <StripCard
          label="Recently Online"
        >
          {humans.length === 0 ? (
            <EmptyList />
          ) : (
            <ol className="space-y-1">
              {humans.slice(0, 5).map((h, i) => {
                const online = isOnline(h.lastOnlineAt);
                return (
                  <li key={h.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                    <span className="w-3.5 shrink-0 text-center font-mono font-bold text-gray-500">
                      {i + 1}
                    </span>
                    {online && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <Link href={`/players/${h.username}`} className={`flex-1 truncate font-medium hover:underline ${online ? "text-emerald-300" : "text-gray-200"}`}>
                      {shortName(h.username)}
                    </Link>
                    <span className="shrink-0 text-gray-500">
                      {online ? "online" : formatLastOnline(h.lastOnlineAt)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </StripCard>

        {/* 2. Biggest Empire · 3. Most Credits */}
        {STRIPS.map((cfg) => (
          <RankCard key={cfg.key} cfg={cfg} entries={data?.[cfg.key] ?? []} />
        ))}

        {/* 4. Hall of Champions — latest winners. Skipped in-game (the list
            lives at the top of the History page); shown on the landing page. */}
        {showChampions && (
          <StripCard
            label="Hall of Champions"
            accent={
              transparent
                ? "border border-yellow-500/20 bg-transparent"
                : "border border-yellow-500/20 bg-yellow-500/[0.04]"
            }
          >
            {topChampions.length === 0 ? (
              <EmptyList text="No champions yet" />
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
                      {shortName(w.username)}
                    </Link>
                    <span className="shrink-0 flex items-center gap-0.5 text-gray-500">
                      <Calendar className="h-2.5 w-2.5" />
                      {new Date(w.wonAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </StripCard>
        )}
      </div>
    </div>
  );
}
