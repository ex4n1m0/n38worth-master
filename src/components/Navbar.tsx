"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { usePlayerValue } from "@/hooks/usePlayerValue";
import { Coins, Loader2, TrendingUp } from "lucide-react";
import { formatCompact } from "@/lib/utils";
import { OwnershipLimit } from "./OwnershipLimit";
import { ChatNotificationBell } from "./ChatNotificationBell";

import { GlobalInfoBar } from "./GlobalInfoBar";
import { MissionProgress } from "./MissionProgress";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Users,
  Settings,
  LogOut,
  Search,
  Medal,
  History,
} from "lucide-react";
import { useEffect, useState } from "react";
import { usePoachStore } from "@/hooks/usePoachEffect";
import { useThemeColor } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";

const mainNavLinks = [
  { href: "/my-profile", label: "Home", icon: Users },
  { href: "/leaderboard", label: "Market", icon: Search },
  { href: "/hall-of-fame", label: "End Game", icon: Medal },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useThemeColor();
  // Hardcode green as the only theme
  useEffect(() => { setTheme("green"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { t } = useLanguage();
  const { play } = useSound();
  const { state: onboarding, loading: onboardingLoading } = useOnboarding();
  const { data: credits, isLoading: creditsLoading } = useCredits();
  const { data: playerValue, isLoading: playerValueLoading } = usePlayerValue();
  const missionLevel = useMissionLevel();
  // Game is unlocked after completing mission 0 (Own 20 cards).
  const gameUnlocked = missionLevel >= 1;

  // Briefly "bump" the credits counter whenever a poach payday lands.
  const bumpKey = usePoachStore((s) => s.bumpKey);
  const poachEvent = usePoachStore((s) => s.event);
  const [creditsBump, setCreditsBump] = useState(false);
  useEffect(() => {
    if (bumpKey === 0) return;
    setCreditsBump(true);
    const t = setTimeout(() => setCreditsBump(false), 700);
    return () => clearTimeout(t);
  }, [bumpKey]);

  // Filter nav links based on onboarding state and game unlock.
  // - During onboarding: only Home is visible.
  // - After onboarding but before 20 cards (mission 0): Home + Market (simple).
  // - After mission 0: all links including End Game.
  const getVisibleLinks = () => {
    if (!onboarding.onboardingComplete) return mainNavLinks.filter((l) => l.href === "/my-profile");
    if (!gameUnlocked) return mainNavLinks.filter((l) => l.href !== "/hall-of-fame");
    return mainNavLinks;
  };

  const allVisibleLinks = getVisibleLinks();

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/my-profile" && session?.user?.name && pathname === `/players/${session.user.name}`) return true;
    return false;
  };

  // Redirect if current page is locked
  useEffect(() => {
    if (!session) return;
    // Wait until onboarding state has loaded. On a full page load (e.g. a hard
    // navigation to /leaderboard) the state defaults to onboardingComplete=false
    // for a moment; redirecting on that stale value bounced fully-onboarded
    // players (and demo players) from the market back to their profile.
    if (onboardingLoading) return;
    const allowedPaths = allVisibleLinks.map((l) => l.href);
    const isCurrentPathAllowed = allowedPaths.some(
      (p) => pathname === p || pathname.startsWith("/players/") || pathname === "/my-players" || pathname === "/my-owners" || pathname === "/ranks"
    );
    if (!isCurrentPathAllowed && !pathname.startsWith("/settings") && !pathname.startsWith("/hall-of-fame") && !pathname.startsWith("/history")) {
      // During onboarding (avatar OR starter-NPC step) the only legitimate
      // landing page is the user's own profile — the avatar uploader and the
      // 3 starter-NPC cards now both live there.
      if (!onboarding.onboardingComplete) {
        router.replace(`/players/${session.user?.name}`);
      } else {
        router.replace("/leaderboard");
      }
    }
  }, [
    onboarding.avatarCompleted,
    onboarding.onboardingComplete,
    onboardingLoading,
    pathname,
    session,
    router,
    allVisibleLinks,
  ]);

  if (!session) return null;

  const renderNavButton = (link: typeof mainNavLinks[0]) => {
    const active = isActive(link.href);

    const btnContent = (
      <span
        className={`relative z-10 flex items-center justify-center gap-2 text-sm sm:text-base font-semibold tracking-wide transition-colors ${
          active ? "text-cyan-300" : "text-gray-300 group-hover:text-white"
        }`}
      >
        <link.icon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
        <span>{link.label}</span>
      </span>
    );

    return (
      <Link key={link.href} href={link.href} onClick={() => play("changepage")} className="flex-1">
        {/* Fixed-height button matching slots indicator height */}
        <div
          className={`group relative w-full h-[66px] flex items-center justify-center px-4 overflow-hidden rounded-xl border transition-all duration-200 ${
            active
              ? "border-cyan-400/70 bg-gradient-to-b from-cyan-500/25 via-blue-600/15 to-transparent shadow-[0_0_18px_rgba(34,211,238,0.35)]"
              : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 hover:shadow-[0_0_12px_rgba(255,255,255,0.08)]"
          }`}
        >
          {/* subtle top sheen */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-xl" />
          {/* active bottom accent line */}
          {active && (
            <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
          )}
          {btnContent}
        </div>
      </Link>
    );
  };


  return (
    <>


      {/* Top Navbar — two rows of nav buttons + right-side controls spanning full height */}
      <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center">

            {/* Left: single row of nav buttons */}
            <div className="hidden md:flex items-center flex-1 py-2 gap-2">
              {allVisibleLinks.map((link) => renderNavButton(link))}
            </div>

            {/* Mobile: just the logo */}
            <div className="flex md:hidden items-center flex-1 py-3">
              <Link
                href="/leaderboard"
                className="text-xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent"
              >
                n38worth
              </Link>
            </div>

            {/* Right side — left sub-col (slots + bell/theme) | right sub-col (avatar centered) */}
            <div className="flex items-center pl-4 py-2 border-l border-gray-800/60 ml-4 gap-3">
              {/* Left sub-column: slots+bell top, buy-slots full bottom */}
              <div className="flex flex-col gap-1 h-full">
                {/* Top: slots counter + bell side by side */}
                <div className="flex items-center gap-1 shrink-0">
                  <OwnershipLimit />
                  <ChatNotificationBell className="shrink-0" />
                </div>
              </div>

              {/* Right sub-column: avatar centered */}
              <div className="flex items-center justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-16 w-16 rounded-full p-0">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={session.user?.image || undefined} alt={session.user?.name || ""} />
                      <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-base font-bold">
                        {session.user?.name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-gray-900 border-gray-800">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-white">{session.user?.name}</p>
                  </div>
                  <DropdownMenuSeparator className="bg-gray-800" />
                  <DropdownMenuItem asChild>
                    <Link href={`/players/${session.user?.name}`} onClick={() => play("buttons")} className="text-gray-300 cursor-pointer">
                      <Users className="h-4 w-4 mr-2" />
                      {t.myProfile}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/hall-of-fame" onClick={() => play("buttons")} className="text-yellow-400 cursor-pointer">
                      <Medal className="h-4 w-4 mr-2" />
                      End Game
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" onClick={() => play("buttons")} className="text-gray-300 cursor-pointer">
                      <Settings className="h-4 w-4 mr-2" />
                      {t.settings}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/history" onClick={() => play("buttons")} className="text-gray-300 cursor-pointer">
                      <History className="h-4 w-4 mr-2" />
                      History
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gray-800" />
                  <DropdownMenuItem
                    onClick={() => { play("buttons"); signOut({ callbackUrl: "/" }); }}
                    className="text-red-400 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    {t.signOut}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </div>

          </div>
        </div>
      </nav>

      {/* Mission Progress Bar — sticky below nav, above credits */}
      <div className="sticky top-[72px] z-40 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-xl">
        <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-1.5">
          <MissionProgress />
        </div>
      </div>

      {/* Credits + Player Value Bar */}
      <div className="sticky top-[108px] z-40 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-xl">
        <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-1.5">
            <div className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-t1-400 shrink-0" />
              <span className="text-gray-500 text-xs sm:text-sm">My Credits</span>
              {creditsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-t1-400" />
              ) : (
                <span className={`font-mono font-bold text-t1-400 ${creditsBump ? "credits-bump" : ""}`} style={{ fontSize: "clamp(0.8rem, 1.5vw, 1.15rem)" }}>
                  {formatCompact(credits ?? 0)}¢
                </span>
              )}
            </div>
            <div className="hidden sm:block w-px h-4 bg-gray-700" />
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-t1-400 shrink-0" />
              <span className="text-gray-500 text-xs sm:text-sm">My Value</span>
              {playerValueLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-t1-400" />
              ) : (
                <span className="font-mono font-bold text-t1-400" style={{ fontSize: "clamp(0.8rem, 1.5vw, 1.15rem)" }}>
                  {formatCompact(playerValue ?? 0)}¢
                </span>
              )}
            </div>

            {/* Global game stats — occupies the empty right side of this bar. */}
            <GlobalInfoBar />

          </div>
        </div>
      </div>

      {/* Poach feed — own sticky row below credits bar */}
      {poachEvent && (
        <div className="sticky top-[144px] z-39 border-b border-gray-800/40 bg-gray-950/85 backdrop-blur-xl">
          <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8">
            <div
              key={poachEvent.id}
              className="poach-pop flex items-center gap-2 sm:gap-3 py-1.5 pl-4 min-w-0 overflow-hidden"
            >
              <span className="truncate text-xs sm:text-sm font-bold text-gray-100">
                <span className="text-yellow-400">{poachEvent.buyer}</span> hired{" "}
                <span className="text-white">{poachEvent.player}</span>
              </span>
              <span
                className="poach-coins font-mono font-bold text-orange-400"
                style={{ fontSize: "clamp(0.55rem, 1vw, 0.77rem)" }}
              >
                +{formatCompact(poachEvent.amount)}¢
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950/95 backdrop-blur-xl safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {allVisibleLinks.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => play("changepage")}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg transition-all ${
                  active
                    ? "text-cyan-400 brightness-125"
                    : "text-gray-500 brightness-50 active:text-gray-300"
                }`}
              >
                <link.icon className={`h-4 w-4 ${active ? "text-cyan-400 brightness-125" : "brightness-50"}`} />
                <span className={`text-[9px] font-medium leading-tight ${active ? "text-cyan-400 brightness-125" : "brightness-50"}`}>
                  {link.label}
                </span>
                {active && (
                  <div className="absolute bottom-1 w-6 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                )}
              </Link>
            );
          })}

        </div>
      </div>
    </>
  );
}
