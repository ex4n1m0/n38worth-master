"use client";

import { Button } from "@/components/ui/button";
import { HandHeart, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import { useSound } from "@/hooks/useSound";
import { formatNumber, navbarBtnStyle } from "@/lib/utils";

interface LetGoButtonProps {
  targetId: number;
  targetUsername: string;
  playerValue: number;
  className?: string;
}

export function LetGoButton({ targetId, targetUsername, playerValue, className }: LetGoButtonProps) {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { play } = useSound();

  const cost = playerValue;
  const canAfford = (credits ?? 0) >= cost;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/let-go", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to let go");
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Let ${targetUsername} go! Paid ${formatNumber(data.letGoCost)}¢. They kept their value.`
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAfford) {
      toast.error(`Not enough credits. Need ${formatNumber(cost)}¢`);
      return;
    }
    play("hire");
    mutation.mutate();
  };

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={mutation.isPending || !canAfford}
      className={`text-sm px-3 py-2 h-auto min-h-[36px] font-bold drop-shadow-lg ${
        !canAfford
          ? "border-gray-700 text-gray-500 cursor-not-allowed"
          : "text-white border-0 bg-transparent hover:brightness-125 hover:bg-transparent"
      } ${className ?? ""}`}
      style={canAfford ? navbarBtnStyle : undefined}
      title={
        canAfford
          ? `Let ${targetUsername} go for ${formatNumber(cost)}¢ (they keep value)`
          : `Need ${formatNumber(cost)}¢`
      }
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <HandHeart className="h-4 w-4 mr-2" />
          Let Go ({formatNumber(cost)}¢)
        </>
      )}
    </Button>
  );
}
