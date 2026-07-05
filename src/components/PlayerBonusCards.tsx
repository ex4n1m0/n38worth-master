"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Shield, Gift, Loader2, Clock } from "lucide-react";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { BlockCountdownBar } from "./BlockCountdownBar";

interface BonusCard {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  valueFloor: number;
  blockSellUntil: string | null;
  powerDescription: string;
  image: string;
}

interface PlayerBonusCardsProps {
  username: string;
}

// Calculate time until next hour
function getTimeUntilNextHour(): string {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  
  const diff = nextHour.getTime() - now.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  return `${minutes}m ${seconds}s`;
}

// Hook to get countdown to next hour (when bonus powers execute)
function useNextHourCountdown() {
  const [timeLeft, setTimeLeft] = useState<string>(getTimeUntilNextHour);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(getTimeUntilNextHour());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return timeLeft;
}

export function PlayerBonusCards({ username }: PlayerBonusCardsProps) {
  const countdown = useNextHourCountdown();
  const { data, isLoading } = useQuery<{ bonusCards: BonusCard[] }>({
    queryKey: ["player-bonus-cards", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}/bonus-cards`);
      if (!res.ok) {
        if (res.status === 404) return { bonusCards: [] };
        throw new Error("Failed to fetch bonus cards");
      }
      return res.json();
    },
    staleTime: 60 * 1000,
  });

  const bonusCards = data?.bonusCards ?? [];

  if (isLoading) {
    return (
      <Card className="bg-gray-900/50 border-white/10 p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </div>
      </Card>
    );
  }

  if (bonusCards.length === 0) {
    return null;
  }

  return (
    <Card className="bg-gradient-to-br from-purple-950/40 to-gray-900/50 border-purple-500/30 p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-amber-500/20 border border-purple-500/30">
            <Gift className="h-5 w-5 text-purple-300" />
          </div>
          <h3 className="text-lg font-bold text-white">Bonus Cards</h3>
          <span className="text-sm text-purple-300/70 font-medium">
            ({bonusCards.length} owned)
          </span>
        </div>
        {/* Next execution countdown */}
        <div className="flex items-center gap-1.5 text-xs text-amber-300/80 bg-amber-950/30 px-2.5 py-1 rounded-full border border-amber-500/20">
          <Clock className="h-3 w-3" />
          <span>Next bonus in {countdown}</span>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {bonusCards.map((card) => {
          const isGoddess = GODDESS_USERNAMES.includes(card.username);
          return (
            <div
              key={card.id}
              className={`group relative overflow-hidden rounded-xl border transition-all flex flex-col ${
                isGoddess
                  ? "border-yellow-500/50 bg-gradient-to-br from-yellow-950/60 via-amber-950/40 to-gray-900/80 hover:border-yellow-400/70 shadow-lg shadow-yellow-500/10"
                  : "border-purple-500/30 bg-gradient-to-br from-purple-950/60 to-gray-900/80 hover:border-purple-400/50"
              }`}
            >
              {/* Goddess crown badge */}
              {isGoddess && (
                <div className="absolute top-2 right-2 z-10 bg-yellow-500/90 backdrop-blur-sm rounded-full px-2 py-0.5 text-[9px] font-bold text-black uppercase tracking-wider shadow">
                  Goddess
                </div>
              )}

              {/* Card Image */}
              <div className="relative aspect-square overflow-hidden bg-gray-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image}
                  alt={card.username}
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />

                {/* Subtle gradient at bottom only for text readability */}
                <div className={`absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t ${isGoddess ? "from-yellow-950/80" : "from-purple-950/80"} to-transparent`} />

                {/* Block indicator */}
                {card.blockSellUntil && (
                  <div className="absolute top-2 left-2 bg-purple-600/90 backdrop-blur-sm rounded-full p-1.5 shadow-lg">
                    <Shield className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>

              {/* Card Content */}
              <div className="p-2 flex-1 flex flex-col">
                {/* Card Name */}
                <h4 className={`font-bold leading-tight break-words ${isGoddess ? "text-yellow-300" : "text-white"}`} style={{ fontSize: "clamp(0.75rem, 1.4vw, 1.1rem)" }}>
                  {card.username}
                </h4>

                {/* Block countdown if active */}
                {card.blockSellUntil && (
                  <div className="pt-1.5 border-t border-purple-500/20 mt-auto space-y-1">
                    <span className="text-[10px] text-purple-300/60 flex items-center gap-1">
                      <Shield className="h-2.5 w-2.5" />
                      Partnered
                    </span>
                    <BlockCountdownBar blockSellUntil={card.blockSellUntil} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
