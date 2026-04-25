"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  History,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Trophy,
  CalendarDays,
  ShoppingCart,
  ChevronRight,
  Loader2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type RewardType = "portfolio_reward" | "rank_bonus" | "login_reward" | "purchase_income";

interface RewardEntry {
  id: number;
  type: RewardType;
  amount: number;
  details: string | null;
  createdAt: string;
}

interface RewardPage {
  rewards: RewardEntry[];
  nextCursor: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  RewardType,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  portfolio_reward: {
    label: "Portfolio Reward",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  rank_bonus: {
    label: "Rank Bonus",
    icon: <Trophy className="h-3.5 w-3.5" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
  login_reward: {
    label: "Daily Login",
    icon: <CalendarDays className="h-3.5 w-3.5" />,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 border-sky-500/20",
  },
  purchase_income: {
    label: "Purchase Income",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10 border-violet-500/20",
  },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function parseDetails(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function positionLabel(pos: number): string {
  if (pos === 1) return "🥇 1st";
  if (pos === 2) return "🥈 2nd";
  if (pos === 3) return "🥉 3rd";
  return `#${pos}`;
}

// ─── Merge rank_bonus entries that share the same batchId ─────────────────────

interface DisplayEntry {
  /** Synthetic key for React */
  key: string;
  type: RewardType;
  /** Sum of all merged entries */
  amount: number;
  /** Earliest createdAt among merged entries */
  createdAt: string;
  /** Individual entries that were merged (1 for non-rank, ≥1 for rank batches) */
  entries: RewardEntry[];
}

function mergeRankBonusBatches(rewards: RewardEntry[]): DisplayEntry[] {
  const result: DisplayEntry[] = [];
  // Temporary map for batchId → accumulated display entry
  const batchMap = new Map<string, DisplayEntry>();

  for (const r of rewards) {
    if (r.type === "rank_bonus") {
      const details = parseDetails(r.details);
      const bid = String(details.batchId ?? "");

      if (bid && batchMap.has(bid)) {
        // Same batch — merge into existing display entry
        const existing = batchMap.get(bid)!;
        existing.amount += r.amount;
        existing.entries.push(r);
        if (r.createdAt < existing.createdAt) existing.createdAt = r.createdAt;
        continue;
      }

      // New batch (or legacy entry without batchId)
      const entry: DisplayEntry = {
        key: bid || `rb-${r.id}`,
        type: "rank_bonus",
        amount: r.amount,
        createdAt: r.createdAt,
        entries: [r],
      };
      if (bid) batchMap.set(bid, entry);
      result.push(entry);
    } else {
      // Non-rank entry — pass through as-is
      result.push({
        key: `e-${r.id}`,
        type: r.type,
        amount: r.amount,
        createdAt: r.createdAt,
        entries: [r],
      });
    }
  }
  return result;
}

// ─── Entry Row ────────────────────────────────────────────────────────────────

function RewardRow({ display }: { display: DisplayEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = TYPE_CONFIG[display.type] ?? TYPE_CONFIG.portfolio_reward;

  // For single-entry rows, parse details normally
  const singleEntry = display.entries[0];
  const details = parseDetails(singleEntry.details);
  const isRankBatch = display.type === "rank_bonus";
  const hasDetails = isRankBatch
    ? display.entries.length > 0
    : Object.keys(details).length > 0;

  return (
    <div className={`rounded-lg border p-2.5 ${config.bgColor}`}>
      <div
        className="flex items-center justify-between gap-2 cursor-pointer"
        onClick={() => hasDetails && setExpanded((v) => !v)}
      >
        {/* Left: icon + label + time */}
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 ${config.color}`}>{config.icon}</span>
          <div className="min-w-0">
            <span className={`text-xs font-semibold ${config.color}`}>
              {config.label}
            </span>
            <span className="text-xs text-gray-500 ml-2">
              {formatRelativeTime(display.createdAt)}
            </span>
          </div>
        </div>

        {/* Right: amount + expand arrow */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-bold ${config.color}`}>
            +{display.amount.toLocaleString()}¢
          </span>
          {hasDetails && (
            <span className="text-gray-500">
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </span>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
          {display.type === "portfolio_reward" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Portfolio Value</span>
              <span className="text-white font-medium">
                {Number(details.portfolioValue ?? 0).toLocaleString()}¢
              </span>
            </div>
          )}

          {display.type === "rank_bonus" && (
            <>
              {display.entries.map((entry, idx) => {
                const d = parseDetails(entry.details);
                return (
                  <div key={entry.id} className={idx > 0 ? "pt-1.5 border-t border-white/5" : ""}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Category</span>
                      <span className="text-white font-medium capitalize">{String(d.category ?? "")}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Rank</span>
                      <span className="text-white font-medium">{String(d.rank ?? "")}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">Position</span>
                      <span className="text-amber-400 font-medium">{positionLabel(Number(d.position ?? 0))}</span>
                    </div>
                    {display.entries.length > 1 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Amount</span>
                        <span className="text-amber-400 font-medium">+{entry.amount.toLocaleString()}¢</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {display.type === "login_reward" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Total Economy at Claim</span>
              <span className="text-white font-medium">
                {Number(details.totalEconomy ?? 0).toLocaleString()}¢
              </span>
            </div>
          )}

          {display.type === "purchase_income" && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Player Sold</span>
                <span className="text-white font-medium">
                  {String(details.playerUsername ?? "")}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Buyer</span>
                <span className="text-white font-medium">
                  {String(details.buyerUsername ?? "")}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Sale Price</span>
                <span className="text-white font-medium">
                  {Number(details.salePrice ?? 0).toLocaleString()}¢
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">Your Share</span>
                <span className="text-violet-400 font-medium">
                  {String(details.share ?? "")}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Bar ──────────────────────────────────────────────────────────────

function SummaryBar({ rewards }: { rewards: RewardEntry[] }) {
  // Sum earnings by type from the loaded rewards
  const totals = rewards.reduce(
    (acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + r.amount;
      return acc;
    },
    {} as Record<RewardType, number>
  );

  const types: RewardType[] = [
    "portfolio_reward",
    "rank_bonus",
    "login_reward",
    "purchase_income",
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {types.map((t) => {
        const cfg = TYPE_CONFIG[t];
        const val = totals[t] ?? 0;
        return (
          <div
            key={t}
            className={`rounded-lg border p-2 flex items-center gap-2 ${cfg.bgColor}`}
          >
            <span className={`shrink-0 ${cfg.color}`}>{cfg.icon}</span>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 truncate">{cfg.label}</p>
              <p className={`text-xs font-bold ${cfg.color}`}>
                +{val.toLocaleString()}¢
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RewardHistory() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<RewardPage>({
    queryKey: ["reward-history", session?.user?.id],
    queryFn: async ({ pageParam }) => {
      const url = pageParam
        ? `/api/me/reward-history?cursor=${pageParam}`
        : "/api/me/reward-history";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch reward history");
      return res.json();
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!session?.user?.id && isOpen,
    staleTime: 60 * 1000,
  });

  if (!session?.user?.name) return null;

  const allRewards = data?.pages.flatMap((p) => p.rewards) ?? [];
  const totalEarned = allRewards.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="rounded-xl bg-gradient-to-br from-gray-900/40 to-gray-800/20 border border-gray-700/40 p-4">
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-300">
            Income History
          </h3>
          {totalEarned > 0 && (
            <span className="text-xs text-gray-500">
              — {totalEarned.toLocaleString()}¢ loaded
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <span className="text-xs">
            {isOpen ? "Hide" : "Show"}
          </span>
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="mt-4 space-y-3">
          {/* Summary totals */}
          {allRewards.length > 0 && <SummaryBar rewards={allRewards} />}

          {/* Entries list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">Loading history…</span>
            </div>
          ) : allRewards.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-gray-500">
                No income recorded yet. Rewards will appear here as you earn them.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-0.5">
              {mergeRankBonusBatches(allRewards).map((display) => (
                <RewardRow key={display.key} display={display} />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  Load more
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
