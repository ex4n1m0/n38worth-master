"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Users, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useBonusCooldown, useRefreshBonusCooldowns } from "@/hooks/useBonusCooldowns";
import { formatCompact } from "@/lib/utils";
import { useLanguage } from "./LanguageContext";

/**
 * Pinned "10 Slots" card for the market page.
 *
 * Adds +10 hire slots for 10% of the buyer's current credits — the cost
 * scales with wealth so it's always affordable but never trivial.
 * 10-minute cooldown after each use (shared bonus-card cooldown).
 */
export function TenSlotsCard() {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { t } = useLanguage();
  const { data: myCredits } = useCredits();
  const { onCooldown, label: cooldownLabel, pct: cooldownPct } = useBonusCooldown("slots");
  const refreshCooldowns = useRefreshBonusCooldowns();

  const cost = Math.max(1, Math.round((myCredits ?? 0) * 0.1));
  const canAfford = (myCredits ?? 0) >= 1;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/buy-slots", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.buySlotsFailed);
      return data;
    },
    onSuccess: async (data) => {
      toast.success(t.buySlotsToast
        .replace("{added}", String(data.slotsAdded))
        .replace("{total}", String(data.newSlots))
        .replace("{cost}", formatCompact(data.cost)));
      refreshCooldowns();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
      ]);
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
  });

  const handleClick = () => {
    if (onCooldown) {
      play("error");
      toast.error(t.cooldownReadyIn
        .replace("{feature}", t.tenSlotsTitle)
        .replace("{time}", cooldownLabel));
      return;
    }
    if (!canAfford) {
      play("error");
      toast.error(t.tenSlotsNoCredits);
      return;
    }
    if (mutation.isPending) return;
    play("confirm");
    mutation.mutate();
  };

  const isDisabled = !canAfford || onCooldown || mutation.isPending;
  const ringColor = onCooldown ? "ring-cyan-700/50" : canAfford ? "ring-cyan-500" : "ring-gray-600";
  const actionColor = onCooldown ? "text-cyan-400" : canAfford ? "text-cyan-300" : "text-gray-400";

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick();
  };

  return (
    <Card className="border-cyan-600/50 bg-cyan-950/30 hover:bg-cyan-900/40 hover:border-cyan-500/60 transition-all duration-200 relative pt-0">
      <CardContent className="p-2 relative flex flex-col items-center">
        {/* Header above avatar: title (vertically centered) */}
        <div className="w-full flex items-center justify-between gap-1.5 mb-1 min-h-[3rem]">
          <h3
            className="font-bold text-cyan-300 leading-tight flex items-center gap-1 flex-wrap"
            style={{ fontSize: "clamp(0.87rem, 1.6vw, 1.2rem)" }}
          >
            <Users className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            {t.tenSlotsTitle}
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
              <AvatarImage src="/10slots.webp" alt={t.tenSlotsTitle} className="object-fill" />
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
              ) : onCooldown ? (
                <>
                  <Clock className="h-3 w-3" />
                  {cooldownLabel}
                </>
              ) : (
                <>
                  <Users className="h-3 w-3" />
                  {t.tenSlotsAction} {formatCompact(cost)}¢
                </>
              )}
            </div>
            {onCooldown && (
              <div className="w-full h-1 rounded-full overflow-hidden bg-cyan-500/15 mt-1.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${cooldownPct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <p className="w-full text-center text-[10px] text-cyan-200/70 mt-1.5">
          {t.tenSlotsHint}
        </p>
      </CardContent>
    </Card>
  );
}
