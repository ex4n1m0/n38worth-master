"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
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
  Terminal,
  Clock,
  Trash2,
} from "lucide-react";
import { formatCompact } from "@/lib/utils";
import { useLanguage } from "@/components/LanguageContext";
import { rankTitle } from "@/lib/ranks";
import type { TranslationKeys } from "@/lib/i18n";

// ─── Types ───────────────────────────────────────────────────────────────────

type RewardType = "portfolio_reward" | "rank_bonus" | "login_reward" | "purchase_income" | "boss_portfolio_tax" | "boss_no_income_tax";

interface RewardEntry {
  id: number;
  type: RewardType;
  amount: number;
  details: string | null;
  createdAt: string;
}

interface TypeTotal {
  count: number;
  total: number;
}

interface RewardPage {
  rewards: RewardEntry[];
  nextCursor: number | null;
  totalsByType?: Record<string, TypeTotal>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  RewardType,
  { icon: React.ReactNode; color: string; bgColor: string }
> = {
  portfolio_reward: {
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
  },
  rank_bonus: {
    icon: <Trophy className="h-3.5 w-3.5" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
  login_reward: {
    icon: <CalendarDays className="h-3.5 w-3.5" />,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 border-sky-500/20",
  },
  purchase_income: {
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10 border-violet-500/20",
  },
  boss_portfolio_tax: {
    icon: <Terminal className="h-3.5 w-3.5" />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
  boss_no_income_tax: {
    icon: <Clock className="h-3.5 w-3.5" />,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10 border-orange-500/20",
  },
};

function rewardTypeLabel(type: RewardType, t: TranslationKeys): string {
  switch (type) {
    case "rank_bonus":
      return t.rewardTypeRankBonus;
    case "login_reward":
      return t.rewardTypeLogin;
    case "purchase_income":
      return t.rewardTypePurchase;
    case "boss_portfolio_tax":
      return t.rewardTypeBossPortfolio;
    case "boss_no_income_tax":
      return t.rewardTypeBossHourly;
    default:
      return t.rewardTypePortfolio;
  }
}

function formatRelativeTime(dateStr: string, t: TranslationKeys): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return t.rewardJustNow;
  if (minutes < 60)
    return t.minutesAgo.replace("{minutes}", String(minutes));
  if (hours < 24) return t.hoursAgo.replace("{hours}", String(hours));
  if (days < 7) return t.daysAgo.replace("{days}", String(days));
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

function positionLabel(pos: number, t: TranslationKeys): string {
  if (pos === 1) return t.rewardPosition1st;
  if (pos === 2) return t.rewardPosition2nd;
  if (pos === 3) return t.rewardPosition3rd;
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
  const { t, locale } = useLanguage();
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
              {rewardTypeLabel(display.type, t)}
            </span>
            <span className="text-xs text-gray-500 ml-2">
              {formatRelativeTime(display.createdAt, t)}
            </span>
          </div>
        </div>

        {/* Right: amount + expand arrow */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xs font-bold ${config.color}`}>
            +{formatCompact(display.amount)}¢
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
              <span className="text-gray-400">{t.portfolioValue}</span>
              <span className="text-white font-medium">
                {formatCompact(Number(details.portfolioValue ?? 0))}¢
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
                      <span className="text-gray-400">{t.rewardDetailCategory}</span>
                      <span className="text-white font-medium capitalize">{
                        {
                          empire: t.categoryGrid,
                          credits: t.categoryCredits,
                          value: t.categoryValue,
                          portfolio: t.categoryPortfolio,
                        }[String(d.category ?? "")] ?? String(d.category ?? "")
                      }</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{t.rewardDetailRank}</span>
                      <span className="text-white font-medium">{rankTitle(String(d.rank ?? ""), locale)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-400">{t.rewardDetailPosition}</span>
                      <span className="text-amber-400 font-medium">{positionLabel(Number(d.position ?? 0), t)}</span>
                    </div>
                    {display.entries.length > 1 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">{t.rewardDetailAmount}</span>
                        <span className="text-amber-400 font-medium">+{formatCompact(entry.amount)}¢</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {display.type === "login_reward" && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{t.rewardTotalEconomyAtClaim}</span>
              <span className="text-white font-medium">
                {formatCompact(Number(details.totalEconomy ?? 0))}¢
              </span>
            </div>
          )}

          {display.type === "purchase_income" && (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{t.rewardPlayerSold}</span>
                <span className="text-white font-medium">
                  {String(details.playerUsername ?? "")}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{t.rewardBuyer}</span>
                <span className="text-white font-medium">
                  {String(details.buyerUsername ?? "")}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{t.rewardSalePrice}</span>
                <span className="text-white font-medium">
                  {formatCompact(Number(details.salePrice ?? 0))}¢
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{t.rewardYourShare}</span>
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

function SummaryBar({
  rewards,
  totalsByType,
}: {
  rewards: RewardEntry[];
  totalsByType?: Record<string, TypeTotal>;
}) {
  const { t } = useLanguage();
  // Prefer server-side aggregated totals (covers ALL history) when available;
  // fall back to summing only loaded rewards.
  const totals: Record<string, number> = {};
  if (totalsByType) {
    for (const [type, data] of Object.entries(totalsByType)) {
      totals[type] = data.total;
    }
  } else {
    for (const r of rewards) {
      totals[r.type] = (totals[r.type] ?? 0) + r.amount;
    }
  }

  const types: RewardType[] = [
    "portfolio_reward",
    "rank_bonus",
    "login_reward",
    "purchase_income",
    "boss_portfolio_tax",
    "boss_no_income_tax",
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {types.map((type) => {
        const cfg = TYPE_CONFIG[type];
        const val = totals[type] ?? 0;
        return (
          <div
            key={type}
            className={`rounded-lg border p-2 flex items-center gap-2 ${cfg.bgColor}`}
          >
            <span className={`shrink-0 ${cfg.color}`}>{cfg.icon}</span>
            <div className="min-w-0">
              <p className="text-xs text-gray-400 truncate">{rewardTypeLabel(type, t)}</p>
              <p className={`text-xs font-bold ${cfg.color}`}>
                +{formatCompact(val)}¢
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
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const queryClient = useQueryClient();

  const clearMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/me/reward-history", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to clear history");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["reward-history"] });
      toast.success(
        t.rewardClearedToast.replace(
          "{count}",
          String(data.deletedCount?.toLocaleString() ?? 0)
        )
      );
      setConfirmClear(false);
    },
    onError: () => {
      toast.error(t.rewardClearFailed);
      setConfirmClear(false);
    },
  });

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
  // Use server-side totals from the first page (covers ALL history)
  const totalsByType = data?.pages[0]?.totalsByType;
  const totalEarned = totalsByType
    ? Object.values(totalsByType).reduce((s, agg) => s + agg.total, 0)
    : allRewards.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="rounded-xl border border-gray-700/40 p-4">
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-300">
            {t.rewardIncomeHistory}
          </h3>
          {totalEarned > 0 && (
            <span className="text-xs text-gray-500">
              {t.rewardTotalPrefix}
              {formatCompact(totalEarned)}¢{t.rewardTotalSuffix}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <span className="text-xs">
            {isOpen ? t.rewardHide : t.rewardShow}
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
          {allRewards.length > 0 && (
            <SummaryBar rewards={allRewards} totalsByType={totalsByType} />
          )}

          {/* Entries list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">{t.rewardLoadingHistory}</span>
            </div>
          ) : allRewards.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-gray-500">
                {t.rewardNoIncome}
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
                  {t.rewardLoadingMore}
                </>
              ) : (
                <>
                  <ChevronRight className="h-3 w-3" />
                  {t.rewardLoadMore}
                </>
              )}
            </button>
          )}

          {/* Clear history */}
          {allRewards.length > 0 && (
            <div className="pt-2 border-t border-white/5 flex items-center justify-end gap-2">
              {confirmClear ? (
                <>
                  <span className="text-xs text-red-400">{t.rewardClearConfirm}</span>
                  <button
                    onClick={() => clearMutation.mutate()}
                    disabled={clearMutation.isPending}
                    className="text-xs text-red-400 hover:text-red-300 font-semibold px-2 py-1 rounded border border-red-500/30 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    {clearMutation.isPending ? t.rewardClearing : t.rewardYesClear}
                  </button>
                  <button
                    onClick={() => setConfirmClear(false)}
                    className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition-colors"
                  >
                    {t.cancel}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  {t.rewardClearHistory}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
