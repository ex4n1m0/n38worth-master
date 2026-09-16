"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Shield, Loader2, Clock } from "lucide-react";
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
  ownedUsername: string;
  playerValue: number;
  blockSellUntil: string | null;
  square?: boolean;
}

function formatTimeRemaining(until: string): string {
  const remaining = new Date(until).getTime() - Date.now();
  if (remaining <= 0) return "";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

export function BlockSellButton({ ownershipId, ownedUsername, playerValue, blockSellUntil, square }: BlockSellButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [timeLeft, setTimeLeft] = useState("");
  const { t } = useLanguage();
  const { play } = useSound();

  const isBlocked = blockSellUntil && new Date(blockSellUntil) > new Date();
  const cost = Math.max(1, Math.round(1.0 * playerValue));

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
      if (!res.ok) throw new Error(data.error || "Firewall failed");
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Firewall on ${ownedUsername}! Paid ${data.cost}¢ (+1h, ${data.totalHours}h total). 🔒`
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      setOpen(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {square ? (
          <Button
            variant="outline"
            onClick={() => play("buttons")}
            className={`h-12 w-12 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold drop-shadow-lg ${
              isBlocked
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            }`}
            title={isBlocked ? `Firewall ${ownedUsername}${timeLeft ? ` · ${timeLeft}` : ""}` : `Firewall ${ownedUsername} (${cost}¢)`}
          >
            <Shield className="h-4 w-4" />
            <span className="text-[7px] leading-none mt-0.5">Firewall</span>
          </Button>
        ) : isBlocked ? (
          <button onClick={() => play("buttons")} className="flex items-center gap-3 px-6 py-4 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-lg font-bold min-h-[56px] cursor-pointer hover:bg-amber-500/20 transition-colors">
            <Shield className="h-7 w-7" />
            <span>Firewall</span>
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
            <Shield className="h-7 w-7 mr-2" />
            Firewall
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">Firewall — {ownedUsername}</DialogTitle>
          <DialogDescription className="text-gray-400">
            {isBlocked ? (
              <>
                Add <span className="text-white font-semibold">+1 hour</span> to
                the firewall on{" "}
                <span className="text-white font-semibold">{ownedUsername}</span>.
                <br /><br />
                Currently shielded for{" "}
                <span className="text-white font-semibold">{timeLeft}</span>.
                <br /><br />
                This will cost{" "}
                <span className="text-amber-400 font-semibold">{cost}¢</span>{" "}
                (100% of {ownedUsername}&apos;s value), paid directly to them.
              </>
            ) : (
              <>
                Shield{" "}
                <span className="text-white font-semibold">{ownedUsername}</span>{" "}
                from being sold for{" "}
                <span className="text-white font-semibold">1 hour</span>.
                <br /><br />
                This will cost{" "}
                <span className="text-amber-400 font-semibold">{cost}¢</span>{" "}
                (100% of {ownedUsername}&apos;s value), paid directly to them.
                <br /><br />
                You can press Firewall multiple times to add more hours.
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
                Blocking...
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