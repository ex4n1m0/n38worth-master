"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  return (
    <Card className="border-cyan-600/50 bg-cyan-950/30 hover:bg-cyan-900/40 hover:border-cyan-500/60 transition-all duration-200 cursor-pointer group relative">
      <CardContent className="p-2.5 relative flex flex-col items-center gap-1.5">
        <div className="relative w-full">
          <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-cyan-600/50 group-hover:ring-cyan-500/60 transition-all">
            <AvatarImage src="/10slots.webp" alt="10 Slots" className="object-fill" />
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-cyan-600 to-blue-600 text-white font-bold text-3xl">
              10
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="w-full text-center">
          <h3 className="font-bold text-cyan-300 group-hover:text-cyan-200 transition-colors leading-tight flex items-center justify-center gap-1.5 flex-wrap" style={{ fontSize: "clamp(0.7rem, 1.3vw, 1.05rem)" }}>
            <Users className="h-4 w-4 text-cyan-400 shrink-0" />
            10 Slots
          </h3>
          <p className="text-xs text-cyan-200/70 mt-0.5">
            Expand your team by 10 hire slots
          </p>
        </div>

        <Button
          onClick={handleClick}
          disabled={!canAfford || mutation.isPending}
          className={`w-[85%] aspect-video h-auto rounded-md flex flex-col items-center justify-center gap-0.5 font-bold ${
            canAfford
              ? "text-white bg-transparent border-2 border-cyan-500 hover:bg-cyan-500/15 shadow-lg shadow-cyan-900/30"
              : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {mutation.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <span className="text-sm sm:text-lg leading-none flex items-center gap-1">
                <Users className="h-4 w-4" />
                +10 SLOTS
              </span>
              <span style={{ fontSize: "clamp(0.55rem, 1.1vw, 0.7rem)" }} className="text-cyan-100">
                {formatCompact(cost)}¢ (10% of credits)
              </span>
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
