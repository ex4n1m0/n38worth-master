"use client";

import { useSession } from "next-auth/react";
import { redirect, usePathname } from "next/navigation";
import { useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { ComboDock } from "@/components/ComboDock";
import { usePlayerEvents } from "@/hooks/usePlayerEvents";
import { useMarketEvents } from "@/hooks/useMarketEvents";
import { useLanguage } from "@/components/LanguageContext";
import { usePoachFallback } from "@/hooks/usePoachFallback";
import { useAutopilot, useAutopilotEnabled } from "@/hooks/useAutopilot";
import { AccountResetNotification } from "@/components/AccountResetNotification";
import { OnboardingProfessionStep } from "@/components/OnboardingProfessionStep";
import { NewPlayerGuide } from "@/components/NewPlayerGuide";
import { PoachEffect } from "@/components/PoachEffect";
import { TutorialOverlay } from "@/components/TutorialOverlay";
// import { MultiAccountNotification } from "@/components/MultiAccountNotification";

/** Scrolls every game page back to the top on client-side navigation. */
function ScrollToTop() {
  const pathname = usePathname();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();

  // Subscribe to real-time events (Pusher), with a polling fallback so the
  // POACHED effect still fires when Pusher is unconfigured or disconnected.
  usePlayerEvents(session?.user?.id);
  usePoachFallback(session?.user?.id);
  // Public market channel: instant cross-player updates (see market-events.ts).
  useMarketEvents();
  // BYO-AI autopilot loop (PLAYER_AI_STUDY.md) — mounts only while the
  // feature flag is on; the loop itself checks armed + leader lock.
  const { autopilotEnabled } = useAutopilotEnabled();
  useAutopilot({ username: session?.user?.name, enabled: autopilotEnabled });

  const { t } = useLanguage();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-t1-400 text-lg">{t.loading}</div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-950 relative">
      {/* Background image with dark overlay */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/endgame.webp"
        alt=""
        className="fixed inset-0 h-full w-full object-cover object-top pointer-events-none"
      />
      <div className="fixed inset-0 bg-black/90 pointer-events-none" />
      <div className="relative z-10">
      <ScrollToTop />
      <PoachEffect />
      <Navbar />
      <main className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-bottom-nav overflow-x-hidden">
        <AccountResetNotification />
        {/* <MultiAccountNotification /> */}
        <NewPlayerGuide />
        {children}
      </main>
      {/* Onboarding: Profession Selection Overlay — shown after avatar upload, before NPC hiring */}
      <OnboardingProfessionStep />
      {/* Persistent profession-combo dock (mobile tab-bar pill / desktop corner, C to toggle) */}
      <ComboDock />
      {/* Step-by-step tutorial overlay (auto-opens once per login until finished/cancelled) */}
      <TutorialOverlay />
      </div>
    </div>
  );
}