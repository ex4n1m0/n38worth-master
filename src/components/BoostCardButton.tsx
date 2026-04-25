"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import { useSound } from "@/hooks/useSound";
import { formatNumber } from "@/lib/utils";

interface BoostCardButtonProps {
  targetId: number;
  targetUsername: string;
  playerValue: number;
  lastBoostAt?: string | null;
}

const COOLDOWN_MS = 60_000;

export function BoostCardButton({
  targetId,
  targetUsername,
  playerValue,
  lastBoostAt,
}: BoostCardButtonProps) {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { play } = useSound();

  const initialCooldownUntil = lastBoostAt
    ? Date.parse(lastBoostAt) + COOLDOWN_MS
    : 0;
  const [cooldownUntil, setCooldownUntil] = useState<number>(initialCooldownUntil);
  const [now, setNow] = useState<number>(() => Date.now());

  // Sync when prop changes (e.g., after refetch)
  useEffect(() => {
    setCooldownUntil(lastBoostAt ? Date.parse(lastBoostAt) + COOLDOWN_MS : 0);
  }, [lastBoostAt]);

  // Tick while cooling down
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const remainingMs = Math.max(0, cooldownUntil - now);
  const isCoolingDown = remainingMs > 0;
  const remainingSec = Math.ceil(remainingMs / 1000);

  const cost = Math.round(playerValue * 0.20 * 100) / 100;
  const canAfford = (credits ?? 0) >= cost;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/boost-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && typeof data.retryAfterMs === "number") {
          setCooldownUntil(Date.now() + data.retryAfterMs);
        }
        throw new Error(data.error || "Failed to boost card");
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Boosted ${targetUsername}! Value → ${formatNumber(data.newValue)}¢ (+${formatNumber(
          data.creditsToPlayer
        )}¢ credits gifted) 📈`
      );
      setCooldownUntil(Date.now() + (data.cooldownMs ?? COOLDOWN_MS));
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isCoolingDown) {
      toast.error(`Boost cooling down. ${remainingSec}s left`);
      return;
    }
    if (!canAfford) {
      toast.error(`Not enough credits. Need ${formatNumber(cost)}¢`);
      return;
    }
    const ok = window.confirm(
      `Boost ${targetUsername}'s value by 10%?\n\n` +
        `• Cost to you: ${formatNumber(cost)}¢ (20% of current value)\n` +
        `• Value goes from ${formatNumber(playerValue)}¢ → ${formatNumber(
          Math.round(playerValue * 1.1)
        )}¢\n` +
        `• They also receive ${formatNumber(
          Math.round(playerValue * 0.1 * 100) / 100
        )}¢ in credits\n` +
        `• 1-minute cooldown per card`
    );
    if (!ok) return;
    play("hire");
    mutation.mutate();
  };

  const disabled = mutation.isPending || !canAfford || isCoolingDown;

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      className={`text-sm px-3 py-2 h-auto min-h-[36px] font-bold ${
        isCoolingDown
          ? "border-gray-700 text-gray-500 cursor-not-allowed"
          : canAfford
          ? "border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
          : "border-gray-700 text-gray-500 cursor-not-allowed"
      }`}
      title={
        isCoolingDown
          ? `Cooldown: ${remainingSec}s remaining`
          : `Boost ${targetUsername}'s value by +10% for ${formatNumber(cost)}¢`
      }
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isCoolingDown ? (
        <>
          <Clock className="h-4 w-4 mr-2" />
          Boost in {remainingSec}s
        </>
      ) : (
        <>
          <TrendingUp className="h-4 w-4 mr-2" />
          Boost +10% ({formatNumber(cost)}¢)
        </>
      )}
    </Button>
  );
}
