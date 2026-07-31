"use client";

import { create } from "zustand";

export interface PendingProfession {
  targetId: number;
  targetUsername: string;
}

interface ForcedProfessionState {
  /** NPCs the player just hired that still need their (forced) first profession. */
  queue: PendingProfession[];
  require: (p: PendingProfession) => void;
  /** Removes the head of the queue after a successful assignment. */
  complete: () => void;
}

/**
 * Drives the forced profession-selection modal that pops up the instant a
 * player GETs an NPC with no profession. Fed from the purchase success
 * handlers (needsProfession flag on /api/game/purchase), consumed by the
 * global <ForcedProfessionAssignment /> mounted in the game layout. A queue
 * (not a single slot) so rapid consecutive GETs each get their turn.
 */
export const useForcedProfessionStore = create<ForcedProfessionState>((set) => ({
  queue: [],
  require: (p) =>
    set((s) =>
      s.queue.some((q) => q.targetId === p.targetId)
        ? s
        : { queue: [...s.queue, p] }
    ),
  complete: () => set((s) => ({ queue: s.queue.slice(1) })),
}));
