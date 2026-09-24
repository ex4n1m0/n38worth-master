"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { getPusherClient } from "@/lib/pusher-client";
import { playSound } from "@/hooks/useSound";
import { MatrixRain } from "@/components/MatrixRain";
import { useLanguage } from "@/components/LanguageContext";

/**
 * Full-screen "Simulation is Rebooting" overlay.
 *
 * Can be triggered by:
 * 1. Pusher "world-rebooting" event (received by all connected clients)
 * 2. Direct call via `triggerWorldReboot()` (used by the test reset button
 *    to guarantee the overlay shows even if the Pusher event is missed)
 *
 * Covers the entire screen with solid black, shows "The Simulation is Rebooting"
 * message and a progress bar that animates from 0% to 100% over 60 seconds.
 * Rendered via a portal to document.body so it escapes all stacking contexts.
 */

// Global trigger so any component can activate the overlay without props
let _activate: ((winnerName?: string) => void) | null = null;
export function triggerWorldReboot(winnerName?: string) {
  _activate?.(winnerName);
}

const DURATION_MS = 10 * 1000; // 10 seconds

export function WorldRebootingOverlay() {
  const { t } = useLanguage();
  const [active, setActive] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);
  const [winnerName, setWinnerName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => setMounted(true), []);

  const activate = (name?: string) => {
    playSound("win");
    if (name) setWinnerName(name);
    setProgress(0);
    setFadingOut(false);
    startRef.current = Date.now();
    setActive(true);
  };

  // Register the global trigger
  useEffect(() => {
    _activate = activate;
    return () => { _activate = null; };
  }, []);

  const dismiss = () => {
    setFadingOut(true);
    setTimeout(() => {
      setActive(false);
      setFadingOut(false);
      setProgress(0);
      setWinnerName(null);
    }, 600);
  };

  // Pusher listeners
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;

    const channel = pusher.subscribe("game-global");

    channel.bind("world-rebooting", (data: { winnerUsername?: string }) => {
      activate(data.winnerUsername);
    });

    channel.bind("game-won", (data: { winnerUsername?: string }) => {
      if (data.winnerUsername) setWinnerName(data.winnerUsername);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe("game-global");
    };
  }, []);

  // Animate progress bar over 60 seconds
  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(100, (elapsed / DURATION_MS) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(dismiss, 1000);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [active]);

  if (!mounted || !active) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 2147483647,
        backgroundColor: "#000",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: fadingOut ? 0 : 1,
        transition: "opacity 600ms ease-out",
      }}
    >
      {/* Full-screen background image */}
      <img
        src="/reboot.webp"
        alt={t.rebootOverlayAlt}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
        }}
      />

      {/* Dark overlay on top of the image for readability */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      />

      {/* Code rain over the backdrop */}
      <MatrixRain opacity={0.28} />

      {/* Title */}
      <div style={{ position: "relative", textAlign: "center", padding: "0 1rem", marginBottom: "2.5rem" }}>
        <h1 style={{
          fontSize: "clamp(1.5rem, 5vw, 2.5rem)",
          fontWeight: 900,
          color: "#fff",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          margin: 0,
          textShadow: "0 2px 10px rgba(0,0,0,0.8)",
        }}>
          {t.rebootTitle}
        </h1>
        {winnerName && (
          <p style={{
            fontSize: "clamp(0.875rem, 2vw, 1.125rem)",
            color: "#d1d5db",
            marginTop: "1rem",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}>
            {t.rebootWinnerLine.replace("{name}", winnerName)}
          </p>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ position: "relative", width: "70%", maxWidth: "32rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
        <div style={{
          width: "100%",
          height: "8px",
          borderRadius: "9999px",
          backgroundColor: "rgba(255,255,255,0.15)",
          overflow: "hidden",
        }}>
          <div
            style={{
              height: "100%",
              borderRadius: "9999px",
              background: "linear-gradient(to right, #00aa33, #00ff41)",
              boxShadow: "0 0 15px rgba(0,255,65,0.7)",
              width: `${progress}%`,
              transition: "width 50ms linear",
            }}
          />
        </div>
        <span style={{
          fontSize: "0.75rem",
          fontFamily: "monospace",
          color: "#9ca3af",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "0.1em",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        }}>
          {Math.round(progress)}%
        </span>
      </div>

      {/* Bottom hint */}
      <div style={{ position: "absolute", bottom: "12%", left: 0, right: 0, textAlign: "center", padding: "0 1rem" }}>
        <p style={{ fontSize: "0.75rem", color: "#9ca3af", animation: "pulse 2s infinite", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
          {t.rebootPreparing}
        </p>
      </div>
    </div>,
    document.body
  );
}
