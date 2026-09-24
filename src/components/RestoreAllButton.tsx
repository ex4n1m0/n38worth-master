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
import { useLanguage } from "./LanguageContext";

const RESTORE_FEE = 1000;

interface RestoreAllButtonProps {
  eligibleCount: number;
}

export function RestoreAllButton({ eligibleCount }: RestoreAllButtonProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { t } = useLanguage();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/restore-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.restoreFailed);
      return data;
    },
    onSuccess: async (data) => {
      play("hire");
      const msg = (data.hiredCount !== 1 ? t.restoreAllToastPlural : t.restoreAllToast)
        .replace("{count}", String(data.hiredCount))
        + (data.skippedCount > 0 ? t.restoreAllToastSkipped.replace("{count}", String(data.skippedCount)) : "");
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
          {t.restore}
          <span className="ml-1.5 font-mono text-xs opacity-80">
            −₡{formatCompact(RESTORE_FEE)}+
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">{t.restoreAllConfirmTitle}</DialogTitle>
          <DialogDescription className="text-gray-400">
            {t.restoreAllDesc}
            <br /><br />
            <span className="text-gray-300">
              {(eligibleCount !== 1 ? t.restoreAllUpToPlural : t.restoreAllUpTo)
                .replace("{count}", String(eligibleCount))}
              <br />
              {t.restoreAllFee} <span className="font-mono text-white">₡{formatCompact(RESTORE_FEE)}</span>
              <br />
              <span className="text-gray-400 text-sm">
                {t.restoreAllFeeNote}
              </span>
            </span>
            <br /><br />
            {t.restoreAllSkipNote}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-gray-700 text-gray-300"
          >
            {t.cancel}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.restoring}
              </>
            ) : (
              t.restoreAllConfirmButton
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
