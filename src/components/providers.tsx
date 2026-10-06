"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { ThemeProvider } from "./ThemeContext";
import { LanguageProvider } from "./LanguageContext";
import { OnboardingProvider } from "./OnboardingContext";
import { installDesktopFetch, isDesktopClient } from "@/lib/desktop-client";
import { DesktopSessionProvider } from "@/lib/session-compat";

export function Providers({ children }: { children: React.ReactNode }) {
  // The bundled Windows client rewrites /api/* fetches to the remote API and
  // authenticates with a Bearer token (see src/lib/desktop-client.ts). No-op
  // on the web build.
  const desktop = isDesktopClient();
  if (desktop) installDesktopFetch();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            // Refetch active queries when the user returns to the tab — one
            // invocation per real focus event, and it's what makes the game
            // feel live after coming back (rapid tab-flipping stays free
            // thanks to staleTime).
            refetchOnWindowFocus: true,
          },
        },
      })
  );

  const tree = (
    <ThemeProvider>
      <LanguageProvider>
        <OnboardingProvider>{children}</OnboardingProvider>
      </LanguageProvider>
    </ThemeProvider>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {desktop ? (
        <DesktopSessionProvider>{tree}</DesktopSessionProvider>
      ) : (
        <SessionProvider>{tree}</SessionProvider>
      )}
    </QueryClientProvider>
  );
}
