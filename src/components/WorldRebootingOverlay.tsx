"use client";

import { useState, useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusher-client";

/**
 * Full-screen "World is Rebooting" overlay.
 *
 * Triggered by a Pusher "world-rebooting" event on the "game-global" channel.
 * Covers the entire screen with solid black, shows "The World is Rebooting"
 * message and a progress bar that animates from 0% to 100% over 60 seconds.
 *
 * When the progress bar reaches 100%, the overlay disappears and the player
 * is back in the game (the reset has already happened server-side).
 *
 * If "game-won" arrives before the bar completes (reset finished faster than
 * 60s), the bar jumps to 100% and then fades out.
 */
export function WorldRebootingOverlay() {
  const [active, setActive] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const startRef = useRef<number>(0);
  const wonRef = useRef<boolean>(false);
  const DURATION_MS = 60 * 1000; // 1 minute

  // Dismiss the overlay (fade out then unmount)
  const dismiss = () => {
    setFadingOut(true);
    setTimeout(() => {
      setActive(false);
      setFadingOut(false);
      setProgress(0);
      setWinnerName(null);
      wonRef.current = false;
    }, 600);
  };

  // Set up Pusher listeners once on mount
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe("game-global");

    const handleRebooting = (data: { winnerUsername?: string }) => {
      setWinnerName(data.winnerUsername ?? null);
      setProgress(0);
      setFadingOut(false);
      wonRef.current = false;
      startRef.current = Date.now();
      setActive(true);
    };

    const handleGameWon = (data: { winnerUsername?: string }) => {
      setWinnerName(data.winnerUsername ?? null);
      wonRef.current = true;
      // Jump to 100% — the progress bar animation will pick this up
      setProgress(100);
    };

    channel.bind("world-rebooting", handleRebooting);
    channel.bind("game-won", handleGameWon);

    return () => {
      channel.unbind("world-rebooting", handleRebooting);
      channel.unbind("game-won", handleGameWon);
    };
  }, []);

  // Animate the progress bar over 60 seconds, then dismiss
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      // If game-won already arrived, we're at 100 — just dismiss
      if (wonRef.current) {
        clearInterval(interval);
        // Brief moment at 100% then dismiss
        setTimeout(dismiss, 800);
        return;
      }

      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        // Safety: if game-won hasn't arrived yet, wait up to 30s then dismiss
        setTimeout(() => {
          if (!wonRef.current) {
            // Force dismiss even without game-won
            dismiss();
          }
        }, 30000);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [active]);

  // When game-won arrives, dismiss after showing 100%
  useEffect(() => {
    if (active && wonRef.current && progress >= 100) {
      const t = setTimeout(dismiss, 800);
      return () => clearTimeout(t);
    }
  }, [active, progress]);

  if (!active) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center transition-opacity duration-500 ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Subtle radial glow behind the progress bar */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse at center, rgba(34,211,238,${0.04 + (progress / 100) * 0.08}) 0%, transparent 60%)`,
        }}
      />

      {/* Title — center top area */}
      <div className="relative text-center px-4 mb-12">
        <h1 className="text-2xl sm:text-4xl font-black text-white tracking-[0.15em] uppercase">
          The World is Rebooting
        </h1>
        {winnerName && (
          <p className="text-sm sm:text-base text-gray-500 mt-4">
            {winnerName} collected all 6 Goddesses
          </p>
        )}
      </div>

      {/* Progress bar — dead center */}
      <div className="relative w-[70%] max-w-lg flex flex-col items-center gap-4">
        <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.7)]"
            style={{
              width: `${progress}%`,
              transition: "width 100ms linear",
            }}
          />
        </div>
        <span className="text-xs font-mono text-gray-600 tabular-nums tracking-widest">
          {Math.round(progress)}%
        </span>
      </div>

      {/* Bottom hint */}
      <div className="absolute bottom-[12%] left-0 right-0 text-center px-4">
        <p className="text-xs text-gray-700 animate-pulse">
          Preparing a fresh start...
        </p>
      </div>
    </div>
  );
}
