"use client";

import { create } from "zustand";
import { pushGameEvent } from "@/lib/event-feed";
import { formatCompact } from "@/lib/utils";

export interface PoachEvent {
  id: number;
  amount: number;
  player: string; // the owned player that was hired away
  playerAvatar?: string | null;
  buyer: string;
}

interface PoachState {
  event: PoachEvent | null;
  /** Increments on every trigger so the navbar credits counter can "bump". */
  bumpKey: number;
  trigger: (e: Omit<PoachEvent, "id">) => void;
  clear: () => void;
}

let counter = 0;

/**
 * Drives the "POACHED!" flash effect shown when a player you OWN is hired away
 * by someone else. Fed from the `revenue-received` Pusher event in
 * `usePlayerEvents`, consumed by the global `<PoachEffect />` overlay and the
 * navbar credits counter (via `bumpKey`).
 */
export const usePoachStore = create<PoachState>((set) => ({
  event: null,
  bumpKey: 0,
  trigger: (e) => {
    // Revenue poaches (someone hired a card you own) also land in the header
    // event feed. The player === "you" case is skipped: that event already
    // notifies via the toast facade in usePlayerEvents.
    if (e.player !== "you") {
      pushGameEvent("success", `${e.buyer} hired ${e.player}`, `+${formatCompact(e.amount)}¢ revenue`);
    }
    set((s) => ({ event: { ...e, id: ++counter }, bumpKey: s.bumpKey + 1 }));
  },
  clear: () => set({ event: null }),
}));
