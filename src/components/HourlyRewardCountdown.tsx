"use client";

import { useState, useEffect } from "react";
import { Clock } from "lucide-react";

/**
 * Seconds until the next hour boundary (:00 UTC), where the hourly portfolio +
 * rank payouts land. Epoch-based so it is timezone-independent and matches the
 * cron schedule.
 */
function secondsToNextHour(): number {
  const now = new Date();
  const minutesSinceEpoch = Math.floor(now.getTime() / 60000);
  const minutesUntilNext = 60 - (minutesSinceEpoch % 60);
  return minutesUntilNext * 60 - now.getSeconds();
}

/**
 * A single, shared countdown pill for all hourly rewards (portfolio + rank).
 * Shown once (in the "Your Rewards & Income" header) instead of a separate
 * counter on every card.
 */
export function HourlyRewardCountdown() {
  const [seconds, setSeconds] = useState(secondsToNextHour());

  useEffect(() => {
    const id = setInterval(() => setSeconds(secondsToNextHour()), 1000);
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-900/60 border border-gray-700">
      <Clock className="h-3.5 w-3.5 text-t1-400" />
      <span className="font-mono font-bold text-white text-sm">
        {pad(minutes)}:{pad(secs)}
      </span>
    </span>
  );
}
