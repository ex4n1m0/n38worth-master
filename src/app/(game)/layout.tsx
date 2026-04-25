"use client";

import { useSession } from "next-auth/react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { GlobalInfoBar } from "@/components/GlobalInfoBar";
import { usePlayerEvents } from "@/hooks/usePlayerEvents";
import { AccountResetNotification } from "@/components/AccountResetNotification";
// import { MultiAccountNotification } from "@/components/MultiAccountNotification";

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 overflow-x-hidden">
        <AccountResetNotification />
        {/* <MultiAccountNotification /> */}
        {children}
      </main>
      {/* Radio Player - At bottom of page, persists across navigation */}
      {/* Added extra padding for mobile devices with navigation bars */}
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
    </div>
  );
}
