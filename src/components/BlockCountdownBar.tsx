"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/hooks/useNow";

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
  const now = useNow();
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!endMs) return;

    const key = `block-bar-total:${endMs}`;
    const stored = sessionStorage.getItem(key);
    if (stored) {
      setTotal(Number(stored));
    } else {
      const t = Math.max(1, endMs - Date.now());
      sessionStorage.setItem(key, String(t));
      setTotal(t);
    }
  }, [endMs]);

  if (!endMs || endMs <= now) return null;

  const remaining = Math.max(0, endMs - now);
  const pct = Math.max(0, Math.min(100, (remaining / (total ?? (remaining || 1))) * 100));

  return (
    <div className={`w-full h-1 rounded-full overflow-hidden bg-amber-500/15 ${className ?? ""}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-400 transition-[width] duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
