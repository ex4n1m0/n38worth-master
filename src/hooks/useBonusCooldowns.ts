"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface BonusCooldown {
  endsAt: number; // epoch SECONDS (0 = never used)
  onCooldown: boolean;
}

interface BonusCooldownsData {
  cooldownMs: number;
  massHire: BonusCooldown;
  slots: BonusCooldown;
  reveal: BonusCooldown;
}

/**
 * Cooldown state for the three pinned bonus cards. All three cards share the
 * `["bonus-cooldowns"]` query so the market page makes ONE request for all of
 * them; each card invalidates the key after a successful use.
 */
export function useBonusCooldowns() {
  return useQuery<BonusCooldownsData>({
    queryKey: ["bonus-cooldowns"],
    queryFn: async () => {
      const res = await fetch("/api/game/bonus-cooldowns");
      if (!res.ok) throw new Error("Failed to fetch cooldowns");
      return res.json();
    },
    staleTime: 10 * 1000,
  });
}

/**
 * Live countdown for a single bonus card. Ticks locally every second (no
 * polling) and returns the remaining time plus a 100→0% progress value.
 */
export function useBonusCooldown(card: "massHire" | "slots" | "reveal") {
  const { data } = useBonusCooldowns();
  const endsAtSec = data?.[card]?.endsAt ?? 0;
  const cooldownMs = data?.cooldownMs ?? 10 * 60 * 1000;

  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const tick = () => setRemainingMs(Math.max(0, endsAtSec * 1000 - Date.now()));
    tick();
    if (!endsAtSec || endsAtSec * 1000 <= Date.now()) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAtSec]);

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);

  return {
    onCooldown: remainingMs > 0,
    remainingMs,
    /** "9m 05s" */
    label: `${mins}m ${String(secs).padStart(2, "0")}s`,
    /** 100% right after use, depleting to 0% when ready. */
    pct: Math.min(100, (remainingMs / cooldownMs) * 100),
  };
}

/** Refreshes cooldowns for all bonus cards (call after a successful use). */
export function useRefreshBonusCooldowns() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["bonus-cooldowns"] });
}
