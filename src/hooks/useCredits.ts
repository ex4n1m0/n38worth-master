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
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000,
  });
}
