"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DollarSign, Loader2, ShieldBan, Timer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";

interface SellButtonProps {
  otherId: number;
  otherUsername: string;
  cost: number;
  blockSellUntil?: string | null;
  blockSellBy?: string | null;
}

export function DiscardButton({ otherId, otherUsername, cost, blockSellUntil, blockSellBy }: SellButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const { play } = useSound();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/discard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otherId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sell failed");
      return data;
    },
    onSuccess: async () => {
      toast.success(`Sold ${otherUsername} for ${cost}¢! Their value resets to 1.`);
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

  // Live countdown for blocked sell
  const [countdown, setCountdown] = useState<string | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    if (!blockSellUntil) {
      setIsBlocked(false);
      setCountdown(null);
      return;
    }

    const target = new Date(blockSellUntil).getTime();

    function update() {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        setIsBlocked(false);
        setCountdown(null);
        return;
      }
      setIsBlocked(true);
      const h = Math.floor(remaining / (1000 * 60 * 60));
      const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((remaining % (1000 * 60)) / 1000);
      setCountdown(`${h}h ${m}m ${s}s`);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [blockSellUntil]);

  if (isBlocked) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <Button
          variant="outline"
          disabled
          className="border-orange-500/30 text-orange-400 cursor-not-allowed min-w-[120px] text-sm px-3 py-2 h-auto min-h-[36px] font-bold"
        >
          <Timer className="h-4 w-4 mr-2 shrink-0" />
          {countdown}
        </Button>
        {blockSellBy && (
          <span className="text-[10px] text-orange-400 font-medium">
            🤝 Partnered by {blockSellBy}
          </span>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          onClick={() => play("buttons")}
          className="border-t1-500/30 text-t1-400 hover:bg-t1-500/10 hover:text-t1-300 text-sm px-3 py-2 h-auto min-h-[36px] font-bold"
        >
          <DollarSign className="h-4 w-4 mr-2" />
          {t.discard} {cost}¢
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">{t.discardConfirmTitle}</DialogTitle>
          <DialogDescription className="text-gray-400">
            Are you sure you want to sell{" "}
            <span className="text-white font-semibold">{otherUsername}</span>?
            You will receive{" "}
            <span className="text-t1-400 font-semibold">{cost}¢</span> and
            their value will reset to 1¢.
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
            className="bg-t1-600 hover:bg-t1-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.discarding}
              </>
            ) : (
              `${t.discard} ${cost}¢`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
