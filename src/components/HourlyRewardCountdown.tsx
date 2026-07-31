"use client";

import { Clock } from "lucide-react";
import { useNow } from "@/hooks/useNow";

/**
 * Seconds until the next hour boundary (:00 UTC), where the hourly portfolio +
 * rank payouts land. Epoch-based so it is timezone-independent and matches the
 * cron schedule.
 */
export function secondsToNextHour(nowMs: number): number {
  const minutesSinceEpoch = Math.floor(nowMs / 60000);
  const minutesUntilNext = 60 - (minutesSinceEpoch % 60);
  return minutesUntilNext * 60 - (Math.floor(nowMs / 1000) % 60);
}

export function formatCountdown(seconds: number): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/**
 * A single, shared countdown pill for all hourly rewards (portfolio + rank).
 * Shown once (in the "Your Rewards & Income" header) instead of a separate
 * counter on every card.
 */
export function HourlyRewardCountdown() {
  const now = useNow();
  const seconds = secondsToNextHour(now);

  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900/60 border border-gray-700">
      <Clock className="h-3.5 w-3.5 text-t1-400" />
      <span className="font-mono font-bold text-white text-sm">
        {formatCountdown(seconds)}
      </span>
    </span>
  );
}
