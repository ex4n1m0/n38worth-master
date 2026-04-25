"use client";

import { Button } from "@/components/ui/button";
import { Gift, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useCredits } from "@/hooks/useCredits";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { formatNumber } from "@/lib/utils";

interface SendCreditsButtonProps {
  targetId: number;
  targetUsername: string;
}

export function SendCreditsButton({ targetId, targetUsername }: SendCreditsButtonProps) {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { t } = useLanguage();
  const { play } = useSound();
  const sendAmount = credits ? (credits * 0.01) : 0;

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/send-credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send credits");
      return data;
    },
    onSuccess: (data) => {
      toast.success(
        `Gifted ${formatNumber(data.amount.toFixed(2))}¢ to ${targetUsername}! 🎁`
      );
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <Button
      variant="outline"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        play("buttons");
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      className="border-t2-500/30 text-t2-400 hover:bg-t2-500/10 hover:text-t2-300 text-sm px-3 py-2 h-auto min-h-[36px] font-bold"
      title={`Gift 1% of your credits to ${targetUsername}`}
    >
      {mutation.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Gift className="h-4 w-4 mr-2" />
          {t.sendCredits} {formatNumber(parseFloat(sendAmount.toFixed(2)))}¢
        </>
      )}
    </Button>
  );
}
