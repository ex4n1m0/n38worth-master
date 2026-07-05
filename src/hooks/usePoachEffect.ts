"use client";

import { create } from "zustand";

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
  trigger: (e) => set((s) => ({ event: { ...e, id: ++counter }, bumpKey: s.bumpKey + 1 })),
  clear: () => set({ event: null }),
}));
