"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShoppingCart, Loader2, Shield } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";
import { formatNumber, navbarBtnStyle } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

function formatTimeRemaining(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

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
  const [blockCountdown, setBlockCountdown] = useState<string>("");
  useEffect(() => {
    if (!isBlocked || !blockSellUntil) return;
    const update = () => setBlockCountdown(formatTimeRemaining(blockSellUntil) ?? "");
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [blockSellUntil, isBlocked]);

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
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      if (data.countdownStarted) {
        // ⏱️ COUNTDOWN STARTED! Player owns all 6 Goddesses
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
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
        ]);
        refreshOnboarding();
      }
    },
  });

  if (isBlocked) {
    return (
      <Button
        disabled
        size={compact ? "sm" : "lg"}
        className={compact
          ? "w-full bg-amber-950/60 border border-amber-500/40 text-amber-400 font-bold text-[10px] sm:text-xs px-1.5 py-1.5 h-auto rounded-md whitespace-nowrap"
          : "bg-amber-950/60 border border-amber-500/40 text-amber-400 font-bold text-base sm:text-lg px-3 sm:px-4 py-3 sm:py-4 h-auto rounded-md whitespace-nowrap"
        }
      >
        <Shield className={compact ? "h-3 w-3 mr-1" : "h-5 w-5 mr-2"} />
        Partnered {blockCountdown && <span className="ml-1 tabular-nums opacity-80">{blockCountdown}</span>}
      </Button>
    );
  }

  return (
    <Button
      onClick={() => {
        play("hire");
        mutation.mutate();
      }}
      disabled={disabled || mutation.isPending}
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
          {compact ? `${formatNumber(cost)}¢` : `${t.hire} ${formatNumber(cost)}¢`}
        </>
      )}
    </Button>
  );
}
