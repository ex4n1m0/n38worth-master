"use client";

import { useQuery } from "@tanstack/react-query";

export function useCredits() {
  return useQuery({
    queryKey: ["credits"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch credits");
      const data = await res.json();
      return typeof data.credits === "number" ? data.credits : Number(data.credits) || 0;
    },
    staleTime: 60 * 1000,
    // Slow fallback poll — Pusher events (credits-updated, purchased,
    // portfolio-reward, rank-bonus, boss-tax) invalidate this key instantly.
    refetchInterval: 600 * 1000,
  });
}
