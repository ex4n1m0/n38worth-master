"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCompact } from "@/lib/utils";
import { useSound } from "@/hooks/useSound";

const RESTORE_FEE = 1000;

interface RestoreAllButtonProps {
  eligibleCount: number;
}

export function RestoreAllButton({ eligibleCount }: RestoreAllButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { play } = useSound();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/restore-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      return data;
    },
    onSuccess: async (data) => {
      play("hire");
      const msg = `Restored ${data.hiredCount} player${data.hiredCount !== 1 ? "s" : ""}!${data.skippedCount > 0 ? ` (${data.skippedCount} skipped)` : ""}`;
      toast.success(msg);
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["lost-players"] }),
        queryClient.invalidateQueries({ queryKey: ["missions"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
      ]);
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
  });

  if (eligibleCount === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => play("open")}
          className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          Restore
          <span className="ml-1.5 font-mono text-xs opacity-80">
            −₡{formatCompact(RESTORE_FEE)}+
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">Restore Lost Players?</DialogTitle>
          <DialogDescription className="text-gray-400">
            {`This will hire back eligible lost players starting from the cheapest until your credits run out.`}
            <br /><br />
            <span className="text-gray-300">
              Up to {eligibleCount} player{eligibleCount !== 1 ? "s" : ""} available
              <br />
              Restore fee: <span className="font-mono text-white">₡{formatCompact(RESTORE_FEE)}</span>
              <br />
              <span className="text-gray-400 text-sm">
                (Actual cost depends on which players you can afford)
              </span>
            </span>
            <br /><br />
            Players you already own or that are cloaked will be skipped.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-gray-700 text-gray-300"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Restoring...
              </>
            ) : (
              "Yes, Restore"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
