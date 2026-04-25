"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, UserPlus } from "lucide-react";
import { useSound } from "@/hooks/useSound";

type RandomPlayerStatus = {
  canCreate: boolean;
  capped?: boolean;
  misconfigured?: boolean;
  reason?: string;
  npcCount: number | null;
  intervalMinutes: number | null;
  minutesSinceLastCron?: number;
  nextCreationTime: string | null;
  timestamp: string;
};

export function RandomPlayerCountdown() {
  const queryClient = useQueryClient();
  const [timeRemaining, setTimeRemaining] = useState<{
    minutes: number;
    seconds: number;
    totalSeconds: number;
  }>({ minutes: 0, seconds: 0, totalSeconds: 0 });
  const prevSecondsRef = useRef<number>(0);
  const wasSmallRef = useRef<boolean>(false);
  const hitZeroRef = useRef<boolean>(false);
  const { play } = useSound();

  // Fetch the random player status from the server. 15s refetch is a nice
  // balance between load and "Creating…" → next-target-time latency. When the
  // countdown hits 0 we also trigger a one-shot refetch (below) to close the
  // gap further, plus invalidate the players list so the new NPC shows up.
  const { data: statusData } = useQuery<RandomPlayerStatus>({
    queryKey: ["randomPlayerStatus"],
    queryFn: async () => {
      const res = await fetch("/api/cron/random-player-status");
      if (!res.ok) throw new Error("Failed to fetch random player status");
      return res.json();
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  useEffect(() => {
    const updateCountdown = () => {
      if (!statusData?.nextCreationTime) {
        setTimeRemaining({ minutes: 0, seconds: 0, totalSeconds: 0 });
        return;
      }

      const now = new Date();
      const nextCreation = new Date(statusData.nextCreationTime);
      const diffMs = nextCreation.getTime() - now.getTime();

      if (diffMs <= 0) {
        // Time has passed → server will create on its next cron tick. Trigger
        // a one-shot refetch (guarded by hitZeroRef so we don't spam) to pick
        // up the new nextCreationTime as soon as the cron runs, and refresh
        // the players list so the newly-created NPC appears immediately.
        if (!hitZeroRef.current) {
          hitZeroRef.current = true;
          queryClient.invalidateQueries({ queryKey: ["randomPlayerStatus"] });
          queryClient.invalidateQueries({ queryKey: ["players"] });
        }
        setTimeRemaining({ minutes: 0, seconds: 0, totalSeconds: 0 });
        return;
      }

      // Reset the hit-zero guard once we're back above 0.
      hitZeroRef.current = false;

      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      // Play sound when countdown wraps (was at/near 0, now back to a full value).
      const prevSeconds = prevSecondsRef.current;
      const justReset = wasSmallRef.current && prevSeconds <= 5 && totalSeconds > 100;

      if (justReset) {
        play("hire");
      }

      wasSmallRef.current = totalSeconds > 0 && totalSeconds <= 10;
      prevSecondsRef.current = totalSeconds;

      setTimeRemaining({ minutes, seconds, totalSeconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [statusData, play, queryClient]);

  // Hide entirely when the 600-NPC cap is reached or the server is
  // misconfigured — no useful information to show regular players.
  if (statusData?.capped || statusData?.misconfigured) {
    return null;
  }

  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="rounded-xl bg-gradient-to-br from-t1-900/20 to-t2-900/20 border border-t1-500/20 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-t1-400" />
          <h3 className="text-sm font-semibold text-t1-400">
            Next Random Player
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-t1-500/20">
          <Clock className="h-3.5 w-3.5 text-t1-400" />
          <span className="font-mono font-bold text-white text-sm">
            {timeRemaining.totalSeconds > 0
              ? `${pad(timeRemaining.minutes)}:${pad(timeRemaining.seconds)}`
              : "Creating..."}
          </span>
        </div>
      </div>
    </div>
  );
}
