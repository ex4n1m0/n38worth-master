"use client";

import { Button } from "@/components/ui/button";
import { HandHeart, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useCredits } from "@/hooks/useCredits";
import { useSound } from "@/hooks/useSound";
import { formatCompact, navbarBtnStyle } from "@/lib/utils";
import { useLanguage } from "./LanguageContext";

interface LetGoButtonProps {
  targetId: number;
  targetUsername: string;
  playerValue: number;
  className?: string;
  square?: boolean;
}

export function LetGoButton({ targetId, targetUsername, playerValue, className, square }: LetGoButtonProps) {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { play } = useSound();
  const { t } = useLanguage();

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
      if (!res.ok) throw new Error(data.error || t.letGoFailed);
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        t.letGoToast
          .replace("{name}", targetUsername)
          .replace("{amount}", formatCompact(data.letGoCost))
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["missions"] });
      queryClient.invalidateQueries({ queryKey: ["ownership-limit"] });
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAfford) {
      play("error");
      toast.error(t.notEnoughCreditsNeed.replace("{amount}", formatCompact(cost)));
      return;
    }
    play("hire");
    mutation.mutate();
  };

  if (square) {
    return (
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={mutation.isPending || !canAfford}
        className={`h-12 w-12 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold drop-shadow-lg ${
          !canAfford
            ? "border-gray-700 text-gray-500 cursor-not-allowed"
            : "text-white border-0 bg-transparent hover:brightness-125 hover:bg-transparent"
        } ${className ?? ""}`}
        style={canAfford ? navbarBtnStyle : undefined}
        title={canAfford
          ? t.letGoTitle
            .replace("{name}", targetUsername)
            .replace("{amount}", formatCompact(cost))
          : t.needCreditsTitle.replace("{amount}", formatCompact(cost))}
      >
        {mutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <HandHeart className="h-4 w-4" />
            <span className="text-[7px] leading-none mt-0.5">{t.letGo}</span>
          </>
        )}
      </Button>
    );
  }

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
          ? t.letGoTitleKeep
            .replace("{name}", targetUsername)
            .replace("{amount}", formatCompact(cost))
          : t.needCreditsTitle.replace("{amount}", formatCompact(cost))
      }
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <HandHeart className="h-4 w-4 mr-2" />
          {t.letGo} ({formatCompact(cost)}¢)
        </>
      )}
    </Button>
  );
}
