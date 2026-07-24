"use client";

import { useState, useEffect, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lock, Zap, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { formatCompact } from "@/lib/utils";
import {
  MASS_HIRE_CARD,
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
 * - Dynamic cooldown after each use (1–5+ min based on owned count).
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
    !isPurchaseUnlockedAtLevel(MASS_HIRE_CARD, missionLevel);

  const unlockThreshold = purchaseUnlockThreshold(MASS_HIRE_CARD);

  // Cooldown state. cooldownEnd is stored as epoch SECONDS (int32 in DB).
  const [cooldownEndSec, setCooldownEndSec] = useState(initialCooldownEnd ?? 0);
  const [cooldownMs, setCooldownMs] = useState(5 * 60 * 1000); // fallback
  const [remainingMs, setRemainingMs] = useState(0);
  const [cooldownPct, setCooldownPct] = useState(0);

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
    const pct = Math.min(100, (ms / cooldownMs) * 100);
    setCooldownPct(pct);
  }, [cooldownEndSec, cooldownMs]);

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
        if (!cancelled) {
          if (data.cooldownEndsAt) {
            setCooldownEndSec(data.cooldownEndsAt); // already in seconds
          }
          if (data.cooldownMs) {
            setCooldownMs(data.cooldownMs);
          }
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onCooldown = remainingMs > 0;

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

  const isDisabled = isLocked || onCooldown || mutation.isPending;
  const ringColor = isLocked ? "ring-gray-600" : onCooldown ? "ring-amber-600/50" : "ring-amber-500";
  const actionColor = isLocked ? "text-gray-400" : onCooldown ? "text-amber-400" : "text-amber-300";

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick();
  };

  return (
    <Card className="border-amber-600/50 bg-amber-950/30 hover:bg-amber-900/40 hover:border-amber-500/60 transition-all duration-200 relative pt-0">
      <CardContent className="p-2 relative flex flex-col items-center">
        {/* Header above avatar: title (vertically centered) */}
        <div className="w-full flex items-center justify-between gap-1.5 mb-1 min-h-[3rem]">
          <h3
            className="font-bold text-amber-300 leading-tight flex items-center gap-1 flex-wrap"
            style={{ fontSize: "clamp(0.87rem, 1.6vw, 1.2rem)" }}
          >
            <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            Mass Hire
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
              <AvatarImage src="/masshire.webp" alt="Mass Hire" className="object-fill" />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-amber-600 to-yellow-600 text-white font-bold text-2xl sm:text-3xl">
                MH
              </AvatarFallback>
            </Avatar>
          </button>

          {/* Bottom overlay: action label */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none">
            <div className={`text-sm font-bold drop-shadow-sm flex flex-wrap items-center gap-1 ${actionColor}`}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : isLocked ? (
                <>
                  <Lock className="h-3 w-3" />
                  LOCKED
                </>
              ) : onCooldown ? (
                <>
                  <Clock className="h-3 w-3" />
                  {cooldownLabel}
                </>
              ) : (
                <>
                  <Zap className="h-3 w-3" />
                  MASS HIRE {1 + Math.floor(ownedCount * 0.1)} cards
                </>
              )}
            </div>
            {isLocked && unlockThreshold !== null && (
              <div className="text-[9px] text-gray-400 mt-0.5 leading-none">
                Own {formatCompact(unlockThreshold)} to unlock (you have {formatCompact(ownedCount)})
              </div>
            )}
            {onCooldown && (
              <div className="w-full h-1 rounded-full overflow-hidden bg-amber-500/15 mt-1.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${cooldownPct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <p className="w-full text-center text-[10px] text-amber-200/70 mt-1.5">
          Bulk-hire cheapest ownerless cards
        </p>
      </CardContent>
    </Card>
  );
}
