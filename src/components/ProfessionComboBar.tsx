"use client";

import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCompact, navbarBtnStyle } from "@/lib/utils";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import type { ComboPlayer, UseProfessionComboSelectionReturn } from "@/hooks/useProfessionComboSelection";

interface ProfessionComboBarProps {
  combo: UseProfessionComboSelectionReturn;
}

export function ProfessionComboBar({ combo }: ProfessionComboBarProps) {
  const queryClient = useQueryClient();
  const { ownedIds, isSuccess: ownershipLoaded } = useOwnedPlayerIds();

  // Drop any selected players that have been stolen since being added (so a
  // combo can't be attempted with cards the user no longer owns). Runs whenever
  // ownership data refreshes; idempotent, and only after a successful fetch so
  // the initial empty load doesn't wipe a valid selection.
  const { slots, removeUnowned } = combo;
  useEffect(() => {
    if (!ownershipLoaded) return;
    const stolen = slots
      .map((s) => s.player)
      .filter((p): p is ComboPlayer => !!p && !ownedIds.has(p.playerId));
    if (stolen.length === 0) return;
    removeUnowned(ownedIds);
    const names = stolen.map((p) => p.username).join(", ");
    toast.warning(
      stolen.length === 1
        ? `${names} was hired away — removed from your combo.`
        : `${stolen.length} players were hired away (${names}) — removed from your combo.`,
      { duration: 6000 }
    );
  }, [ownedIds, ownershipLoaded, slots, removeUnowned]);

  const sellMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/sell-profession-combo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: combo.selectedPlayerIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sell combo failed");
      return data;
    },
    onSuccess: async (data) => {
      const humanMsg =
        data.resetPlayerCount > 0
          ? `Reset ${data.resetPlayerCount} player${data.resetPlayerCount > 1 ? "s" : ""} to floor`
          : "";
      const spawnMsg =
        data.createdNpcCount > 0
          ? `Spawned ${data.createdNpcCount} new NPC${data.createdNpcCount > 1 ? "s" : ""} into the market`
          : "";

      toast.success(`🎉 Combo Sold! +${formatCompact(data.reward)}¢`, {
        description: [humanMsg, spawnMsg].filter(Boolean).join(". "),
        duration: 8000,
      });

      // Clear selection and refresh all data
      combo.clear();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleSell = () => {
    sellMutation.mutate();
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 rounded-lg border border-gray-700 bg-transparent px-3 py-1.5">
      <span className="flex items-center gap-1.5 shrink-0 text-xs sm:text-sm font-bold text-amber-300 uppercase tracking-wide">
        <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        Combo
        <span className="font-bold text-white">{combo.selectedCount}/6</span>
      </span>
      <p className="text-[11px] sm:text-xs font-medium leading-tight text-amber-200/60 flex-1 min-w-0">
        One player per profession — sell all 6 for{" "}
        <span className="font-bold text-amber-300">10x combined value</span>. They reset to floor &amp; 6 fresh NPCs spawn.
      </p>

      {/* Sell Button - appears when all 6 selected */}
      {combo.isComplete && (
        <Button
          onClick={handleSell}
          disabled={sellMutation.isPending}
          className="relative overflow-hidden shrink-0 px-4 py-1.5 h-auto rounded-lg font-bold text-sm sm:text-base tracking-wide text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            ...navbarBtnStyle,
            background:
              "linear-gradient(135deg, rgba(245,158,11,0.4) 0%, rgba(180,83,9,0.4) 50%, rgba(245,158,11,0.4) 100%)",
          }}
        >
          {sellMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
          ) : (
            <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
          )}
          Sell 10x = {formatCompact(combo.reward)}¢
        </Button>
      )}
    </div>
  );
}