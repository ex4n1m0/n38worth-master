"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared 1-second clock. Many components (every PlayerCard shows a block
 * countdown) used to run their own setInterval — with 50+ cards on screen
 * that meant 50+ intervals and re-render chains per second. This hook backs
 * all of them with a single module-level interval that only runs while at
 * least one component is subscribed.
 */
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!interval) {
    interval = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

const getSnapshot = () => now;
const getServerSnapshot = () => now;

/** Current time in ms, ticking once per second (shared across all callers). */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
