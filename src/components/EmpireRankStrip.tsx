"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Calendar, Star } from "lucide-react";
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

interface ScoreEntry {
  id: number;
  username: string;
  photoScore: number;
}

interface HireEvent {
  id: number;
  actorUsername: string | null;
  targetUsername: string;
  cost: number | null;
  createdAt: string;
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
  topScorePlayers: ScoreEntry[];
  recentGets: HireEvent[];
}

interface StripConfig {
  key: keyof RanksResponse;
  label: string;
  getValue: (p: RankPlayer) => number;
  suffix?: string;
}

// The four /api/ranks boards mirror the four rank-title ladders in
// src/lib/ranks.ts: Credits (Null→Yotta), Grid/owned (Lurker→Architect),
// Portfolio (Void→Hegemon) and Value (Ghost→Ascendant). The Root Wall
// (world-reset winners) and the live feeds sit between/after them.
const STRIPS: StripConfig[] = [
  {
    key: "topCredits",
    label: "Most Credits",
    getValue: (p) => p.credits,
    suffix: "¢",
  },
  {
    key: "topEmpire",
    label: "Widest Grid",
    getValue: (p) => p.ownedCount,
  },
  {
    key: "topPortfolio",
    label: "Top Portfolio",
    getValue: (p) => p.portfolioValue,
    suffix: "¢",
  },
  {
    key: "topValue",
    label: "Top Value",
    getValue: (p) => p.playerValue,
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

/** Shared top-10 row list used by every ranking board in the strip. */
function RankList({ rows, suffix }: { rows: RankRow[]; suffix?: string }) {
  const top = rows.filter((r) => r.value > 0).slice(0, 10);
  if (top.length === 0) return <EmptyList />;
  return (
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
            {formatCompact(p.value)}
            {suffix ?? ""}
          </span>
        </li>
      ))}
    </ol>
  );
}

interface RankRow {
  id: number;
  username: string;
  value: number;
}

/** A compact, always-visible ranking Avatar showing the top 10. */
function RankCard({ cfg, entries }: { cfg: StripConfig; entries: RankPlayer[] }) {
  return (
    <StripCard label={cfg.label}>
      <RankList
        rows={entries.map((p) => ({ id: p.id, username: p.username, value: cfg.getValue(p) }))}
        suffix={cfg.suffix}
      />
    </StripCard>
  );
}

/** Live hire feed — "who just hired whom, for how much". */
function HireFeed({ events }: { events: HireEvent[] }) {
  if (events.length === 0) return <EmptyList text="No hires yet" />;
  return (
    <ol className="space-y-1">
      {events.slice(0, 10).map((e, i) => (
        <li key={e.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
          <span className="w-3.5 shrink-0 text-center font-mono font-bold text-gray-500">
            {i + 1}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {e.actorUsername ? (
              <Link
                href={`/players/${e.actorUsername}`}
                className="truncate font-medium text-gray-200 hover:underline"
              >
                {shortName(e.actorUsername)}
              </Link>
            ) : (
              <span className="truncate text-gray-500">someone</span>
            )}
            <ArrowRight className="h-2.5 w-2.5 shrink-0 text-gray-600" />
            <Link
              href={`/players/${e.targetUsername}`}
              className="truncate font-medium text-cyan-300 hover:underline"
            >
              {shortName(e.targetUsername)}
            </Link>
          </span>
          {e.cost != null && (
            <span className="shrink-0 font-mono tabular-nums text-gray-400">
              {formatCompact(e.cost)}¢
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * "Live Activity and Ranks" — eight always-on live boards (top 10 each):
 * Most Credits, Widest Grid, The Root Wall, Top Score, Top Portfolio, Top
 * Value, Recent Hires and Recently Online. Used on the in-game Home tab
 * (transparent variant). The Root Wall here is a compact latest-10 winners
 * view; the full wall still lives at the top of the History page.
 */
export function EmpireRankStrip({ variant = "default" }: { variant?: "default" | "transparent" } = {}) {
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
    staleTime: 60 * 1000,
  });

  const humans = sidebarData?.lastOnlineHumans ?? [];
  const topScore = sidebarData?.topScorePlayers ?? [];
  const recentHires = sidebarData?.recentGets ?? [];
  const topChampions = champions.slice(0, 10);

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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {/* 1. Most Credits · 2. Widest Grid */}
        {STRIPS.slice(0, 2).map((cfg) => (
          <RankCard key={cfg.key} cfg={cfg} entries={data?.[cfg.key] ?? []} />
        ))}

        {/* 3. The Root Wall — latest world-reset winners (compact view of
            the History page's Hall of Champions). */}
        <StripCard
          label="The Root Wall"
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

        {/* 4. Top Score — most purchased/pumped Avatars (photoScore). */}
        <StripCard label="Top Score">
          <RankList rows={topScore.map((p) => ({ id: p.id, username: p.username, value: p.photoScore }))} />
        </StripCard>

        {/* 5. Top Portfolio · 6. Top Value */}
        {STRIPS.slice(2).map((cfg) => (
          <RankCard key={cfg.key} cfg={cfg} entries={data?.[cfg.key] ?? []} />
        ))}

        {/* 7. Recent Hires — latest purchase events. */}
        <StripCard label="Recent Hires">
          <HireFeed events={recentHires} />
        </StripCard>

        {/* 8. Recently Online */}
        <StripCard
          label="Recently Online"
        >
          {humans.length === 0 ? (
            <EmptyList />
          ) : (
            <ol className="space-y-1">
              {humans.slice(0, 10).map((h, i) => {
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
      </div>
    </div>
  );
}
