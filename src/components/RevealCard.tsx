"use client";

import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Eye } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { formatCompact } from "@/lib/utils";

/**
 * Pinned "Reveal" card for the market page.
 *
 * Grants temporary Knowledge — see ALL avatars — for 10 minutes, costing
 * 10% of the buyer's current credits. Repeat uses stack +10 minutes.
 */
export function RevealCard() {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { data: session } = useSession();
  const { data: myCredits } = useCredits();
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["goddess-powers"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const handleClick = () => {
    if (!canAfford || mutation.isPending) return;
    play("hire");
    mutation.mutate();
  };

  return (
    <Card className="border-violet-600/50 bg-violet-950/30 hover:bg-violet-900/40 hover:border-violet-500/60 transition-all duration-200 cursor-pointer group relative">
      <CardContent className="p-3 relative flex flex-col items-center gap-2">
        <div className="relative w-full">
          <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-violet-600/50 group-hover:ring-violet-500/60 transition-all">
            <AvatarImage src="/reveal.png" alt="Reveal" className="object-fill" />
            <AvatarFallback className="rounded-lg bg-gradient-to-br from-violet-600 to-purple-600 text-white font-bold text-3xl">
              <Eye className="h-10 w-10" />
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="w-full text-center">
          <h3 className="font-bold text-violet-300 group-hover:text-violet-200 transition-colors leading-tight flex items-center justify-center gap-1.5 flex-wrap" style={{ fontSize: "clamp(0.7rem, 1.3vw, 1.05rem)" }}>
            <Eye className="h-4 w-4 text-violet-400 shrink-0" />
            Reveal
          </h3>
          <p className="text-xs text-violet-200/70 mt-0.5">
            See every avatar for 10 minutes
          </p>
        </div>

        <Button
          onClick={handleClick}
          disabled={!canAfford || mutation.isPending}
          className={`w-[80%] aspect-square h-auto rounded-md flex flex-col items-center justify-center gap-0.5 font-bold ${
            canAfford
              ? "text-white bg-transparent border-2 border-violet-500 hover:bg-violet-500/15 shadow-lg shadow-violet-900/30"
              : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {mutation.isPending ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <span className="text-sm sm:text-lg leading-none flex items-center gap-1">
                <Eye className="h-4 w-4" />
                REVEAL
              </span>
              {isActive && (
                <span className="text-violet-300 tabular-nums" style={{ fontSize: "clamp(0.6rem, 1.2vw, 0.8rem)" }}>
                  {mins}m {secs}s left
                </span>
              )}
              <span style={{ fontSize: "clamp(0.55rem, 1.1vw, 0.7rem)" }} className="text-violet-100">
                {formatCompact(cost)}¢ (10% of credits)
              </span>
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
