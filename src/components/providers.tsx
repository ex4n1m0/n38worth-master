"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { ThemeProvider } from "./ThemeContext";
import { LanguageProvider } from "./LanguageContext";
import { OnboardingProvider } from "./OnboardingContext";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000, // 30 seconds
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <LanguageProvider>
            <OnboardingProvider>
              {children}
            </OnboardingProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
