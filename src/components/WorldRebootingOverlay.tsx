"use client";

import { useState, useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusher-client";

/**
 * Full-screen "World is Rebooting" overlay.
 *
 * Triggered by a Pusher "world-rebooting" event on the "game-global" channel.
 * Shows a black screen with "The World is Rebooting" message and a progress
 * bar that animates from 0% to 100% over a fixed duration (default 60 seconds).
 *
 * When the progress bar reaches 100%, or when "game-won" arrives, the page
 * reloads to show the fresh game state.
 */
export function WorldRebootingOverlay() {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const startRef = useRef<number>(0);
  const DURATION_MS = 60 * 1000; // 1 minute

  // Set up Pusher listeners once on mount
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe("game-global");

    const handleRebooting = (data: { winnerUsername?: string }) => {
      setWinnerName(data.winnerUsername ?? null);
      setProgress(0);
      startRef.current = Date.now();
      setActive(true);
    };

    const handleGameWon = (data: { winnerUsername?: string }) => {
      setWinnerName(data.winnerUsername ?? null);
      setActive(true);
      setProgress(100);
      // Reload after a short delay to show 100%
      setTimeout(() => {
        window.location.href = "/my-profile";
      }, 2000);
    };

    channel.bind("world-rebooting", handleRebooting);
    channel.bind("game-won", handleGameWon);

    return () => {
      channel.unbind("world-rebooting", handleRebooting);
      channel.unbind("game-won", handleGameWon);
    };
  }, []);

  // Animate the progress bar
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        // Safety: if game-won hasn't arrived yet, reload after 5s
        setTimeout(() => {
          window.location.href = "/my-profile";
        }, 5000);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [active]);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center">
      {/* Message on top */}
      <div className="absolute top-[20%] left-0 right-0 text-center px-4">
        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-wider mb-2">
          The World is Rebooting
        </h1>
        {winnerName && (
          <p className="text-lg sm:text-xl text-gray-400 mt-3">
            {winnerName} collected all 6 Goddesses
          </p>
        )}
      </div>

      {/* Progress bar in the middle */}
      <div className="w-[60%] max-w-md flex flex-col items-center gap-3">
        <div className="w-full h-3 rounded-full bg-gray-800 overflow-hidden border border-gray-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-cyan-400 to-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.6)] transition-all duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-mono text-gray-500 tabular-nums">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Bottom message */}
      <div className="absolute bottom-[15%] left-0 right-0 text-center px-4">
        <p className="text-sm text-gray-600 animate-pulse">
          Preparing a fresh start for everyone...
        </p>
      </div>
    </div>
  );
}
