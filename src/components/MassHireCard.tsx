"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Lock, Zap, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { formatCompact } from "@/lib/utils";
import {
  MASS_HIRE_CARD,
  MASS_HIRE_UNLOCK_THRESHOLD,
  isLockablePurchaseCard,
  isPurchaseUnlockedAtLevel,
  purchaseUnlockThreshold,
} from "@/lib/missions-data";

/**
 * Pinned "Mass Hire" bonus card for the market page.
 *
 * - Locked until the viewer owns 500 cards.
 * - When unlocked, shows a MASS HIRE button that hires the cheapest ownerless
 *   players in bulk (1 + 10% of current owned count per use).
 * - 10-minute cooldown after each use, shown as a depleting progress bar.
 */
export function MassHireCard({
  ownedCount,
  cooldownEndsAt: initialCooldownEnd,
}: {
  ownedCount: number;
  cooldownEndsAt?: number;
}) {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const missionLevel = useMissionLevel();

  const isLocked =
    isLockablePurchaseCard(MASS_HIRE_CARD) &&
    !isPurchaseUnlockedAtLevel(MASS_HIRE_CARD, missionLevel) &&
    ownedCount < MASS_HIRE_UNLOCK_THRESHOLD;

  const unlockThreshold = purchaseUnlockThreshold(MASS_HIRE_CARD);

  // Cooldown state. cooldownEnd is stored as epoch SECONDS (int32 in DB).
  const [cooldownEndSec, setCooldownEndSec] = useState(initialCooldownEnd ?? 0);
  const [remainingMs, setRemainingMs] = useState(0);
  const [cooldownPct, setCooldownPct] = useState(0);

  const COOLDOWN_MS = 10 * 60 * 1000;

  const updateCooldown = useCallback(() => {
    if (!cooldownEndSec) {
      setRemainingMs(0);
      setCooldownPct(0);
      return;
    }
    const endMs = cooldownEndSec * 1000;
    const ms = Math.max(0, endMs - Date.now());
    setRemainingMs(ms);
    // Progress bar: 100% at start of cooldown, depleting to 0% when ready.
    const pct = Math.min(100, (ms / COOLDOWN_MS) * 100);
    setCooldownPct(pct);
  }, [cooldownEndSec, COOLDOWN_MS]);

  useEffect(() => {
    updateCooldown();
    if (cooldownEndSec && cooldownEndSec * 1000 > Date.now()) {
      const id = setInterval(updateCooldown, 1000);
      return () => clearInterval(id);
    }
  }, [cooldownEndSec, updateCooldown]);

  // Fetch cooldown status on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/game/mass-hire-status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.cooldownEndsAt) {
          setCooldownEndSec(data.cooldownEndsAt); // already in seconds
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onCooldown = cooldownEndSec > 0 && cooldownEndSec * 1000 > Date.now() && remainingMs > 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/mass-hire", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mass Hire failed");
      return data;
    },
    onSuccess: async (data) => {
      const count = data.hired?.length ?? 0;
      const spent = data.totalSpent ?? 0;
      toast.success(`Mass Hire! Hired ${count} player${count !== 1 ? "s" : ""} for ${formatCompact(spent)}¢`);
      if (data.cooldownEndsAt) {
        setCooldownEndSec(data.cooldownEndsAt); // epoch seconds from server
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClick = () => {
    if (onCooldown || isLocked) return;
    play("hire");
    mutation.mutate();
  };

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  const cooldownLabel = `${mins}m ${secs}s`;

  return (
    <Card className="border-amber-600/50 bg-amber-950/30 hover:bg-amber-900/40 hover:border-amber-500/60 transition-all duration-200 cursor-pointer group relative">
      <CardContent className="p-3 relative flex flex-col items-center gap-2">
        <div className="relative w-full">
          <Avatar className="w-full h-auto aspect-[4/3] rounded-lg ring-2 ring-amber-600/50 group-hover:ring-amber-500/60 transition-all">
            <AvatarImage src="/masshire.png" alt="Mass Hire" className="object-contain bg-black/30" />
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-amber-600 to-yellow-600 text-white font-bold text-3xl">
              MH
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="w-full text-center">
          <h3 className="font-bold text-amber-300 group-hover:text-amber-200 transition-colors leading-tight flex items-center justify-center gap-1.5 flex-wrap" style={{ fontSize: "clamp(0.7rem, 1.3vw, 1.05rem)" }}>
            <Zap className="h-4 w-4 text-amber-400 shrink-0" />
            Mass Hire
          </h3>
          <p className="text-xs text-amber-200/70 mt-0.5">
            Bulk-hire cheapest ownerless cards
          </p>
        </div>

        {isLocked ? (
          <div
            className="w-[80%] rounded-md flex flex-col items-center justify-center gap-0.5 border border-gray-700 bg-gray-800/70 text-gray-300"
            style={{ height: "clamp(2.5rem, 6vw, 4rem)" }}
            title={unlockThreshold !== null ? `Own ${formatCompact(unlockThreshold)} cards to unlock` : "Locked"}
          >
            <span className="flex items-center gap-1 text-sm sm:text-base font-bold leading-none">
              <Lock className="h-3.5 w-3.5" />
              Locked
            </span>
            {unlockThreshold !== null && (
              <span className="text-center leading-tight px-1" style={{ fontSize: "clamp(0.55rem, 1.1vw, 0.7rem)" }}>
                {formatCompact(unlockThreshold)} cards to unlock
              </span>
            )}
            <span className="text-[10px] text-gray-500 mt-0.5">
              You own {formatCompact(ownedCount)}
            </span>
          </div>
        ) : onCooldown ? (
          <div className="w-[80%] flex flex-col items-center gap-1 rounded-md bg-amber-950/50 border border-amber-500/30 py-1.5 px-2">
            <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-amber-400 leading-none tabular-nums">
              <Clock className="h-3 w-3" />
              {cooldownLabel}
            </span>
            <div className="w-[85%] h-1 rounded-full overflow-hidden bg-amber-500/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 transition-[width] duration-1000 ease-linear"
                style={{ width: `${cooldownPct}%` }}
              />
            </div>
          </div>
        ) : (
          <Button
            onClick={handleClick}
            disabled={mutation.isPending}
            className="w-[80%] rounded-md flex flex-col items-center justify-center gap-0.5 font-bold text-white bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 shadow-lg shadow-amber-900/30"
            style={{ height: "clamp(2.5rem, 6vw, 4rem)" }}
          >
            {mutation.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <span className="text-sm sm:text-lg leading-none flex items-center gap-1">
                  <Zap className="h-4 w-4" />
                  MASS HIRE
                </span>
                <span style={{ fontSize: "clamp(0.55rem, 1.1vw, 0.7rem)" }} className="text-amber-100">
                  {1 + Math.floor(ownedCount * 0.1)} cards
                </span>
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
