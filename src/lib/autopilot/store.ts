/**
 * Autopilot client state — zustand + persist.
 *
 * The API key is deliberately NOT in this persisted store: it lives under
 * its own localStorage key and is accessed only via these helpers, so the
 * persisted config blob can never leak it (and the key is never rendered
 * back into the DOM after entry).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_AUTOPILOT_CONFIG,
  type AutopilotConfig,
  type AutopilotMode,
  type AutopilotPlan,
  type AutopilotProviderId,
  type AutopilotVerb,
  type TurnLog,
} from "./types";

const KEY_STORAGE = "n38-autopilot-key";

export function getAutopilotKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setAutopilotKey(key: string): void {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private mode / storage full — the turn loop will report "no key".
  }
}

export function hasAutopilotKey(): boolean {
  return getAutopilotKey().length > 0;
}

/** Masked last-4 display, e.g. "sk-…9f2a" — never the full key. */
export function maskedAutopilotKey(): string | null {
  const key = getAutopilotKey();
  if (!key) return null;
  if (key.length <= 8) return "•••";
  return `${key.slice(0, 3)}…${key.slice(-4)}`;
}

export interface AutopilotUsage {
  day: string; // YYYY-MM-DD — usage resets daily
  turns: number;
  tokensIn: number;
  tokensOut: number;
}

export interface AutopilotAwaiting {
  plan: AutopilotPlan;
  createdAt: number;
  digest: string; // one-line summary for the chip popover
}

interface AutopilotState {
  config: AutopilotConfig;
  armed: boolean;
  running: boolean; // a turn is executing right now
  lastTurnAt: number | null;
  log: TurnLog[];
  usage: AutopilotUsage;
  awaiting: AutopilotAwaiting | null;
  lastError: string | null;

  setConfig: (patch: Partial<AutopilotConfig>) => void;
  setProvider: (provider: AutopilotProviderId) => void;
  toggleVerb: (verb: AutopilotVerb) => void;
  setMode: (mode: AutopilotMode) => void;
  setArmed: (armed: boolean) => void;
  setRunning: (running: boolean) => void;
  pushTurnLog: (entry: TurnLog) => void;
  addUsage: (tokensIn: number, tokensOut: number) => void;
  setAwaiting: (awaiting: AutopilotAwaiting | null) => void;
  setLastError: (error: string | null) => void;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const useAutopilotStore = create<AutopilotState>()(
  persist(
    (set) => ({
      config: { ...DEFAULT_AUTOPILOT_CONFIG },
      armed: false,
      running: false,
      lastTurnAt: null,
      log: [],
      usage: { day: today(), turns: 0, tokensIn: 0, tokensOut: 0 },
      awaiting: null,
      lastError: null,

      setConfig: (patch) =>
        set((s) => ({
          config: {
            ...s.config,
            ...patch,
            cadenceMin: Math.min(Math.max(Number(patch.cadenceMin ?? s.config.cadenceMin), 1), 60),
            budgetPct: Math.min(Math.max(Number(patch.budgetPct ?? s.config.budgetPct), 1), 100),
            reservePct: Math.min(Math.max(Number(patch.reservePct ?? s.config.reservePct), 0), 90),
          },
        })),

      setProvider: (provider) =>
        set((s) => ({
          config: { ...s.config, provider, baseUrl: "", model: "" },
        })),

      toggleVerb: (verb) =>
        set((s) => ({
          config: {
            ...s.config,
            verbs: s.config.verbs.includes(verb)
              ? s.config.verbs.filter((v) => v !== verb)
              : [...s.config.verbs, verb],
          },
        })),

      setMode: (mode) => set((s) => ({ config: { ...s.config, mode } })),

      setArmed: (armed) => set({ armed, lastError: armed ? null : undefined }),
      setRunning: (running) => set({ running }),

      pushTurnLog: (entry) =>
        set((s) => ({
          lastTurnAt: entry.at,
          log: [entry, ...s.log].slice(0, 10),
        })),

      addUsage: (tokensIn, tokensOut) =>
        set((s) => {
          const day = today();
          return {
            usage:
              s.usage.day === day
                ? {
                    day,
                    turns: s.usage.turns + 1,
                    tokensIn: s.usage.tokensIn + tokensIn,
                    tokensOut: s.usage.tokensOut + tokensOut,
                  }
                : { day, turns: 1, tokensIn, tokensOut },
          };
        }),

      setAwaiting: (awaiting) => set({ awaiting }),
      setLastError: (lastError) => set({ lastError }),
    }),
    {
      name: "n38-autopilot",
      partialize: (s) => ({
        config: s.config,
        armed: s.armed,
        lastTurnAt: s.lastTurnAt,
        log: s.log,
        usage: s.usage,
      }),
    }
  )
);
