"use client";

/**
 * useAutopilot — mounts the autopilot turn loop for the logged-in player.
 *
 * Timer discipline: ONE module-level timer chain (useNow precedent) so
 * remounts never stack loops, plus a localStorage leader lock so multiple
 * open tabs don't double-play (a tab becomes leader when the lock heartbeat
 * goes stale). The timer only fires while armed AND configured; the server
 * rate guard is the backstop, not the primary pacer.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAutopilotStore } from "@/lib/autopilot/store";
import { AUTOPILOT_INVALIDATE_KEYS, runAutopilotTurn } from "@/lib/autopilot/loop";
const LEADER_KEY = "n38-autopilot-leader";
const LEADER_TTL_MS = 15_000;
const HEARTBEAT_MS = 5_000;

let timerId: ReturnType<typeof setTimeout> | null = null;
let tabId = "";

function ensureTabId(): string {
  if (!tabId) {
    tabId = `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return tabId;
}

interface LeaderLock {
  id: string;
  ts: number;
}

function readLeader(): LeaderLock | null {
  try {
    const raw = localStorage.getItem(LEADER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LeaderLock;
    return parsed && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function heartbeatLeader(): boolean {
  const now = Date.now();
  const current = readLeader();
  if (!current || current.id === ensureTabId() || now - current.ts > LEADER_TTL_MS) {
    try {
      localStorage.setItem(LEADER_KEY, JSON.stringify({ id: ensureTabId(), ts: now } satisfies LeaderLock));
    } catch {
      // Storage unavailable — run anyway; the server guard bounds damage.
    }
    return true;
  }
  return false;
}

/** Feature flag: public, CDN-cached (city:flag pattern; missing row = OFF). */
export function useAutopilotEnabled() {
  const query = useQuery({
    queryKey: ["autopilot-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/autopilot/enabled");
      if (!res.ok) throw new Error("Failed to fetch autopilot flag");
      return (await res.json()) as { enabled: boolean };
    },
    staleTime: 300_000,
  });
  return { autopilotEnabled: query.data?.enabled === true, autopilotEnabledLoading: query.isPending };
}

export interface UseAutopilotOptions {
  username?: string | null;
  enabled?: boolean; // feature flag resolved by the caller
}

export function useAutopilot({ username, enabled }: UseAutopilotOptions) {
  const queryClient = useQueryClient();
  const armed = useAutopilotStore((s) => s.armed);
  const cadenceMin = useAutopilotStore((s) => s.config.cadenceMin);
  const usernameRef = useRef(username);
  const queryClientRef = useRef(queryClient);

  // Refs are updated in effects (render-time ref writes are a lint violation).
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);
  useEffect(() => {
    queryClientRef.current = queryClient;
  }, [queryClient]);

  useEffect(() => {
    if (!enabled || !armed || !username) {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      return;
    }

    let disposed = false;

    const invalidate = () => {
      const qc = queryClientRef.current;
      for (const key of AUTOPILOT_INVALIDATE_KEYS) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    };

    const scheduleNext = (delayMs: number) => {
      if (disposed) return;
      timerId = setTimeout(runCycle, delayMs);
    };

    const runCycle = () => {
      if (disposed) return;
      if (!heartbeatLeader()) {
        // Another tab owns the loop this round — just reschedule.
        scheduleNext(Math.max(60_000, cadenceMin * 60_000));
        return;
      }
      const name = usernameRef.current;
      if (!name) {
        scheduleNext(60_000);
        return;
      }
      void runAutopilotTurn({
        username: name,
        onAction: invalidate,
        shouldStop: () => disposed,
      }).finally(() => {
        // Turn may take up to ~75 s (6 actions × 10–13 s pacing).
        scheduleNext(Math.max(60_000, cadenceMin * 60_000));
      });
    };

    // First turn shortly after arming, then on cadence.
    scheduleNext(3_000);

    // Leader heartbeat between turns (keeps our lock fresh, steals stale ones).
    const beat = setInterval(() => heartbeatLeader(), HEARTBEAT_MS);

    return () => {
      disposed = true;
      clearInterval(beat);
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };
  }, [armed, enabled, username, cadenceMin]);
}
