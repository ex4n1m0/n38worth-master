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
import { ComboDockPill } from "./ComboDock";

import { GlobalInfoBar } from "./GlobalInfoBar";
import { MissionProgress } from "./MissionProgress";
import { CoachMark } from "./CoachMark";
import { EventFeedBar } from "./EventFeedBar";
import { WorldRebootingOverlay } from "./WorldRebootingOverlay";
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
  History,
  Building2,
} from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { usePoachStore } from "@/hooks/usePoachEffect";
import { useThemeColor } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useSound, useSoundSettings } from "@/hooks/useSound";
import { Volume2, VolumeX } from "lucide-react";
import { useOnboarding } from "./OnboardingContext";
import { useCityEnabled } from "@/hooks/useCityEnabled";

const mainNavLinks = [
  { href: "/my-profile", icon: Users },
  { href: "/city", icon: Building2 },
  { href: "/leaderboard", icon: Search },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme } = useThemeColor();
  // Hardcode green as the only theme
  useEffect(() => { setTheme("green"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { t } = useLanguage();
  const navLabel = (href: string) =>
    href === "/my-profile" ? t.navHome : href === "/city" ? t.navCity : t.navAvatars;
  // Mainframe City entry shows only while the feature flag is on.
  const { cityEnabled } = useCityEnabled();
  const { play } = useSound();
  const muted = useSoundSettings((s) => s.muted);
  const toggleMuted = useSoundSettings((s) => s.toggleMuted);
  const { state: onboarding, loading: onboardingLoading } = useOnboarding();
  const { data: credits, isLoading: creditsLoading } = useCredits();
  const { data: playerValue, isLoading: playerValueLoading } = usePlayerValue();
  const missionLevel = useMissionLevel();
  // Game is unlocked after completing mission 0 (Own 20 cards).
  const gameUnlocked = missionLevel >= 1;

  // Guide players to Home (profile) the first time they unlock the game by
  // reaching 20 cards — that's where the daily login reward lives. The amber
  // highlight clears once they actually navigate TO Home from another page.
  // Tracked in localStorage so it survives page refreshes.
  const [homeVisitedAfterUnlock, setHomeVisitedAfterUnlock] = useState(true);
  const prevPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHomeVisitedAfterUnlock(localStorage.getItem("home-visited-after-unlock") === "1");
  }, []);
  useEffect(() => {
    if (!gameUnlocked || typeof window === "undefined") return;
    const isHomePath =
      pathname === "/my-profile" ||
      (!!session?.user?.name && pathname === `/players/${session.user.name}`);
    // Only mark as visited when the player NAVIGATES to Home from a different
    // page — not when gameUnlocked flips to true while they're already on Home
    // (the mission-level query refetches every 60s, so the flip can happen
    // while the player is on their profile). Without this guard the highlight
    // would clear before the player ever sees it.
    const navigatedToHome =
      prevPathnameRef.current !== null &&
      prevPathnameRef.current !== pathname &&
      isHomePath;
    if (navigatedToHome && !homeVisitedAfterUnlock) {
      localStorage.setItem("home-visited-after-unlock", "1");
      setHomeVisitedAfterUnlock(true);
    }
    prevPathnameRef.current = pathname;
  }, [gameUnlocked, pathname, session?.user?.name, homeVisitedAfterUnlock]);
  const highlightHome = gameUnlocked && !homeVisitedAfterUnlock;

  // Briefly "bump" the credits counter whenever a poach payday lands.
  const bumpKey = usePoachStore((s) => s.bumpKey);
  const [creditsBump, setCreditsBump] = useState(false);
  useEffect(() => {
    if (bumpKey === 0) return;
    setCreditsBump(true);
    const t = setTimeout(() => setCreditsBump(false), 700);
    return () => clearTimeout(t);
  }, [bumpKey]);

  // Filter nav links based on onboarding state.
  // - During onboarding: only Home is visible.
  // - After onboarding: all links.
  // - /city additionally requires the city feature flag (useCityEnabled).
  const getVisibleLinks = () => {
    const links = cityEnabled
      ? mainNavLinks
      : mainNavLinks.filter((l) => l.href !== "/city");
    if (!onboarding.onboardingComplete) return links.filter((l) => l.href === "/my-profile");
    return links;
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
      (p) => pathname === p || pathname.startsWith("/players/") || pathname.startsWith("/city") || pathname === "/my-players" || pathname === "/my-owners" || pathname === "/ranks"
    );
    if (!isCurrentPathAllowed && !pathname.startsWith("/settings") && !pathname.startsWith("/history") && !pathname.startsWith("/catalog")) {
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

  const renderNavButton = (link: typeof mainNavLinks[0], highlight = false) => {
    const active = isActive(link.href);
    const label = navLabel(link.href);

    const btnContent = (
      <span
        className={`relative z-10 flex items-center justify-center gap-1.5 text-sm leading-none font-semibold tracking-wide transition-colors ${
          active
            ? "text-cyan-300"
            : highlight
              ? "text-amber-300 group-hover:text-amber-200"
              : "text-gray-300 group-hover:text-white"
        }`}
      >
        <link.icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </span>
    );

    return (
      <Link
        key={link.href}
        href={link.href}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={() => {
          if (link.href === "/leaderboard") {
            sessionStorage.removeItem("auto-navigate-cards");
          }
          play("changepage");
        }}
        className="flex-1"
      >
        {/* Fixed-height compact button matching the header row height */}
        <div
          className={`group relative w-full h-10 flex items-center justify-center px-3 overflow-hidden rounded-lg border transition-all duration-200 ${
            active
              ? "border-cyan-400/70 bg-gradient-to-b from-cyan-500/25 via-blue-600/15 to-transparent shadow-[0_0_18px_rgba(34,211,238,0.35)]"
              : highlight
                ? "border-amber-400/70 bg-gradient-to-b from-amber-500/25 via-amber-600/15 to-transparent shadow-[0_0_18px_rgba(251,191,36,0.35)] hover:border-amber-300 hover:shadow-[0_0_22px_rgba(251,191,36,0.5)] animate-pulse"
                : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/25 hover:shadow-[0_0_12px_rgba(255,255,255,0.08)] active:bg-white/[0.12]"
          }`}
        >
          {/* subtle top sheen */}
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent rounded-t-xl" />
          {/* active bottom accent line */}
          {active && (
            <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/80 to-transparent" />
          )}
          {/* highlight bottom accent line */}
          {!active && highlight && (
            <span className="pointer-events-none absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" />
          )}
          {btnContent}
        </div>
      </Link>
    );
  };


  return (
    <>

      {/* Sticky header — TWO rows: (1) nav/logo + wallet + global stats +
          controls, (2) mission progress + event ticker. (The old layout
          stacked 4 rows and ate ~180px of viewport.) */}
      <div className="sticky top-0 z-50">

      {/* ── Row 1: nav (desktop) / logo (mobile) + wallet + controls ── */}
      <div className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-xl">
        <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">

            {/* Left: nav buttons (desktop) */}
            <div data-tutorial="nav-tabs" className="hidden md:flex items-center gap-2 shrink-0">
              {allVisibleLinks.map((link) =>
                renderNavButton(
                  link,
                  link.href === "/leaderboard"
                    ? onboarding.onboardingComplete && !gameUnlocked
                    : link.href === "/my-profile"
                      ? highlightHome
                      : false
                )
              )}
            </div>

            {/* Mobile: just the logo */}
            <div className="flex md:hidden items-center shrink-0">
              <Link
                href="/leaderboard"
                onClick={() => sessionStorage.removeItem("auto-navigate-cards")}
                className="text-xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent"
              >
                n38worth
              </Link>
            </div>

            {/* Wallet — compact chips (labels on xl+, tooltips always). The
                number spans truncate (…) as a hard safety net so a rich
                player's balance can never slide under the slots chip. */}
            <div data-tutorial="wallet" className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="flex items-center gap-1.5 min-w-0" title={t.navbarMyCredits}>
                <Coins className="h-4 w-4 text-t1-400 shrink-0" />
                <span className="hidden xl:inline text-gray-500 text-xs">{t.navbarCredits}</span>
                {creditsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-t1-400" />
                ) : (
                  <span className={`font-mono font-bold text-t1-400 tabular-nums truncate min-w-[3.25rem] ${creditsBump ? "credits-bump" : ""}`} style={{ fontSize: "clamp(0.75rem, 1.3vw, 1.1rem)" }}>
                    {formatCompact(credits ?? 0)}¢
                  </span>
                )}
              </span>
              <span className="hidden sm:flex items-center gap-1.5 min-w-0" title={t.navbarMyValue}>
                <TrendingUp className="h-4 w-4 text-t1-400 shrink-0" />
                <span className="hidden xl:inline text-gray-500 text-xs">{t.navbarValue}</span>
                {playerValueLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-t1-400" />
                ) : (
                  <span className="font-mono font-bold text-t1-400 tabular-nums truncate min-w-0" style={{ fontSize: "clamp(0.8rem, 1.3vw, 1.1rem)" }}>
                    {formatCompact(playerValue ?? 0)}¢
                  </span>
                )}
              </span>
            </div>

            {/* Global game stats — desktop space permitting */}
            <div className="hidden lg:flex items-center ml-auto min-w-0">
              <GlobalInfoBar />
            </div>

            {/* Right controls — slots + bell + mute + avatar menu */}
            <div className="flex items-center pl-2 sm:pl-3 py-1 border-l border-gray-800/60 ml-auto lg:ml-0 gap-2 sm:gap-3 shrink-0">
              <div className="flex items-center gap-1 shrink-0">
                <OwnershipLimit />
                <ChatNotificationBell className="shrink-0" />
                <LanguageSwitcher />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { toggleMuted(); if (muted) play("click"); }}
                  className="shrink-0 h-8 w-8 text-gray-400 hover:text-white"
                  title={muted ? t.unmuteSounds : t.muteSounds}
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-center">
                <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button data-tutorial="account-menu" variant="ghost" className="relative h-8 w-8 rounded-full p-0">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={session.user?.image || undefined} alt={session.user?.name || ""} />
                        <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-xs font-bold">
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
                      <Link href="/settings" onClick={() => play("buttons")} className="text-gray-300 cursor-pointer">
                        <Settings className="h-4 w-4 mr-2" />
                        {t.settings}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/history" onClick={() => play("buttons")} className="text-gray-300 cursor-pointer">
                        <History className="h-4 w-4 mr-2" />
                        {t.navHistory}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/catalog" onClick={() => play("buttons")} className="text-gray-300 cursor-pointer">
                        <Building2 className="h-4 w-4 mr-2" />
                        {t.navBuildingsCatalog}
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-gray-800" />
                    <DropdownMenuItem
                      onClick={() => {
                        sessionStorage.removeItem("auto-navigate-cards");
                        play("buttons");
                        signOut({ callbackUrl: "/" });
                      }}
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
          <CoachMark id="credits" className="mb-1.5 sm:max-w-md">
            {t.coachCredits}
          </CoachMark>
        </div>
      </div>

      {/* ── Row 2: mission progress + event ticker ── */}
      <div className="border-b border-gray-800/60 bg-gray-950/85 backdrop-blur-xl">
        <div className="max-w-full 2xl:max-w-[2200px] mx-auto px-4 sm:px-6 lg:px-8 py-1 flex flex-col md:flex-row md:items-center md:gap-4">
          <div data-tutorial="mission-bar" className="md:flex-1 min-w-0">
            <MissionProgress />
          </div>
          <div data-tutorial="event-feed" className="md:flex-1 min-w-0 md:border-l md:border-gray-800/60 md:pl-4">
            <EventFeedBar inline />
          </div>
        </div>
      </div>

      </div>{/* end sticky header block */}

      {/* Mobile Bottom Tab Bar — Home | COMBO pill | Avatars once the game is
          unlocked (the pill is the collapsed ComboDock, in thumb reach).
          Icons carry the affordance; labels stay tiny (10px) so the bar reads
          as a tab bar, not a second header. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950/95 backdrop-blur-xl safe-area-bottom">
        <div data-tutorial="nav-tabs" className="flex items-center justify-around gap-1 h-[60px] px-1">
          {allVisibleLinks.map((link) => {
            const active = isActive(link.href);
            // Guide new accounts: highlight Cards amber before 20 cards, then
            // switch to Home amber after unlocking so they collect their daily
            // login reward. Clears once they visit Home.
            const highlight =
              link.href === "/leaderboard"
                ? onboarding.onboardingComplete && !gameUnlocked
                : link.href === "/my-profile"
                  ? highlightHome
                  : false;
            return (
              <React.Fragment key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => play("changepage")}
                  className={`relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-lg transition-all ${
                    active
                      ? "text-cyan-400 brightness-125"
                      : highlight
                        ? "text-amber-300 brightness-125 animate-pulse"
                        : "text-gray-500 brightness-75 active:text-gray-300"
                  }`}
                >
                  <link.icon className={`h-5 w-5 ${active ? "text-cyan-400 brightness-125" : highlight ? "text-amber-300 brightness-125" : "brightness-75"}`} />
                  <span className={`text-[10px] font-semibold leading-none ${active ? "text-cyan-400 brightness-125" : highlight ? "text-amber-300 brightness-125" : "brightness-75"}`}>
                    {navLabel(link.href)}
                  </span>
                  {active && (
                    <div className="absolute bottom-1 w-6 h-0.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                  )}
                  {!active && highlight && (
                    <div className="absolute bottom-1 w-6 h-0.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                  )}
                </Link>
                {/* Combo pill between Home and Avatars (center thumb slot). */}
                {link.href === "/my-profile" && onboarding.onboardingComplete && gameUnlocked && (
                  <ComboDockPill className="flex-none min-w-[104px]" />
                )}
              </React.Fragment>
            );
          })}

        </div>
      </div>

      {/* World Rebooting overlay — full-screen black + progress bar */}
      <WorldRebootingOverlay />
    </>
  );
}
