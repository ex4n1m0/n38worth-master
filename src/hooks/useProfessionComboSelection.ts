"use client";

import { useCallback, useMemo } from "react";
import { create } from "zustand";
import { useSessionCompat as useSession } from "@/lib/session-compat";
import { useQuery } from "@tanstack/react-query";
import { useNow } from "@/hooks/useNow";

export interface ComboPlayer {
  playerId: number;
  username: string;
  playerValue: number;
  avatarUrl: string | null;
  isNpc: number;
  valueFloor: number;
}

interface ComboSlot {
  profession: string;
  imagePath: string;
  player: ComboPlayer | null;
}

export interface UseProfessionComboSelectionReturn {
  slots: ComboSlot[];
  selectedCount: number;
  isComplete: boolean;
  totalValue: number;
  reward: number;
  selectedPlayerIds: number[];
  isSelected: (playerId: number) => boolean;
  toggleSelection: (player: ComboPlayer, profession: string) => boolean;
  /**
   * Drops any currently-selected players whose id is NOT in `ownedIds` (e.g.
   * they were stolen since being added to the combo). Idempotent. Returns the
   * removed players so the caller can surface a notification.
   */
  removeUnowned: (ownedIds: Set<number>) => ComboPlayer[];
  clear: () => void;
}

/** Ordered professions for the 6 slots (slot N = index N-1 for the 1-6 keys). */
export const ORDERED_PROFESSIONS = [
  "Cryptographer",
  "Zero-Day",
  "Overclocker",
  "Cache Keeper",
  "Server Marshal",
  "Bot Herder",
] as const;

const PROFESSION_IMAGES: Record<string, string> = {
  "Cryptographer": "/NewCryptographer.webp",
  "Zero-Day": "/NewZeroDay.webp",
  "Overclocker": "/NewOverclocker.webp",
  "Cache Keeper": "/NewCacheKeeper.webp",
  "Server Marshal": "/NewServerMarshal.webp",
  "Bot Herder": "/NewBotHerder.webp",
};

/**
 * GLOBAL combo selection store (zustand, module-level): the selection is a
 * session object, not page state — it survives tab switches and stays in sync
 * between the ComboDock, the market grid, and any page hosting the combo bar.
 */
interface ComboStore {
  selections: Map<string, ComboPlayer>;
  toggle: (player: ComboPlayer, profession: string) => boolean;
  clear: () => void;
  removeUnowned: (ownedIds: Set<number>) => ComboPlayer[];
}

export const useComboStore = create<ComboStore>((set) => ({
  selections: new Map(),
  toggle: (player, profession) => {
    if (!ORDERED_PROFESSIONS.includes(profession as (typeof ORDERED_PROFESSIONS)[number])) {
      return false;
    }
    set((s) => {
      const next = new Map(s.selections);
      const existing = next.get(profession);
      if (existing && existing.playerId === player.playerId) {
        next.delete(profession);
      } else {
        next.set(profession, player);
      }
      return { selections: next };
    });
    return true;
  },
  clear: () => set({ selections: new Map() }),
  removeUnowned: (ownedIds) => {
    const removed: ComboPlayer[] = [];
    set((s) => {
      let changed = false;
      const next = new Map(s.selections);
      for (const [profession, player] of s.selections) {
        if (!ownedIds.has(player.playerId)) {
          next.delete(profession);
          changed = true;
          removed.push(player);
        }
      }
      return changed ? { selections: next } : s;
    });
    return removed;
  },
}));

export function useProfessionComboSelection(): UseProfessionComboSelectionReturn {
  const selections = useComboStore((s) => s.selections);

  const slots = useMemo<ComboSlot[]>(() => {
    return ORDERED_PROFESSIONS.map((profession) => ({
      profession,
      imagePath: PROFESSION_IMAGES[profession],
      player: selections.get(profession) ?? null,
    }));
  }, [selections]);

  const selectedCount = selections.size;
  const isComplete = selectedCount === 6;

  const totalValue = useMemo(() => {
    let sum = 0;
    for (const player of selections.values()) {
      sum += player.playerValue;
    }
    return sum;
  }, [selections]);

  const reward = totalValue * 10;

  const selectedPlayerIds = useMemo(() => {
    return Array.from(selections.values()).map((p) => p.playerId);
  }, [selections]);

  const isSelected = useCallback(
    (playerId: number): boolean => {
      for (const player of selections.values()) {
        if (player.playerId === playerId) return true;
      }
      return false;
    },
    [selections]
  );

  return {
    slots,
    selectedCount,
    isComplete,
    totalValue,
    reward,
    selectedPlayerIds,
    isSelected,
    toggleSelection: useComboStore.getState().toggle,
    removeUnowned: useComboStore.getState().removeUnowned,
    clear: useComboStore.getState().clear,
  };
}

/**
 * Longest remaining FIREWALL (sell-block) wait across the currently-selected
 * combo members, off the viewer's own ownership rows — powers the countdown
 * on the ComboDock pill. Shares the ["player", "me"] cache with the combo
 * bar, so it adds no extra request. 0 when nothing is firewalled.
 */
export function useComboFirewallMsLeft(): number {
  const { data: session } = useSession();
  const now = useNow();
  // Select the stable store reference and derive the ids OUTSIDE the selector
  // — returning a fresh array from the selector itself would change identity
  // on every getSnapshot call and trip useSyncExternalStore's infinite loop.
  const selections = useComboStore((s) => s.selections);
  const selectedIds = useMemo(
    () => Array.from(selections.values()).map((p) => p.playerId),
    [selections]
  );

  const { data } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session?.user?.name && selectedIds.length > 0,
    staleTime: 60_000,
    select: (player: { ownedPlayers?: { id: number; ownBlockSellUntil?: string | null }[] } | null) => {
      let max = 0;
      for (const card of player?.ownedPlayers ?? []) {
        if (!selectedIds.includes(card.id)) continue;
        const until = card.ownBlockSellUntil
          ? new Date(card.ownBlockSellUntil).getTime()
          : 0;
        if (Number.isFinite(until) && until > max) max = until;
      }
      return max;
    },
  });

  return Math.max(0, (data ?? 0) - now);
}
