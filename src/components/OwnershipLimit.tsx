"use client";

import { useEffect, useState } from "react";
import { Users } from "lucide-react";

interface OwnershipLimitData {
  limit: number;
  currentOwned: number;
  canBuyMore: boolean;
}

export function OwnershipLimit() {
  const [data, setData] = useState<OwnershipLimitData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOwnershipLimit() {
      try {
        const response = await fetch("/api/settings/ownership-limit");
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error("Failed to fetch ownership limit:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchOwnershipLimit();
    // Refresh every 30 seconds
    const interval = setInterval(fetchOwnershipLimit, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !data) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/50 border border-gray-700/50">
      <Users className="h-4 w-4 text-gray-400" />
      <span className="text-sm font-medium">
        <span className={data.canBuyMore ? "text-green-400" : "text-red-400"}>
          {data.currentOwned}
        </span>
        <span className="text-gray-500">/</span>
        <span className="text-gray-300">{data.limit}</span>
      </span>
    </div>
  );
}