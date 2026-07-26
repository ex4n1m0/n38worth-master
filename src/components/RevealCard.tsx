"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Eye, Clock } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useBonusCooldown, useRefreshBonusCooldowns } from "@/hooks/useBonusCooldowns";
import { formatCompact } from "@/lib/utils";

/**
 * Pinned "Reveal" card for the market page.
 *
 * Grants temporary Knowledge — see ALL avatars — for 10 minutes, costing
 * 10% of the buyer's current credits. 10-minute cooldown after each use
 * (shared bonus-card cooldown), so the reveal window runs out right as the
 * card becomes usable again.
 */
export function RevealCard() {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { data: session } = useSession();
  const { data: myCredits } = useCredits();
  const { onCooldown, label: cooldownLabel, pct: cooldownPct } = useBonusCooldown("reveal");
  const refreshCooldowns = useRefreshBonusCooldowns();
  const [revealUntil, setRevealUntil] = useState<string | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);

  const cost = Math.max(1, Math.round((myCredits ?? 0) * 0.1));
  const canAfford = (myCredits ?? 0) >= 1;

  // Load current reveal window from goddess powers (temporaryKnowledgeUntil).
  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/game/goddess-powers");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.temporaryKnowledgeUntil) {
          setRevealUntil(data.temporaryKnowledgeUntil);
        }
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Tick the countdown.
  useEffect(() => {
    if (!revealUntil) { setRemainingMs(0); return; }
    const tick = () => setRemainingMs(Math.max(0, new Date(revealUntil).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [revealUntil]);

  const isActive = remainingMs > 0;
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/reveal-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reveal failed");
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`👁️ All avatars revealed for 10 minutes! (-${formatCompact(data.cost)}¢)`);
      setRevealUntil(data.revealUntil);
      refreshCooldowns();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["goddess-powers"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
  });

  const handleClick = () => {
    if (onCooldown) {
      play("error");
      toast.error(`Reveal is on cooldown — ready in ${cooldownLabel}.`);
      return;
    }
    if (!canAfford) {
      play("error");
      toast.error("Not enough credits to reveal avatars.");
      return;
    }
    if (mutation.isPending) return;
    play("reveal");
    mutation.mutate();
  };

  const isDisabled = !canAfford || onCooldown || mutation.isPending;
  const ringColor = onCooldown ? "ring-violet-700/50" : canAfford ? "ring-violet-500" : "ring-gray-600";
  const actionColor = onCooldown ? "text-violet-400" : canAfford ? "text-violet-300" : "text-gray-400";

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleClick();
  };

  return (
    <Card className="border-violet-600/50 bg-violet-950/30 hover:bg-violet-900/40 hover:border-violet-500/60 transition-all duration-200 relative pt-0">
      <CardContent className="p-2 relative flex flex-col items-center">
        {/* Header above avatar: title (vertically centered) */}
        <div className="w-full flex items-center justify-between gap-1.5 mb-1 min-h-[3rem]">
          <h3
            className="font-bold text-violet-300 leading-tight flex items-center gap-1 flex-wrap"
            style={{ fontSize: "clamp(0.87rem, 1.6vw, 1.2rem)" }}
          >
            <Eye className="h-3.5 w-3.5 text-violet-400 shrink-0" />
            Reveal
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
              <AvatarImage src="/reveal.webp" alt="Reveal" className="object-fill" />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 text-white font-bold text-2xl sm:text-3xl">
                <Eye className="h-8 w-8 sm:h-10 sm:w-10" />
              </AvatarFallback>
            </Avatar>
          </button>

          {/* Bottom overlay: action label */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none">
            <div className={`text-sm font-bold drop-shadow-sm flex flex-wrap items-center gap-1 ${actionColor}`}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              ) : onCooldown ? (
                <>
                  <Clock className="h-3 w-3" />
                  {cooldownLabel}
                </>
              ) : (
                <>
                  <Eye className="h-3 w-3" />
                  REVEAL {formatCompact(cost)}¢
                </>
              )}
            </div>
            {isActive && (
              <div className="text-[9px] text-violet-300/90 tabular-nums leading-none mt-0.5">
                {mins}m {secs}s active
              </div>
            )}
            {onCooldown && (
              <div className="w-full h-1 rounded-full overflow-hidden bg-violet-500/15 mt-1.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-400 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${cooldownPct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        <p className="w-full text-center text-[10px] text-violet-200/70 mt-1.5">
          See every avatar for 10 minutes
        </p>
      </CardContent>
    </Card>
  );
}
