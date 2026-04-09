"use client";

import { useState, useEffect, useRef } from "react";
import { Clock, AlertTriangle } from "lucide-react";
import { useSound } from "@/hooks/useSound";

/** Calculate seconds remaining until the next penalty interval */
function getSecondsToNextPenalty(penaltyMinutes: number) {
  const now = new Date();
  const minutesSinceEpoch = Math.floor(now.getTime() / (1000 * 60));
  const minutesUntilNext = penaltyMinutes - (minutesSinceEpoch % penaltyMinutes);
  const seconds = now.getSeconds();
  
  // Calculate total seconds until next interval boundary
  return (minutesUntilNext * 60) - seconds;
}

export function OfflinePenaltyCountdown() {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [penaltyMinutes, setPenaltyMinutes] = useState(60); // Fixed: 60 minutes
  const prevSecondsRef = useRef<number>(0);
  const wasSmallRef = useRef<boolean>(false);
  const { play } = useSound();

  // Update countdown every second
  useEffect(() => {
    const update = () => {
      const newSeconds = getSecondsToNextPenalty(penaltyMinutes);
      const prevSeconds = prevSecondsRef.current;
      
      // Check if we just had a reset: was counting down (prev was small, 1-60) and now jumped to large
      const justReset = wasSmallRef.current && prevSeconds <= 60 && newSeconds > 60;
      
      if (justReset) {
        play("buy");
      }
      
      // Track if we're in the "counting down from small value" state
      wasSmallRef.current = prevSeconds > 0 && prevSeconds <= 60;
      
      prevSecondsRef.current = newSeconds;
      setTotalSeconds(newSeconds);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [penaltyMinutes, play]);

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="rounded-xl bg-gradient-to-br from-red-900/20 to-orange-900/20 border border-red-500/20 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <h3 className="text-sm font-semibold text-red-400">
            Offline Penalty — Every {penaltyMinutes} Minutes
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-red-500/20">
          <Clock className="h-3.5 w-3.5 text-red-400" />
          <span className="font-mono font-bold text-white text-sm">
            {pad(totalMinutes)}:{pad(seconds)}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Inactive players lose 1% credits every {penaltyMinutes} minutes offline. Stay active to avoid decay!
      </p>
    </div>
  );
}
