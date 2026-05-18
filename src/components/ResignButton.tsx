"use client";

import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DoorOpen, Loader2 } from "lucide-react";
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
import { useSound } from "@/hooks/useSound";
import { formatNumber } from "@/lib/utils";

interface ResignButtonProps {
  ownershipId: number;
  ownerUsername: string;
  userCredits: number;
}

export function ResignButton({ ownershipId, ownerUsername, userCredits }: ResignButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { play } = useSound();

  const cost = Math.floor(userCredits * 0.9);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/sellout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownershipId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Resign failed");
      return data;
    },
    onSuccess: async (data) => {
      toast.success(
        `You resigned from ${ownerUsername}! Paid ${formatNumber(data.cost)}¢.`
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
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          onClick={() => play("buttons")}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 text-sm px-4 py-2 h-auto min-h-[36px] font-bold"
        >
          <DoorOpen className="h-4 w-4 mr-2" />
          Resign — {formatNumber(cost)}¢
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-white">Resign from {ownerUsername}?</DialogTitle>
          <DialogDescription className="text-gray-400">
            You will pay{" "}
            <span className="text-red-400 font-semibold">{formatNumber(cost)}¢</span>{" "}
            (90% of your credits) to{" "}
            <span className="text-white font-semibold">{ownerUsername}</span>{" "}
            to release yourself from their ownership.
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
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Resigning…
              </>
            ) : (
              `Resign — ${formatNumber(cost)}¢`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
