"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShoppingCart, Loader2 } from "lucide-react";
import { useLanguage } from "./LanguageContext";

interface BuyButtonProps {
  targetId: number;
  targetUsername: string;
  cost: number;
  disabled?: boolean;
}

export function BuyButton({ targetId, targetUsername, cost, disabled }: BuyButtonProps) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

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
      toast.success(
        `You bought ${targetUsername}! Their value is now ${data.newValue} 💰`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
  });

  return (
    <Button
      onClick={() => mutation.mutate()}
      disabled={disabled || mutation.isPending}
      size="lg"
      className="bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white font-bold shadow-lg shadow-t1-500/20 text-lg sm:text-xl px-4 sm:px-8 py-4 sm:py-6 h-auto min-h-[48px] max-w-full whitespace-nowrap"
    >
      {mutation.isPending ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin mr-3" />
          {t.buying}
        </>
      ) : (
        <>
          <ShoppingCart className="h-7 w-7 mr-3" />
          {t.buy} {cost}¢
        </>
      )}
    </Button>
  );
}
