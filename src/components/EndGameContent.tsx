"use client";

import { useQuery } from "@tanstack/react-query";
import { Terminal, Loader2 } from "lucide-react";
import { GoddessCard } from "@/components/GoddessCard";

interface GoddessData {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  originalValue: number;
  ownerCount: number;
  ownedCount: number;
  ownerName?: string | null;
  ownerValue?: number | null;
}

/**
 * The End Game content: the "How to Win" explainer with the 6 daemon
 * cards (the Six). Rendered on your own profile (Home), right under the
 * owned-cards avatar grid. The Root Wall winners list lives separately at
 * the top of the History page (`HallOfChampions`).
 */
export function EndGameContent() {
  const { data: goddessData, isLoading: goddessLoading } = useQuery<{
    goddesses: GoddessData[];
    currentUserId: number | null;
    disabledPowers: string[];
  }>({
    queryKey: ["goddesses"],
    queryFn: async () => {
      const res = await fetch("/api/goddesses");
      if (!res.ok) return { goddesses: [], currentUserId: null };
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 300 * 1000,
  });

  return (
    <div className="space-y-6">
      {/* The Six Section — the heading doubles as the win-condition explainer. */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Terminal className="h-6 w-6 text-yellow-400" />
          <h2 className="text-xl sm:text-2xl font-black text-white">How to Win</h2>
        </div>
        <p className="text-sm sm:text-lg text-gray-200 leading-relaxed mb-4">
          <span className="font-bold text-yellow-300">Own all Six and hold them for one full hour.</span>{" "}
          The simulation then reboots and your name is carved into the Root Wall forever.
        </p>

        {goddessLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
          </div>
        ) : goddessData?.goddesses && goddessData.goddesses.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {goddessData.goddesses.map((goddess) => (
              <GoddessCard
                key={goddess.id}
                {...goddess}
                currentUserId={goddessData.currentUserId}
                powerDisabled={goddessData.disabledPowers?.includes(goddess.username) ?? false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 rounded-2xl border border-gray-800 bg-gray-900/40">
            <p className="text-gray-500">No data available on the Six</p>
          </div>
        )}
      </div>
    </div>
  );
}
