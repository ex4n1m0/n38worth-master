"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Users, Briefcase, Gem, Coins, ChevronDown, Crown, Calendar, Star } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { formatNumber } from "@/lib/utils";

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
    key: "topValue",
    label: "Highest Value",
    icon: Gem,
    iconClass: "text-amber-400",
    labelClass: "text-amber-300",
    getValue: (p) => p.playerValue,
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

export function EmpireRankStrip() {
  const { data: session } = useSession();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

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

  // Close the open dropdown when clicking anywhere outside the button row.
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) {
        setOpenKey(null);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openKey]);

  if (!session) return null;

  const textStyle: React.CSSProperties = {
    fontSize: "clamp(0.85rem, 1.8vw, 1.5rem)",
  };

  return (
    <div className="hidden md:block w-full border-b border-gray-800/50 bg-gray-950/80">
      <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-2">
        {/* Button row — each button owns its dropdown, anchored below itself. */}
        <div ref={rowRef} className="flex items-center gap-2">
          {STRIPS.map((cfg) => {
            const Icon = cfg.icon;
            const open = openKey === cfg.key;
            const entries = (data?.[cfg.key] ?? [])
              .filter((p) => cfg.getValue(p) > 0)
              .slice(0, 10);
            return (
              <div key={cfg.key} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenKey((prev) => (prev === cfg.key ? null : cfg.key))}
                  className={`group relative flex w-full items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 ${
                    open
                      ? "border-cyan-400/70 bg-gradient-to-b from-cyan-500/25 via-blue-600/15 to-transparent shadow-[0_0_18px_rgba(34,211,238,0.35)]"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 hover:shadow-[0_0_12px_rgba(255,255,255,0.08)]"
                  }`}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-xl" />
                  <span
                    className={`relative z-10 flex items-center justify-center gap-2 font-semibold tracking-wide transition-colors ${
                      open ? "text-cyan-300" : "text-gray-300 group-hover:text-white"
                    }`}
                    style={textStyle}
                  >
                    <Icon className={`h-[1.2em] w-[1.2em] shrink-0 ${cfg.iconClass}`} />
                    <span className="truncate">{cfg.label}</span>
                    <ChevronDown
                      className={`h-[1em] w-[1em] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {/* Dropdown anchored under THIS button — sized to its own space,
                    not the full page. */}
                {open && (
                  <div className="absolute left-0 top-full mt-2 z-50 w-max min-w-full max-w-[24rem] rounded-xl border border-gray-800 bg-gray-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
                    <div className={`flex items-center gap-1.5 px-3 py-2 border-b border-gray-800/70 ${cfg.labelClass}`}>
                      <Icon className={`h-4 w-4 ${cfg.iconClass}`} />
                      <span className="text-sm font-semibold">{cfg.label}</span>
                    </div>
                    {entries.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500 text-center">No entries yet</div>
                    ) : (
                      <ul className="divide-y divide-gray-800/50">
                        {entries.map((p, i) => (
                          <li
                            key={p.id}
                            className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03] transition-colors"
                          >
                            <span className="w-7 shrink-0 text-right font-mono text-xs font-bold text-gray-500">
                              #{i + 1}
                            </span>
                            <span className="flex-1 truncate font-semibold text-white">{p.username}</span>
                            <span className="shrink-0 font-mono tabular-nums text-gray-300">
                              {formatNumber(cfg.getValue(p))}
                              {cfg.suffix ?? ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Hall of Champions — same dropdown pattern as the ranks. */}
          {(() => {
            const open = openKey === "champions";
            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenKey((prev) => (prev === "champions" ? null : "champions"))}
                  className={`group relative flex w-full items-center justify-center overflow-hidden rounded-xl border transition-all duration-200 ${
                    open
                      ? "border-yellow-400/70 bg-gradient-to-b from-yellow-500/25 via-amber-600/15 to-transparent shadow-[0_0_18px_rgba(250,204,21,0.35)]"
                      : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 hover:shadow-[0_0_12px_rgba(255,255,255,0.08)]"
                  }`}
                >
                  <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-xl" />
                  <span
                    className={`relative z-10 flex items-center justify-center gap-2 font-semibold tracking-wide transition-colors ${
                      open ? "text-yellow-300" : "text-gray-300 group-hover:text-white"
                    }`}
                    style={textStyle}
                  >
                    <Crown className="h-[1.2em] w-[1.2em] shrink-0 text-yellow-400" />
                    <span className="truncate">Hall of Champions</span>
                    <ChevronDown
                      className={`h-[1em] w-[1em] shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                    />
                  </span>
                </button>

                {open && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-max min-w-full max-w-[26rem] rounded-xl border border-gray-800 bg-gray-900/95 shadow-xl backdrop-blur-sm overflow-hidden">
                    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-800/70 text-yellow-300">
                      <Crown className="h-4 w-4 text-yellow-400" />
                      <span className="text-sm font-semibold">Hall of Champions</span>
                      {champions.length > 0 && (
                        <span className="ml-auto text-xs font-normal text-gray-400">
                          {champions.length} game{champions.length !== 1 ? "s" : ""} won
                        </span>
                      )}
                    </div>
                    {champions.length === 0 ? (
                      <div className="px-3 py-4 text-sm text-gray-500 text-center">No champions yet</div>
                    ) : (
                      <ul className="divide-y divide-gray-800/50 max-h-[60vh] overflow-y-auto">
                        {champions.map((w, i) => {
                          const gameNumber = champions.length - i;
                          const wonDate = new Date(w.wonAt);
                          return (
                            <li
                              key={w.id}
                              className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03] transition-colors"
                            >
                              <span className={`flex items-center justify-center w-8 shrink-0 font-mono text-xs font-bold ${i === 0 ? "text-yellow-400" : "text-gray-500"}`}>
                                {i === 0 ? <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" /> : `#${gameNumber}`}
                              </span>
                              <span className={`flex-1 truncate font-semibold ${i === 0 ? "text-yellow-300" : "text-white"}`}>
                                {w.username}
                              </span>
                              <span className="shrink-0 flex items-center gap-1 text-xs text-gray-500">
                                <Calendar className="h-3 w-3" />
                                {wonDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
