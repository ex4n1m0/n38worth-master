"use client";

import { create } from "zustand";
import { toast as sonnerToast } from "sonner";

export type FeedKind = "success" | "info" | "warning";

export interface FeedEvent {
  id: number;
  kind: FeedKind;
  title: string;
  description?: string;
  ts: number;
}

interface EventFeedState {
  events: FeedEvent[];
  expanded: boolean;
  push: (kind: FeedKind, title: string, description?: string) => void;
  toggleExpanded: () => void;
}

let counter = 0;
const MAX_EVENTS = 20;

/**
 * Client-side feed of recent game events (hires, sales, rewards, missions…),
 * rendered by <EventFeedBar /> inside the sticky header. This replaces
 * floating toasts for routine events: always visible, never overlays content.
 */
export const useEventFeed = create<EventFeedState>((set) => ({
  events: [],
  expanded: false,
  push: (kind, title, description) =>
    set((s) => ({
      events: [
        { id: ++counter, kind, title, description, ts: Date.now() },
        ...s.events,
      ].slice(0, MAX_EVENTS),
    })),
  toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
}));

/** Push a game event into the header feed (for non-toast sources, e.g. the poach store). */
export function pushGameEvent(kind: FeedKind, title: string, description?: string) {
  useEventFeed.getState().push(kind, title, description);
}

type Options = Record<string, unknown> & { description?: string; duration?: number };
const descOf = (o?: Options) => (typeof o?.description === "string" ? o.description : undefined);

/**
 * Drop-in replacement for sonner's `toast`: success/info/warning go to the
 * always-visible header event feed (never overlaying other information);
 * errors still float via sonner because failures demand immediate attention.
 */
export const toast = {
  success: (message: string, options?: Options) =>
    pushGameEvent("success", message, descOf(options)),
  info: (message: string, options?: Options) =>
    pushGameEvent("info", message, descOf(options)),
  warning: (message: string, options?: Options) =>
    pushGameEvent("warning", message, descOf(options)),
  error: (message: string, options?: Options) =>
    sonnerToast.error(message, options as Parameters<typeof sonnerToast.error>[1]),
};
