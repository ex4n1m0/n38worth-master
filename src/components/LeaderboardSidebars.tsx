"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, ShoppingCart, Rocket, Star, Trophy } from "lucide-react";
import Link from "next/link";
import { formatCompact, formatLastOnline } from "@/lib/utils";

interface OnlineHuman {
  id: number;
  username: string;
  lastOnlineAt: string;
}

interface HistoryEvent {
  id: number;
  actorUsername: string | null;
  targetUsername: string | null;
  cost: number | null;
  createdAt: string;
}

interface ScorePlayer {
  id: number;
  username: string;
  photoScore: number;
}

interface SidebarData {
  lastOnlineHumans: OnlineHuman[];
  recentGets: HistoryEvent[];
  recentPumps: HistoryEvent[];
  topScorePlayers: ScorePlayer[];
}

// Medal colouring for the top 3 positions (matches EmpireRankStrip).
const RANK_COLORS = ["text-yellow-400", "text-gray-300", "text-amber-600"];

/** A single compact rank card — mirrors the EmpireRankStrip RankCard design. */
function SidebarCard({
  icon: Icon,
  iconClass,
  label,
  labelClass,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  label: string;
  labelClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <div className={`flex items-center gap-1.5 mb-2 ${labelClass}`}>
        <Icon className={`h-4 w-4 shrink-0 ${iconClass}`} />
        <span className="text-[11px] font-bold uppercase tracking-wide truncate">{label}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyList() {
  return <p className="text-[11px] text-gray-600 italic">No entries yet</p>;
}

export function LeaderboardSidebars() {
  const { data } = useQuery<SidebarData>({
    queryKey: ["leaderboard-sidebars"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard-sidebars");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

  const humans = data?.lastOnlineHumans ?? [];
  const gets = data?.recentGets ?? [];
  const pumps = data?.recentPumps ?? [];
  const scores = data?.topScorePlayers ?? [];

  // "Online" = last online within the last 3 minutes.
  const isOnline = (lastOnlineAt: string) =>
    Date.now() - new Date(lastOnlineAt).getTime() < 3 * 60 * 1000;

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900/40 p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="h-5 w-5 text-t1-400" />
        <h2 className="font-bold text-white">Live Activity</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {/* 1. Last 10 humans online */}
        <SidebarCard
          icon={Clock}
          iconClass="text-emerald-400"
          label="Recently Online"
          labelClass="text-emerald-300"
        >
          {humans.length === 0 ? (
            <EmptyList />
          ) : (
            <ol className="space-y-1">
              {humans.map((h, i) => {
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
                      {h.username}
                    </Link>
                    <span className="shrink-0 text-gray-500">
                      {online ? "online" : formatLastOnline(h.lastOnlineAt)}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </SidebarCard>

        {/* 2. Last 10 GET events */}
        <SidebarCard
          icon={ShoppingCart}
          iconClass="text-green-400"
          label="Latest GETs"
          labelClass="text-green-300"
        >
          {gets.length === 0 ? (
            <EmptyList />
          ) : (
            <ol className="space-y-1">
              {gets.map((e, i) => (
                <li key={e.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                  <span className="w-3.5 shrink-0 text-center font-mono font-bold text-gray-500">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">
                    {e.actorUsername ? (
                      <Link href={`/players/${e.actorUsername}`} className="font-medium text-gray-200 hover:underline">
                        {e.actorUsername}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-200">—</span>
                    )}
                    <span className="text-gray-500"> → </span>
                    {e.targetUsername ? (
                      <Link href={`/players/${e.targetUsername}`} className="text-gray-300 hover:underline">
                        {e.targetUsername}
                      </Link>
                    ) : (
                      <span className="text-gray-500">?</span>
                    )}
                  </span>
                  {e.cost != null && (
                    <span className="shrink-0 font-mono tabular-nums text-green-400">
                      {formatCompact(e.cost)}¢
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </SidebarCard>

        {/* 3. Last 10 PUMP events */}
        <SidebarCard
          icon={Rocket}
          iconClass="text-fuchsia-400"
          label="Latest PUMPs"
          labelClass="text-fuchsia-300"
        >
          {pumps.length === 0 ? (
            <EmptyList />
          ) : (
            <ol className="space-y-1">
              {pumps.map((e, i) => (
                <li key={e.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                  <span className="w-3.5 shrink-0 text-center font-mono font-bold text-gray-500">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate">
                    {e.actorUsername ? (
                      <Link href={`/players/${e.actorUsername}`} className="font-medium text-gray-200 hover:underline">
                        {e.actorUsername}
                      </Link>
                    ) : (
                      <span className="font-medium text-gray-200">—</span>
                    )}
                    <span className="text-gray-500"> → </span>
                    {e.targetUsername ? (
                      <Link href={`/players/${e.targetUsername}`} className="text-gray-300 hover:underline">
                        {e.targetUsername}
                      </Link>
                    ) : (
                      <span className="text-gray-500">?</span>
                    )}
                  </span>
                  {e.cost != null && (
                    <span className="shrink-0 font-mono tabular-nums text-fuchsia-400">
                      {formatCompact(e.cost)}¢
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </SidebarCard>

        {/* 4. Top 10 Score players */}
        <SidebarCard
          icon={Star}
          iconClass="text-amber-400"
          label="Top Score"
          labelClass="text-amber-300"
        >
          {scores.length === 0 ? (
            <EmptyList />
          ) : (
            <ol className="space-y-1">
              {scores.map((p, i) => (
                <li key={p.id} className="flex items-center gap-1.5 text-[11px] leading-tight">
                  <span className={`w-3.5 shrink-0 text-center font-mono font-bold ${RANK_COLORS[i] ?? "text-gray-500"}`}>
                    {i + 1}
                  </span>
                  <Link href={`/players/${p.username}`} className="flex-1 truncate font-medium text-gray-200 hover:underline">
                    {p.username}
                  </Link>
                  <span className="shrink-0 font-mono tabular-nums text-amber-400">
                    {formatCompact(p.photoScore)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </SidebarCard>
      </div>
    </div>
  );
}
