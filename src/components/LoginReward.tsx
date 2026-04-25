"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Clock, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";

export function LoginReward() {
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState<string>("");
  const { play } = useSound();

  const { data: rewardStatus, isLoading } = useQuery({
    queryKey: ["login-reward-status"],
    queryFn: async () => {
      const res = await fetch("/api/game/login-reward");
      if (!res.ok) throw new Error("Failed to fetch reward status");
      return res.json();
    },
    refetchInterval: 60 * 1000, // Refetch every minute
  });

  // Update countdown timer
  useEffect(() => {
    if (!rewardStatus?.timeRemaining) {
      setCountdown("");
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const nextReward = rewardStatus.nextRewardAt
        ? new Date(rewardStatus.nextRewardAt)
        : null;

      if (!nextReward) {
        setCountdown("");
        return;
      }

      const diff = nextReward.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown("");
        queryClient.invalidateQueries({ queryKey: ["login-reward-status"] });
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(
        `${hours.toString().padStart(2, "0")}:${minutes
          .toString()
          .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [rewardStatus, queryClient]);

  const claimMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/login-reward", {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to claim reward");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`🎁 Login reward claimed! +${data.reward.toLocaleString()}¢`);
        queryClient.invalidateQueries({ queryKey: ["login-reward-status"] });
        queryClient.invalidateQueries({ queryKey: ["credits"] });
        queryClient.invalidateQueries({ queryKey: ["player"] });
      } else {
        toast.info(data.message || "Reward already claimed");
      }
    },
    onError: () => {
      toast.error("Failed to claim login reward");
    },
  });

  if (isLoading) {
    return (
      <Card className="border-gray-800 bg-gradient-to-br from-purple-900/30 to-gray-900/80">
        <CardContent className="p-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const canClaim = rewardStatus?.canClaim;

  return (
    <Card
      className={`border-gray-800 overflow-hidden transition-all duration-300 ${
        canClaim
          ? "bg-gradient-to-br from-green-900/40 to-emerald-900/30 border-green-700/50 shadow-lg shadow-green-900/20"
          : "bg-gradient-to-br from-gray-900/80 to-gray-950/80"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${
                canClaim
                  ? "bg-green-500/20 text-green-400"
                  : "bg-gray-700/50 text-gray-400"
              }`}
            >
              {canClaim ? (
                <Gift className="h-5 w-5" />
              ) : (
                <Clock className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">
                Daily Login Reward
              </h3>
              <p className="text-xs text-gray-400">
                {canClaim
                  ? `Claim your ${(rewardStatus?.rewardAmount ?? 0).toLocaleString()}¢ reward!`
                  : `Next reward in ${countdown}`}
              </p>
            </div>
          </div>

          {canClaim ? (
            <Button
              onClick={() => {
                play("hire");
                claimMutation.mutate();
              }}
              disabled={claimMutation.isPending}
              className="bg-green-600 hover:bg-green-500 text-white shrink-0"
              size="sm"
            >
              {claimMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Gift className="h-4 w-4 mr-1" />
                  Claim
                </>
              )}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-gray-500 text-xs">
              <Check className="h-3.5 w-3.5" />
              <span>Claimed</span>
            </div>
          )}
        </div>

        {/* Progress bar for time remaining */}
        {!canClaim && rewardStatus?.lastClaimedAt && (
          <div className="mt-3">
            <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-1000"
                style={{
                  width: `${
                    100 -
                    ((rewardStatus.timeRemaining || 0) / (24 * 60 * 60 * 1000)) *
                      100
                  }%`,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}