"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Handshake, Loader2, Clock } from "lucide-react";
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

interface BlockSellButtonProps {
  ownershipId: number;
  ownerUsername: string;
  playerValue: number;
  blockSellUntil: string | null;
}

function formatTimeRemaining(until: string): string {
  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return "";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function BlockSellButton({ ownershipId, ownerUsername, playerValue, blockSellUntil }: BlockSellButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const { t } = useLanguage();
  const { play } = useSound();

  const isBlocked = blockSellUntil && new Date(blockSellUntil) > new Date();
  const cost = Math.max(1, Math.round(0.01 * playerValue));

  useEffect(() => {
    if (!blockSellUntil) return;
    const update = () => setTimeLeft(formatTimeRemaining(blockSellUntil));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [blockSellUntil]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/blocksell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownershipId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Block sell failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Partnered with ${ownerUsername}! Paid ${data.cost}¢ (+1h, ${data.totalHours}h total). 🤝`
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isBlocked ? (
          <button onClick={() => play("buttons")} className="flex items-center gap-3 px-6 py-4 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-lg font-bold min-h-[56px] cursor-pointer hover:bg-amber-500/20 transition-colors">
            <Handshake className="h-7 w-7" />
            <span>{t.partner}</span>
            {timeLeft && (
              <span className="flex items-center gap-1 text-amber-500/70">
                <Clock className="h-5 w-5" />
                {timeLeft}
              </span>
            )}
          </button>
        ) : (
          <Button
            variant="outline"
            onClick={() => play("buttons")}
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 text-xl px-8 py-6 h-auto min-h-[56px] font-bold"
          >
            <Handshake className="h-7 w-7 mr-2" />
            {t.partner}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">{t.partner} — {ownerUsername}</DialogTitle>
          <DialogDescription className="text-gray-400">
            {isBlocked ? (
              <>
                Add <span className="text-white font-semibold">+1 hour</span> to
                your partnership with{" "}
                <span className="text-white font-semibold">{ownerUsername}</span>.
                <br /><br />
                Currently protected for{" "}
                <span className="text-white font-semibold">{timeLeft}</span>.
                <br /><br />
                This will cost{" "}
                <span className="text-amber-400 font-semibold">{cost}¢</span>{" "}
                (1% of your value), paid directly to {ownerUsername}.
              </>
            ) : (
              <>
                Partner with{" "}
                <span className="text-white font-semibold">{ownerUsername}</span>{" "}
                to prevent them from discarding you for{" "}
                <span className="text-white font-semibold">1 hour</span>.
                <br /><br />
                This will cost{" "}
                <span className="text-amber-400 font-semibold">{cost}¢</span>{" "}
                (1% of your value), paid directly to {ownerUsername}.
                <br /><br />
                You can press Partner multiple times to add more hours.
              </>
            )}
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
            className="bg-amber-600 hover:bg-amber-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.partnering}
              </>
            ) : (
              `+1h ${cost}¢`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
