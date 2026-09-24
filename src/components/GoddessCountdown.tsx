"use client";

import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Timer, Zap, Sparkles } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { toast } from "@/lib/event-feed";
import { playSound } from "@/hooks/useSound";
import { useLanguage } from "@/components/LanguageContext";

interface CountdownData {
  active: boolean;
  userId: number;
  username: string | null;
  startedAt: number;
  expiresAt: number;
  remainingSeconds: number;
  durationMinutes: number;
}

export function GoddessCountdown() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [localRemaining, setLocalRemaining] = useState<number | null>(null);

  const { data: countdown } = useQuery<CountdownData>({
    queryKey: ["goddess-countdown"],
    queryFn: async () => {
      const res = await fetch("/api/goddess-countdown");
      if (!res.ok) return { active: false, userId: 0, username: null, startedAt: 0, expiresAt: 0, remainingSeconds: 0, durationMinutes: 60 };
      return res.json();
    },
    refetchInterval: 60000, // Poll every 60 seconds (local 1s ticker keeps the countdown smooth)
    staleTime: 5000,
  });

  // Sync local timer with server data
  useEffect(() => {
    if (countdown?.active && countdown.remainingSeconds > 0) {
      setLocalRemaining(countdown.remainingSeconds);
    } else if (!countdown?.active) {
      setLocalRemaining(null);
    }
  }, [countdown]);

  // Client-side countdown tick
  useEffect(() => {
    if (localRemaining === null || localRemaining <= 0) return;

    const timer = setInterval(() => {
      setLocalRemaining((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [localRemaining]);

  // Listen for Pusher events
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe("game-global");

    channel.bind("countdown-started", (data: { username: string; userId: number; durationMinutes: number }) => {
      playSound("reveal");
      toast.info(t.goddessCountdownStartedInfo.replace("{name}", data.username), {
        description: t.goddessCountdownStartedInfoDesc.replace(
          "{minutes}",
          String(data.durationMinutes)
        ),
        duration: 15000,
      });
      queryClient.invalidateQueries({ queryKey: ["goddess-countdown"] });
    });

    channel.bind("countdown-cancelled", () => {
      playSound("sell");
      toast.success(t.goddessCountdownCancelledToast, {
        description: t.goddessCountdownCancelledToastDesc,
        duration: 10000,
      });
      setLocalRemaining(null);
      queryClient.invalidateQueries({ queryKey: ["goddess-countdown"] });
    });

    channel.bind("game-won", (data: { winnerUsername: string }) => {
      // The WorldRebootingOverlay handles the full-screen reboot experience.
      // We just clear the countdown state here — no toast (the overlay is
      // already showing the "World is Rebooting" message).
      setLocalRemaining(null);
      queryClient.invalidateQueries();
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe("game-global");
    };
  }, [queryClient, t]);

  // Don't render if no active countdown
  if (!countdown?.active || localRemaining === null || localRemaining <= 0) {
    return null;
  }

  const minutes = Math.floor(localRemaining / 60);
  const seconds = localRemaining % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  const totalDuration = (countdown.durationMinutes ?? 60) * 60;
  const progress = ((totalDuration - localRemaining) / totalDuration) * 100;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-r from-yellow-900/30 via-amber-900/20 to-red-900/30 p-5 shadow-lg shadow-yellow-500/10">
      {/* Animated background pulse */}
      <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/5 to-red-500/5 animate-pulse" />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/20 border border-yellow-500/40">
              <Cpu className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-yellow-400 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                {t.goddessCountdownActive}
              </h3>
              <p className="text-xs text-yellow-300/70">
                <span className="font-semibold text-yellow-300">{countdown.username}</span>{t.goddessCountdownOwnsAllSuffix}
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 border border-yellow-500/30">
            <Timer className="h-5 w-5 text-yellow-400 animate-pulse" />
            <span className="font-mono text-2xl font-bold text-white tracking-wider">
              {pad(minutes)}:{pad(seconds)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-gray-800/60 overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-gradient-to-r from-yellow-500 to-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Call to action */}
        <div className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-gray-300">
            <span className="text-red-400 font-semibold">{t.goddessCountdownCtaHighlight}</span>{t.goddessCountdownCtaBody}
            <span className="text-yellow-400 font-semibold">{countdown.username}</span>{t.goddessCountdownCtaSuffix}
          </p>
        </div>
      </div>
    </div>
  );
}
