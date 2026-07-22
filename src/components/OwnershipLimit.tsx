"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

interface OwnershipLimitData {
  limit: number;
  currentOwned: number;
  canBuyMore: boolean;
}

/**
 * Compact "owned / limit" indicator. Hire slots are fixed (bonus cards and the
 * "+10 Player Slots" purchase were removed from the game), so this is
 * display-only.
 */
export function OwnershipLimit() {
  const [data, setData] = useState<OwnershipLimitData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchOwnershipLimit = async () => {
      if (document.visibilityState !== "visible") return; // no polling from background tabs
      try {
        const response = await fetch("/api/settings/ownership-limit");
        if (response.ok && !cancelled) setData(await response.json());
      } catch (error) {
        console.error("Failed to fetch ownership limit:", error);
      }
    };
    fetchOwnershipLimit();
    const interval = setInterval(fetchOwnershipLimit, 150000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!data) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-gray-800/50 border border-gray-700/50 px-4 py-2">
      <Users className="h-6 w-6 text-gray-400" />
      <span className="text-lg font-bold">
        <span className={data.canBuyMore ? "text-green-400" : "text-red-400"}>{data.currentOwned}</span>
        <span className="text-gray-500">/</span>
        <span className="text-gray-300">{data.limit}</span>
      </span>
    </div>
  );
}
