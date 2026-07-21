"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { formatCompact } from "@/lib/utils";

/**
 * Pinned "10 Slots" card for the market page.
 *
 * Adds +10 hire slots for 10% of the buyer's current credits — the cost
 * scales with wealth so it's always affordable but never trivial. No cooldown.
 */
export function TenSlotsCard() {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { data: myCredits } = useCredits();

  const cost = Math.max(1, Math.round((myCredits ?? 0) * 0.1));
  const canAfford = (myCredits ?? 0) >= 1;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/buy-slots", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Buying slots failed");
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`+${data.slotsAdded} hire slots! Now ${data.newSlots} total (-${formatCompact(data.cost)}¢)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
      ]);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClick = () => {
    if (!canAfford || mutation.isPending) return;
    play("hire");
    mutation.mutate();
  };

  const isDisabled = !canAfford || mutation.isPending;
  const ringColor = canAfford ? "ring-cyan-500" : "ring-gray-600";
  const actionColor = canAfford ? "text-cyan-300" : "text-gray-400";

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick();
  };

  return (
    <Card className="border-cyan-600/50 bg-cyan-950/30 hover:bg-cyan-900/40 hover:border-cyan-500/60 transition-all duration-200 relative">
      <CardContent className="p-2 relative flex flex-col items-center">
        {/* Header above avatar: title */}
        <div className="w-full flex items-start justify-between gap-1.5 mb-1">
          <h3
            className="font-bold text-cyan-300 leading-tight flex items-center gap-1 flex-wrap"
            style={{ fontSize: "clamp(0.65rem, 1.2vw, 0.9rem)" }}
          >
            <Users className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            10 Slots
          </h3>
        </div>

        <div
          className={`relative w-full aspect-square rounded-lg overflow-hidden ring-2 transition-all ${ringColor}`}
        >
          <button
            type="button"
            aria-disabled={isDisabled}
            onClick={handleAvatarClick}
            className={`absolute inset-0 z-0 flex items-center justify-center transition-all focus:outline-none ${
              isDisabled ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:brightness-110"
            }`}
          >
            <Avatar className="w-full h-full rounded-lg">
              <AvatarImage src="/10slots.webp" alt="10 Slots" className="object-fill" />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 text-white font-bold text-2xl sm:text-3xl">
                10
              </AvatarFallback>
            </Avatar>
          </button>

          {/* Bottom overlay: action label */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none">
            <div className={`text-sm font-bold drop-shadow-sm flex flex-wrap items-center gap-1 ${actionColor}`}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : (
                <>
                  <Users className="h-3 w-3" />
                  +10 SLOTS {formatCompact(cost)}¢
                </>
              )}
            </div>
          </div>
        </div>

        <p className="w-full text-center text-[10px] text-cyan-200/70 mt-1.5">
          Expand your team by 10 hire slots
        </p>
      </CardContent>
    </Card>
  );
}
