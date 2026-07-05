"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { usePlayerEvents } from "@/hooks/usePlayerEvents";
import { usePoachFallback } from "@/hooks/usePoachFallback";
import { AccountResetNotification } from "@/components/AccountResetNotification";
import { OnboardingProfessionStep } from "@/components/OnboardingProfessionStep";
import { useOnboarding } from "@/components/OnboardingContext";
import { PoachEffect } from "@/components/PoachEffect";
// import { MultiAccountNotification } from "@/components/MultiAccountNotification";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const { state: onboarding } = useOnboarding();

  // Subscribe to real-time events (Pusher), with a polling fallback so the
  // POACHED effect still fires when Pusher is unconfigured or disconnected.
  usePlayerEvents(session?.user?.id);
  usePoachFallback(session?.user?.id);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-pulse text-t1-400 text-lg">Loading...</div>
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
        src="/endgame.png"
        alt=""
        className="fixed inset-0 h-full w-full object-cover object-top pointer-events-none"
      />
      <div className="fixed inset-0 bg-black/90 pointer-events-none" />
      <div className="relative z-10">
      <PoachEffect />
      <Navbar />
      <main className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-hidden">
        <AccountResetNotification />
        {/* <MultiAccountNotification /> */}
        {children}
      </main>
      {/* Onboarding: Profession Selection Overlay — shown after avatar upload, before NPC hiring */}
      <OnboardingProfessionStep />
      {/* Radio Player - hidden during onboarding to keep the flow simple */}
      {onboarding.onboardingComplete && (
        <div className="px-4 pb-20 sm:pb-16">
          <div className="max-w-7xl mx-auto bg-black rounded-lg p-2">
            <iframe 
              src="https://tunein.com/embed/player/s306579/?background=dark" 
              style={{width:'100%', height:'100px', colorScheme: 'dark'}} 
              scrolling="no" 
              frameBorder="no"
            ></iframe>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}