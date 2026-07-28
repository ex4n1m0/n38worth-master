"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { DollarSign, Loader2 } from "lucide-react";
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

interface SellButtonProps {
  otherId: number;
  otherUsername: string;
  cost: number;
}

export function DiscardButton({ otherId, otherUsername, cost }: SellButtonProps) {
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
    onMutate: async () => {
      // Optimistic update: the seller receives `cost` credits immediately.
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old + cost : undefined
      );
      return { previousCredits };
    },
    onSuccess: async () => {
      play("sell");
      toast.success(`Sold ${otherUsername} for ${cost}¢! Their value resets to 1.`);
      setOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["missions"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
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
          aria-label={`Sell ${otherUsername} for ${cost} credits`}
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
