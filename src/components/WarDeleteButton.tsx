"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Swords, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSound } from "@/hooks/useSound";
import { useNow } from "@/hooks/useNow";

interface WarDeleteButtonProps {
  targetId: number;
  targetUsername: string;
  isNpc: boolean;
  /** ISO timestamp while War Delete is on its 1-minute cooldown, else null. */
  cooldownUntil?: string | null;
  className?: string;
}

/**
 * Goddess of War power button — rendered by PlayerCard only when the viewer
 * has War power and owns the card (the server re-checks both).
 *
 *   - NPC: permanently deleted from the game; 2 fresh NPCs spawn into the
 *     market as replacements.
 *   - Human: never deleted — their card value resets to 1¢ ($1) and the War
 *     holder loses ownership.
 *
 * A 1-minute cooldown applies after each delete (server-enforced); while
 * cooling down the button is disabled and shows the remaining seconds.
 */
export function WarDeleteButton({
  targetId,
  targetUsername,
  isNpc,
  cooldownUntil,
  className = "",
}: WarDeleteButtonProps) {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Shared 1s clock for the cooldown countdown (no per-card intervals).
  const now = useNow();
  const cooldownRemainingSec = cooldownUntil
    ? Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - now) / 1000))
    : 0;
  const onCooldown = cooldownRemainingSec > 0;

  /** Sync the new cooldown into the shared goddess-powers cache so every
      card's War Delete button disables at once. */
  const syncCooldownCache = (until: string | null | undefined) => {
    if (!until) return;
    // Prefix match — the useKnowledgePower key is ["goddess-powers", userId].
    queryClient.setQueriesData(
      { queryKey: ["goddess-powers"] },
      (old: Record<string, unknown> | undefined) =>
        old ? { ...old, warDeleteCooldownUntil: until } : old
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/war-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const error = new Error(data.error || "War delete failed") as Error & {
          cooldownUntil?: string;
        };
        error.cooldownUntil = data.cooldownUntil;
        throw error;
      }
      return data as {
        kind: "npc" | "human";
        username: string;
        respawnedCount?: number;
        cooldownUntil?: string;
      };
    },
    onSuccess: async (data) => {
      setConfirmOpen(false);
      play("sell");
      syncCooldownCache(data.cooldownUntil);
      toast.success(
        data.kind === "npc"
          ? `${data.username} was deleted from the game. ${data.respawnedCount ?? 0} new NPCs entered the market.`
          : `${data.username}'s value was reset to 1¢ and you lost ownership.`
      );
      // Owned-card count changes on NPC delete — keep the navbar indicators
      // (missions progress + slots counter) in sync per project convention.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["missions"], refetchType: "active" }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"], refetchType: "active" }),
      ]);
    },
    onError: (err: Error & { cooldownUntil?: string }) => {
      play("error");
      syncCooldownCache(err.cooldownUntil);
      toast.error(err.message);
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onCooldown) {
      play("error");
      toast.error(`War Delete is on cooldown — ${cooldownRemainingSec}s remaining`);
      return;
    }
    play("open");
    setConfirmOpen(true);
  };

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={mutation.isPending || onCooldown}
        title={
          onCooldown
            ? `War Delete recharges in ${cooldownRemainingSec}s`
            : "Goddess of War power: destroy this card"
        }
        className={`rounded-md flex items-center justify-center gap-1.5 font-bold text-xs py-1 px-2 h-auto border border-orange-800 text-orange-300 bg-transparent hover:bg-orange-900/30 hover:text-orange-200 disabled:opacity-50 ${className}`}
      >
        {mutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Swords className="h-3.5 w-3.5" />
        )}
        {onCooldown ? `Delete (${cooldownRemainingSec}s)` : "Delete"}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              War Delete — {targetUsername}
            </DialogTitle>
            <DialogDescription>
              {isNpc
                ? "This NPC will be permanently deleted from the game and 2 new NPCs will be generated into the market. This cannot be undone."
                : `${targetUsername} is a human player and cannot be deleted — instead their card value resets to 1¢ and you lose ownership of them. They remain in the game.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {isNpc ? "Delete NPC" : "Reset value & release"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
