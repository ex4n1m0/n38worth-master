"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { usePlayerValue } from "@/hooks/usePlayerValue";
import { Coins, Loader2, TrendingUp } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { OwnershipLimit, BuySlotsButton } from "./OwnershipLimit";
import { ChatNotificationBell } from "./ChatNotificationBell";
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
  Crown,
  Search,
  Swords,
  Trophy,
  Medal,
} from "lucide-react";
import { useEffect } from "react";
import { useThemeColor } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";

const mainNavLinks = [
  { href: "/my-profile", label: "My Profile", icon: Users },
  { href: "/leaderboard", label: "Network", icon: Search },
  { href: "/my-players", label: "My Team", icon: Swords },
  { href: "/my-owners", label: "My Boss", icon: Crown },
  { href: "/ranks", label: "Ranks", icon: Trophy },
  { href: "/hall-of-fame", label: "End Game", icon: Medal },
];

const primaryNavLinks = mainNavLinks.slice(0, 3); // My Profile, Network, My Team
const secondaryNavLinks = mainNavLinks.slice(3);   // My Boss, Ranks, End Game

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useThemeColor();
  // Hardcode green as the only theme
  useEffect(() => { setTheme("green"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { t } = useLanguage();
  const { play } = useSound();
  const { state: onboarding } = useOnboarding();
  const { data: credits, isLoading: creditsLoading } = useCredits();
  const { data: playerValue, isLoading: playerValueLoading } = usePlayerValue();

  // Filter nav links based on onboarding state
  const getVisiblePrimary = () => {
    if (onboarding.onboardingComplete) return primaryNavLinks;
    if (onboarding.avatarCompleted) return primaryNavLinks.filter((l) => l.href === "/my-profile" || l.href === "/leaderboard");
    return primaryNavLinks.filter((l) => l.href === "/my-profile");
  };

  const getVisibleSecondary = () => {
    if (onboarding.onboardingComplete) return secondaryNavLinks;
    return [];
  };

  const visiblePrimary = getVisiblePrimary();
  const visibleSecondary = getVisibleSecondary();
  const allVisibleLinks = [...visiblePrimary, ...visibleSecondary];

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (href === "/my-profile" && session?.user?.name && pathname === `/players/${session.user.name}`) return true;
    return false;
  };

  // Redirect if current page is locked
  useEffect(() => {
    if (!session) return;
    const allowedPaths = allVisibleLinks.map((l) => l.href);
    const isCurrentPathAllowed = allowedPaths.some(
      (p) => pathname === p || pathname.startsWith("/players/")
    );
    if (!isCurrentPathAllowed && !pathname.startsWith("/settings") && !pathname.startsWith("/hall-of-fame")) {
      if (!onboarding.avatarCompleted) {
        router.replace(`/players/${session.user?.name}`);
      } else {
        router.replace("/leaderboard");
      }
    }
  }, [
    onboarding.avatarCompleted,
    onboarding.onboardingComplete,
    pathname,
    session,
    router,
    allVisibleLinks,
  ]);

  if (!session) return null;

  const renderNavButton = (link: typeof mainNavLinks[0]) => {
    const active = isActive(link.href);
    const isMarketOnboarding =
      link.href === "/leaderboard" &&
      onboarding.avatarCompleted &&
      !onboarding.onboardingComplete;

    const textStyle: React.CSSProperties = {
      fontSize: "clamp(0.85rem, 1.8vw, 1.5rem)",
    };

    const btnContent = isMarketOnboarding ? (
      <span className="relative flex items-center justify-center gap-2 font-bold animate-pulse cursor-pointer text-yellow-300 drop-shadow-lg" style={textStyle}>
        <link.icon className="h-[1.2em] w-[1.2em] shrink-0" />
        🎯 Network
      </span>
    ) : (
      <span
        className={`relative flex items-center justify-center gap-2 font-bold drop-shadow-lg transition-all hover:brightness-125 ${
          active ? "!text-cyan-400 brightness-125 drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" : "text-white brightness-50"
        }`}
        style={textStyle}
      >
        <link.icon className={`h-[1.2em] w-[1.2em] shrink-0 ${active ? "text-cyan-400 brightness-125" : "brightness-50"}`} />
        <span className={active ? "!text-cyan-400" : "brightness-50"}>{link.label}</span>
      </span>
    );

    return (
      <Link key={link.href} href={link.href} onClick={() => play("changepage")} className="flex-1">
        {/* Aspect-ratio box locked to navbar.png dimensions: 1569×510 */}
        <div className="relative w-full" style={{ aspectRatio: "1569 / 510" }}>
          <img src="/navbar.png" alt="" className="absolute inset-0 w-full h-full pointer-events-none select-none" aria-hidden="true" />
          <div className="absolute inset-0 flex items-center justify-center px-4">
            {btnContent}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <>
      {/* Top Navbar — two rows of nav buttons + right-side controls spanning full height */}
      <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-stretch">

            {/* Left: two rows of nav buttons, no logo */}
            <div className="hidden md:flex flex-col flex-1 py-2 gap-1">
              {/* Row 1: primary links */}
              <div className="flex gap-2">
                {visiblePrimary.map((link) => renderNavButton(link))}
              </div>
              {/* Row 2: secondary links */}
              {visibleSecondary.length > 0 && (
                <div className="flex gap-2">
                  {visibleSecondary.map((link) => renderNavButton(link))}
                </div>
              )}
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
            <div className="flex items-stretch pl-4 py-2 border-l border-gray-800/60 ml-4 gap-3">
              {/* Left sub-column: slots+bell top, buy-slots full bottom */}
              <div className="flex flex-col gap-1 h-full">
                {/* Top: slots counter + bell side by side */}
                <div className="flex items-center gap-1 shrink-0">
                  <OwnershipLimit hideButton />
                  <ChatNotificationBell className="shrink-0" />
                </div>
                {/* Bottom: buy slots full width */}
                <div className="flex-1">
                  <BuySlotsButton />
                </div>
              </div>

              {/* Right sub-column: avatar centered */}
              <div className="flex items-center justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-20 w-20 rounded-full p-0">
                    <Avatar className="h-20 w-20">
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

      {/* Credits + Player Value Bar */}
      <div className="sticky top-[136px] z-40 border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4 py-1.5">
            <div className="flex items-center gap-2">
              <Coins className="h-[1.2em] w-[1.2em] text-t1-400 shrink-0" style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.5rem)" }} />
              <span className="text-gray-500 text-xs">My Credits</span>
              {creditsLoading ? (
                <Loader2 className="h-[1.2em] w-[1.2em] animate-spin text-t1-400" />
              ) : (
                <span className="font-mono font-bold text-t1-400" style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.5rem)" }}>
                  {formatNumber(Number((credits ?? 0).toFixed(2)))}¢
                </span>
              )}
            </div>
            <div className="w-px h-4 bg-gray-700" />
            <div className="flex items-center gap-2">
              <TrendingUp className="h-[1.2em] w-[1.2em] text-t1-400 shrink-0" style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.5rem)" }} />
              <span className="text-gray-500 text-xs">My Value</span>
              {playerValueLoading ? (
                <Loader2 className="h-[1.2em] w-[1.2em] animate-spin text-t1-400" />
              ) : (
                <span className="font-mono font-bold text-t1-400" style={{ fontSize: "clamp(0.85rem, 1.8vw, 1.5rem)" }}>
                  {formatNumber(playerValue ?? 0)}¢
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950/95 backdrop-blur-xl safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {allVisibleLinks.map((link) => {
            const active = isActive(link.href);
            const isMarketOnboarding =
              link.href === "/leaderboard" &&
              onboarding.avatarCompleted &&
              !onboarding.onboardingComplete;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => play("changepage")}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg transition-all ${
                  isMarketOnboarding
                    ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-black font-bold shadow-lg shadow-yellow-500/30 animate-pulse"
                    : active
                      ? "text-cyan-400 brightness-125"
                      : "text-gray-500 brightness-50 active:text-gray-300"
                }`}
              >
                <link.icon className={`h-4 w-4 ${isMarketOnboarding ? "text-black" : active ? "text-cyan-400 brightness-125" : "brightness-50"}`} />
                <span className={`text-[9px] font-medium leading-tight ${isMarketOnboarding ? "text-black" : active ? "text-cyan-400 brightness-125" : "brightness-50"}`}>
                  {isMarketOnboarding ? "🎯 Network" : link.label}
                </span>
                {active && !isMarketOnboarding && (
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
