"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, UserPlus } from "lucide-react";
import { useSound } from "@/hooks/useSound";

export function RandomPlayerCountdown() {
  const [timeRemaining, setTimeRemaining] = useState<{
    minutes: number;
    seconds: number;
    totalSeconds: number;
  }>({ minutes: 0, seconds: 0, totalSeconds: 0 });
  const prevSecondsRef = useRef<number>(0);
  const wasSmallRef = useRef<boolean>(false);
  const { play } = useSound();

  // Fetch the random player status from the server
  const { data: statusData } = useQuery({
    queryKey: ["randomPlayerStatus"],
    queryFn: async () => {
      const res = await fetch("/api/cron/random-player-status");
      if (!res.ok) throw new Error("Failed to fetch random player status");
      return res.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds to stay in sync
    staleTime: 20000,
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
        // Time has passed, player should be created soon
        setTimeRemaining({ minutes: 0, seconds: 0, totalSeconds: 0 });
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      // Play sound when countdown reaches low values
      const prevSeconds = prevSecondsRef.current;
      const justReset = wasSmallRef.current && prevSeconds <= 5 && totalSeconds > 100;
      
      if (justReset) {
        play("buy");
      }
      
      wasSmallRef.current = totalSeconds > 0 && totalSeconds <= 10;
      prevSecondsRef.current = totalSeconds;

      setTimeRemaining({ minutes, seconds, totalSeconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [statusData, play]);

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
      
      <p className="text-xs text-gray-500 mt-2">
        A new random NPC player joins the game every 3 minutes!
      </p>
      <p className="text-xs text-gray-500 mt-1">
        NPCs older than 1 day without owner are deleted from the game.
      </p>
    </div>
  );
}