"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { LogOut, Loader2 } from "lucide-react";
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

interface SellOutButtonProps {
  ownershipId: number;
  ownerUsername: string;
  playerValue: number;
}

export function SellOutButton({ ownershipId, ownerUsername, playerValue }: SellOutButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();
  const { play } = useSound();

  const cost = playerValue;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/sellout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownershipId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sell out failed");
      return data;
    },
    onMutate: async () => {
      // Optimistic update: the seller pays `cost` credits immediately.
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - cost : undefined
      );
      return { previousCredits };
    },
    onSuccess: async (data) => {
      play("sell");
      toast.success(
        `Sold out from ${ownerUsername}! Paid ${data.cost}¢. Your value resets to floor.`
      );
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      play("error");
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          onClick={() => play("open")}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-xl px-8 py-6 h-auto min-h-[56px] font-bold"
        >
          <LogOut className="h-7 w-7 mr-2" />
          {t.sellOut}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">{t.sellOutConfirmTitle} — {ownerUsername}</DialogTitle>
          <DialogDescription className="text-gray-400">
            Pay{" "}
            <span className="text-red-400 font-semibold">{formatCompact(cost)}¢</span>{" "}
            (your current value) to{" "}
            <span className="text-white font-semibold">{ownerUsername}</span>{" "}
            to release yourself from their ownership.
            <br /><br />
            ⚠️ Your player value will reset to its floor value.
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
                {t.sellingOut}
              </>
            ) : (
              `${t.sellOut} ${formatCompact(cost)}¢`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
