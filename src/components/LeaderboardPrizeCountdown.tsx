"use client";

import { useState, useEffect } from "react";
import { Gift, Clock } from "lucide-react";

interface LeaderboardPrizeCountdownProps {
  totalPlayers: number;
  top3: { username: string; position: number }[];
  title?: string;
  description?: string;
  accentColor?: string;
}

/** Calculate seconds remaining until the next :00 or :30 mark */
function getSecondsToNext30() {
  const now = new Date();
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  let targetMin: number;
  if (mins < 30) {
    targetMin = 30;
  } else {
    targetMin = 60;
  }
  const minutesLeft = targetMin - 1 - mins;
  const secondsLeft = 59 - secs;
  return minutesLeft * 60 + secondsLeft;
}

export function LeaderboardPrizeCountdown({
  totalPlayers,
  top3,
  title = "Leaderboard Prize (every 30 min)",
  description = "Top 3 players receive credits every 30 minutes",
  accentColor = "text-yellow-400",
}: LeaderboardPrizeCountdownProps) {
  const [totalSeconds, setTotalSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      setTotalSeconds(getSecondsToNext30());
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const multipliers = [3, 2, 1];
  // Prizes are 10% of player count, halved per run (runs 2x/hour)
  const prizeMultiplier = 0.05;
  const medalColors = [
    "text-yellow-400",
    "text-gray-300",
    "text-amber-600",
  ];
  const medalLabels = ["🥇", "🥈", "🥉"];

  const prizes = multipliers.map((mult, i) => ({
    position: i + 1,
    multiplier: mult,
    prize: Math.round(mult * totalPlayers * prizeMultiplier),
    username: top3[i]?.username ?? "—",
    medalColor: medalColors[i],
    medal: medalLabels[i],
  }));

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div className="rounded-xl bg-gradient-to-br from-yellow-900/20 to-amber-900/20 border border-yellow-500/20 p-4 sm:p-5 space-y-4">
      {/* Header with countdown */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gift className={`h-5 w-5 ${accentColor}`} />
          <h3 className={`text-sm sm:text-base font-semibold ${accentColor}`}>
            {title}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-yellow-500/20">
          <Clock className="h-3.5 w-3.5 text-yellow-400" />
          <span className="font-mono font-bold text-white text-sm">
            {pad(minutes)}:{pad(seconds)}
          </span>
        </div>
      </div>

      {/* Prize breakdown */}
      <div className="space-y-2">
        {prizes.map((p) => (
          <div
            key={p.position}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-gray-900/40 border border-gray-800/50"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base shrink-0">{p.medal}</span>
              <span className="text-sm text-gray-300 truncate">
                {p.username}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-gray-500">
                {p.multiplier}× {totalPlayers} × 0.05
              </span>
              <span className="text-xs text-gray-500">=</span>
              <span className={`font-mono font-bold text-sm ${p.medalColor}`}>
                +{p.prize}¢
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer info */}
      <p className="text-[10px] sm:text-xs text-gray-500 text-center">
        {description} based on{" "}
        <span className="text-gray-400 font-medium">{totalPlayers}</span> total
        players
      </p>
    </div>
  );
}
