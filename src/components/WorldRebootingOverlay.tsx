"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getPusherClient } from "@/lib/pusher-client";

/**
 * Full-screen "World is Rebooting" overlay.
 *
 * Triggered by a Pusher "world-rebooting" event on the "game-global" channel.
 * Covers the entire screen with solid black, shows "The World is Rebooting"
 * message and a progress bar that animates from 0% to 100% over 60 seconds.
 *
 * Rendered via a portal to document.body so it escapes any parent stacking
 * contexts (e.g. the Navbar's sticky z-50) and truly sits on top of everything.
 *
 * The progress bar ALWAYS runs the full 60 seconds regardless of when the
 * server-side reset completes. When the bar reaches 100%, the overlay fades
 * out and the player is back in the game.
 */
export function WorldRebootingOverlay() {
  const [active, setActive] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const startRef = useRef<number>(0);
  const DURATION_MS = 60 * 1000; // 1 minute

  useEffect(() => setMounted(true), []);

  // Dismiss the overlay (fade out then unmount)
  const dismiss = () => {
    setFadingOut(true);
    setTimeout(() => {
      setActive(false);
      setFadingOut(false);
      setProgress(0);
      setWinnerName(null);
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
      startRef.current = Date.now();
      setActive(true);
    };

    // game-won just confirms the reset is done, but we DON'T dismiss here.
    // The progress bar runs the full 60s for the visual experience.
    const handleGameWon = (data: { winnerUsername?: string }) => {
      if (data.winnerUsername) setWinnerName(data.winnerUsername);
    };

    channel.bind("world-rebooting", handleRebooting);
    channel.bind("game-won", handleGameWon);

    return () => {
      channel.unbind("world-rebooting", handleRebooting);
      channel.unbind("game-won", handleGameWon);
    };
  }, []);

  // Animate the progress bar over exactly 60 seconds, then dismiss
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        // Hold at 100% for 1 second, then fade out
        setTimeout(dismiss, 1000);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [active]);

  if (!mounted || !active) return null;

  // Portal to document.body — escapes all parent stacking contexts
  return createPortal(
    <div
      className={`fixed inset-0 z-[2147483647] bg-black flex flex-col items-center justify-center transition-opacity duration-600 ${
        fadingOut ? "opacity-0" : "opacity-100"
      }`}
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
    >
      {/* Subtle radial glow that grows with progress */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 60% 40% at center, rgba(34,211,238,${0.03 + (progress / 100) * 0.1}) 0%, transparent 70%)`,
        }}
      />

      {/* Title */}
      <div className="relative text-center px-4 mb-10">
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
              transition: "width 50ms linear",
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
    </div>,
    document.body
  );
}
