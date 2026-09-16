"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { ShoppingCart, Loader2, Shield } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useForcedProfessionStore } from "@/hooks/useForcedProfession";
import { useOnboarding } from "./OnboardingContext";
import { BlockCountdownBar } from "./BlockCountdownBar";
import { formatCompact, navbarBtnStyle } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface HireButtonProps {
  targetId: number;
  targetUsername: string;
  cost: number;
  disabled?: boolean;
  compact?: boolean;
  blockSellUntil?: string | null;
}

export function HireButton({ targetId, targetUsername, cost, disabled, compact, blockSellUntil }: HireButtonProps) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { play } = useSound();
  const { refresh: refreshOnboarding } = useOnboarding();
  const router = useRouter();

  const isBlocked = blockSellUntil ? new Date(blockSellUntil) > new Date() : false;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onMutate: async () => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - cost : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      // Rollback
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      // Hired an NPC with no profession → forced assignment pops up instantly.
      if (data.needsProfession) {
        useForcedProfessionStore.getState().require({
          targetId: data.targetId,
          targetUsername: data.targetUsername,
        });
      }
      if (data.countdownStarted) {
        // ⏱️ COUNTDOWN STARTED! Player owns all Six
        play("win");
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all Six! Hold them for 60 minutes to root the mainframe and reboot the simulation! Other players will try to breach them away!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          `You hired ${targetUsername}! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["player"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
          queryClient.invalidateQueries({ queryKey: ["lost-players"] }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
          queryClient.invalidateQueries({ queryKey: ["missions"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
        ]);
        refreshOnboarding();
      }
    },
  });

  if (isBlocked) {
    return (
      <div className={compact ? "w-full flex flex-col gap-1" : "flex flex-col gap-1.5"}>
        <Button
          disabled
          size={compact ? "sm" : "lg"}
          className={compact
            ? "w-full bg-amber-950/60 border border-amber-500/40 text-amber-400 font-bold text-[10px] sm:text-xs px-1.5 py-1.5 h-auto rounded-md whitespace-nowrap"
            : "bg-amber-950/60 border border-amber-500/40 text-amber-400 font-bold text-base sm:text-lg px-3 sm:px-4 py-3 sm:py-4 h-auto rounded-md whitespace-nowrap"
          }
        >
          <Shield className={compact ? "h-3 w-3 mr-1" : "h-5 w-5 mr-2"} />
          Partnered
        </Button>
        <BlockCountdownBar blockSellUntil={blockSellUntil} />
      </div>
    );
  }

  return (
    <Button
      onClick={() => {
        play("hire");
        mutation.mutate();
      }}
      disabled={disabled || mutation.isPending}
      aria-label={`Hire ${targetUsername} for ${formatCompact(cost)} credits`}
      size={compact ? "sm" : "lg"}
      className={compact
        ? "w-full bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white font-bold shadow-md shadow-t1-500/20 text-[10px] sm:text-xs px-1.5 py-1.5 h-auto rounded-md whitespace-nowrap"
        : "text-white font-bold drop-shadow-lg text-base sm:text-lg px-3 sm:px-4 py-3 sm:py-4 h-auto rounded-md whitespace-nowrap bg-transparent hover:brightness-125 hover:bg-transparent disabled:opacity-60"
      }
      style={compact ? undefined : navbarBtnStyle}
    >
      {mutation.isPending ? (
        <>
          <Loader2 className={compact ? "h-3 w-3 animate-spin mr-1" : "h-5 w-5 animate-spin mr-2"} />
          {t.hiring}
        </>
      ) : (
        <>
          <ShoppingCart className={compact ? "h-3 w-3 mr-1" : "h-5 w-5 mr-2"} />
          {compact ? `${formatCompact(cost)}¢` : `${t.hire} ${formatCompact(cost)}¢`}
        </>
      )}
    </Button>
  );
}
