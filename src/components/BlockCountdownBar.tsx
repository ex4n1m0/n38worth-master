"use client";

import { useEffect, useRef, useState } from "react";

interface BlockCountdownBarProps {
  /** ISO string / Date for when the sell block ends. */
  blockSellUntil: string | Date | null | undefined;
  /** Optional extra classes for the bar wrapper (e.g. sizing/margins). */
  className?: string;
}

/**
 * Minimalist sell-block countdown bar. Renders ONLY a thin progress bar (no
 * timer text) that depletes as the block's remaining time runs out.
 *
 * There is no stored block-start, so the total window is captured the first
 * time the bar is shown for a given `blockSellUntil` value and persisted in
 * sessionStorage so it stays stable across re-mounts/refreshes in a session.
 */
export function BlockCountdownBar({ blockSellUntil, className }: BlockCountdownBarProps) {
  const endMs = blockSellUntil ? new Date(blockSellUntil).getTime() : 0;
  const [pct, setPct] = useState(100);
  const totalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!endMs) return;

    const key = `block-bar-total:${endMs}`;
    if (totalRef.current == null) {
      const stored = typeof window !== "undefined" ? sessionStorage.getItem(key) : null;
      if (stored) {
        totalRef.current = Number(stored);
      } else {
        totalRef.current = Math.max(1, endMs - Date.now());
        if (typeof window !== "undefined") sessionStorage.setItem(key, String(totalRef.current));
      }
    }

    const update = () => {
      const remaining = Math.max(0, endMs - Date.now());
      const total = totalRef.current || remaining || 1;
      setPct(Math.max(0, Math.min(100, (remaining / total) * 100)));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endMs]);

  if (!endMs || endMs <= Date.now()) return null;

  return (
    <div className={`w-full h-1 rounded-full overflow-hidden bg-amber-500/15 ${className ?? ""}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 transition-[width] duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
