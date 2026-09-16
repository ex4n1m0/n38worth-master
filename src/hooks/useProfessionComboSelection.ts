"use client";

import { useState, useCallback, useMemo } from "react";

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

/** Ordered professions for the 6 slots */
const ORDERED_PROFESSIONS = [
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

export function useProfessionComboSelection(): UseProfessionComboSelectionReturn {
  // Map of profession -> selected player
  const [selections, setSelections] = useState<Map<string, ComboPlayer>>(new Map());

  const toggleSelection = useCallback(
    (player: ComboPlayer, profession: string): boolean => {
      if (!ORDERED_PROFESSIONS.includes(profession as (typeof ORDERED_PROFESSIONS)[number])) {
        return false;
      }

      setSelections((prev) => {
        const next = new Map(prev);
        const existing = next.get(profession);

        if (existing && existing.playerId === player.playerId) {
          // Deselect this player from this profession
          next.delete(profession);
        } else {
          // Select this player for this profession
          next.set(profession, player);
        }

        return next;
      });

      return true;
    },
    []
  );

  const clear = useCallback(() => {
    setSelections(new Map());
  }, []);

  const removeUnowned = useCallback((ownedIds: Set<number>): ComboPlayer[] => {
    const removed: ComboPlayer[] = [];
    setSelections((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [profession, player] of prev) {
        if (!ownedIds.has(player.playerId)) {
          next.delete(profession);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // Compute the removed list from the latest snapshot for the caller. This is
    // read outside the updater so it is not affected by StrictMode double-invoke.
    selections.forEach((player) => {
      if (!ownedIds.has(player.playerId)) removed.push(player);
    });
    return removed;
  }, [selections]);

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
    toggleSelection,
    removeUnowned,
    clear,
  };
}