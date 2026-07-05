"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";

interface DiscardAllButtonProps {
  ownedCount: number;
  totalValue: number;
  credits: number;
}

export function DiscardAllButton({ ownedCount, totalValue, credits }: DiscardAllButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const { play } = useSound();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/discard-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Discard all failed");
      return data;
    },
    onSuccess: async (data) => {
      const msg = `Discarded ${data.discardedCount} player${data.discardedCount !== 1 ? "s" : ""} for ${data.totalCreditsEarned}¢!${data.skippedCount > 0 ? ` (${data.skippedCount} skipped due to sell blocks)` : ""}`;
      toast.success(msg);
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const canAfford = credits >= totalValue;

  if (ownedCount === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          onClick={() => play("buttons")}
          disabled={!canAfford}
          title={!canAfford ? `You need ${formatCompact(totalValue)}¢ to discard all` : undefined}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          {t.discardAll ?? "Discard All"}
          <span className="ml-1.5 font-mono text-xs opacity-80">
            −{formatCompact(totalValue)}¢
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">{t.discardAllConfirmTitle ?? "Discard All Players?"}</DialogTitle>
          <DialogDescription className="text-gray-400">
            {`Discarding all ${ownedCount} player${ownedCount !== 1 ? "s" : ""} costs ${formatCompact(totalValue)}¢ upfront. You'll receive back ~${formatCompact(Math.floor(totalValue / 2))}¢ (50%), and each discarded player receives their 50%. Players with active sell blocks will be skipped.`}
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
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.discardingAll ?? "Discarding All..."}
              </>
            ) : (
              t.discardAllConfirmButton ?? "Yes, Discard All"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
