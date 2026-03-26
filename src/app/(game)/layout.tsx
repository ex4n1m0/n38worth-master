"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { GlobalInfoBar } from "@/components/GlobalInfoBar";
import { usePlayerEvents } from "@/hooks/usePlayerEvents";
import { AccountResetNotification } from "@/components/AccountResetNotification";

export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();

  // Subscribe to real-time events
  usePlayerEvents(session?.user?.id);

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
    <div className="min-h-screen bg-gray-950 overflow-x-hidden">
      <GlobalInfoBar />
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8 overflow-x-hidden">
        <AccountResetNotification />
        {children}
      </main>
    </div>
  );
}
