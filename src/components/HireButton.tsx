"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShoppingCart, Loader2 } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";
import { formatNumber } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface HireButtonProps {
  targetId: number;
  targetUsername: string;
  cost: number;
  disabled?: boolean;
}

export function HireButton({ targetId, targetUsername, cost, disabled }: HireButtonProps) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { play } = useSound();
  const { refresh: refreshOnboarding } = useOnboarding();
  const router = useRouter();

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
        // ⏱️ COUNTDOWN STARTED! Player owns all 5 Goddesses
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 5 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
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
        ]);
        refreshOnboarding();
      }
    },
  });

  return (
    <Button
      onClick={() => {
        play("hire");
        mutation.mutate();
      }}
      disabled={disabled || mutation.isPending}
      size="lg"
      className="bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white font-bold shadow-lg shadow-t1-500/20 text-base sm:text-lg px-3 sm:px-4 py-3 sm:py-4 h-auto rounded-md whitespace-nowrap"
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          {t.hiring}
        </>
      ) : (
        <>
          <ShoppingCart className="h-5 w-5 mr-2" />
          {t.hire} {formatNumber(cost)}¢
        </>
      )}
    </Button>
  );
}
