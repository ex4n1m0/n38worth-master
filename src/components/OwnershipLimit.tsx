"use client";

import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";

interface OwnershipLimitData {
  limit: number;
  currentOwned: number;
  canBuyMore: boolean;
}

/**
 * Compact "owned / limit" indicator. Hire slots are fixed (bonus cards and the
 * "+10 Player Slots" purchase were removed from the game), so this is
 * display-only.
 *
 * Uses react-query (key: ["ownership-limit"]) so hire/discard actions can
 * invalidate it for an instant update; the slow poll is just a fallback.
 */
export function OwnershipLimit() {
  const { t } = useLanguage();
  const { data, isPending } = useQuery<OwnershipLimitData>({
    queryKey: ["ownership-limit"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ownership-limit");
      if (!res.ok) throw new Error("Failed to fetch ownership limit");
      return res.json();
    },
    staleTime: 15 * 1000,
    // Slow fallback poll — ownership-changed events invalidate this key.
    refetchInterval: 300 * 1000,
  });

  if (isPending) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50 px-2.5 py-1 animate-pulse">
        <Users className="h-4 w-4 text-gray-600" />
        <div className="h-4 w-10 rounded bg-gray-700/70" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div
      className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50 px-2 py-1 sm:px-2.5"
      title={t.hireSlotsUsedTooltip
        .replace("{current}", String(data.currentOwned))
        .replace("{limit}", String(data.limit))}
    >
      <Users className="h-4 w-4 text-gray-400 shrink-0" />
      <span className="text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap">
        <span className={data.canBuyMore ? "text-green-400" : "text-red-400"}>{data.currentOwned}</span>
        {/* The "/limit" half is hidden on phones — a wide credits balance and
            the full ratio used to fight for the same 390px and overlap. */}
        <span className="text-gray-500 hidden sm:inline">/</span>
        <span className="text-gray-300 hidden sm:inline">{data.limit}</span>
      </span>
    </div>
  );
}
