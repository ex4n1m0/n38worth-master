"use client";

import { Button } from "@/components/ui/button";
import { Camera, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useCredits } from "@/hooks/useCredits";
import { useSound } from "@/hooks/useSound";
import { formatCompact, navbarBtnStyle } from "@/lib/utils";

interface RevealAvatarButtonProps {
  targetId: number;
  targetUsername: string;
  playerValue: number;
  countdown?: string | null;
  className?: string;
  square?: boolean;
}

export function RevealAvatarButton({
  targetId,
  targetUsername,
  playerValue,
  countdown,
  className,
  square,
}: RevealAvatarButtonProps) {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { play } = useSound();

  const cost = Math.round(playerValue * 1.0 * 100) / 100;
  const canAfford = (credits ?? 0) >= cost;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/reveal-avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
          throw new Error(data.error || "Failed to reveal avatar");
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Revealed ${targetUsername}! +1h reveal (cost ${formatCompact(data.cost)}¢). Value → ${formatCompact(data.newValue)}¢ (+${formatCompact(
          data.creditsToPlayer
        )}¢ gifted) 👁️`
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["chat-messages"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAfford) {
      toast.error(`Not enough credits. Need ${formatCompact(cost)}¢`);
      return;
    }
    play("hire");
    mutation.mutate();
  };

  const disabled = mutation.isPending || !canAfford;

  if (square) {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={disabled}
        className={`h-12 w-12 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold drop-shadow-lg ${
          canAfford
            ? "text-white border-0 bg-transparent hover:brightness-125 hover:bg-transparent"
            : "border-gray-700 text-gray-500 cursor-not-allowed"
        } ${className ?? ""}`}
        style={canAfford ? navbarBtnStyle : undefined}
        title={`Reveal ${targetUsername}'s avatar for 1 hour for ${formatCompact(cost)}¢`}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Camera className="h-4 w-4" />
            <span className="text-[7px] leading-none mt-0.5">Reveal</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      className={`text-sm px-3 py-2 h-auto min-h-[36px] font-bold drop-shadow-lg ${
        canAfford
          ? "text-white border-0 bg-transparent hover:brightness-125 hover:bg-transparent"
          : "border-gray-700 text-gray-500 cursor-not-allowed"
      } ${className ?? ""}`}
      style={canAfford ? navbarBtnStyle : undefined}
      title={`Reveal ${targetUsername}'s avatar on Network for 1 hour for ${formatCompact(cost)}¢`}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Camera className="h-4 w-4 mr-2" />
          Reveal ({formatCompact(cost)}¢)
          {countdown && <span className="ml-2 text-amber-300/70">· {countdown}</span>}
        </>
      )}
    </Button>
  );
}
