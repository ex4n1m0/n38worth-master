"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Mainframe City feature flag (game_settings "city_enabled" via the public,
 * CDN-cached /api/city/enabled route). Default OFF while loading so the
 * navbar link and /city page stay hidden until the flag resolves true.
 *
 * No refetchInterval — the flag flips rarely and the endpoint is CDN-cached
 * (s-maxage=60), so window-focus/remount refreshes are cheap enough.
 */
export function useCityEnabled() {
  const query = useQuery({
    queryKey: ["city-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/city/enabled");
      if (!res.ok) throw new Error("Failed to fetch city flag");
      return (await res.json()) as { enabled: boolean };
    },
    staleTime: 300_000,
  });

  return {
    cityEnabled: query.data?.enabled === true,
    cityEnabledLoading: query.isPending,
  };
}
