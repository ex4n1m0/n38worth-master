"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { CreditBalance } from "./CreditBalance";
import { OwnershipLimit } from "./OwnershipLimit";
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
  Palette,
  Crown,
  Search,
  Swords,
  MessageCircle,
  Trophy,
  BookOpen,
  History,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useThemeColor, type ThemeName } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useOnboarding } from "./OnboardingContext";

const mainNavLinks = [
  { href: "/my-profile", label: "My Profile", icon: Users },
  { href: "/leaderboard", label: "Market", icon: Search },
  { href: "/my-players", label: "My Players", icon: Swords },
  { href: "/my-owners", label: "My Owner", icon: Crown },
  { href: "/ranks", label: "Ranks", icon: Trophy },
  { href: "/history", label: "History", icon: History },
];

const themes: { value: ThemeName; label: string }[] = [
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "orange", label: "Orange" },
];

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useThemeColor();
  const { t } = useLanguage();
  const { play } = useSound();
  const { state: onboarding } = useOnboarding();

  if (!session) return null;

  // Filter nav links based on onboarding state
  const getVisibleLinks = () => {
    // If onboarding is complete, show all links
    if (onboarding.onboardingComplete) {
      return mainNavLinks;
    }
    // If avatar is completed but onboarding not complete, show My Profile and Market
    if (onboarding.avatarCompleted) {
      return mainNavLinks.filter(
        (link) => link.href === "/my-profile" || link.href === "/leaderboard"
      );
    }
    // New player: only show My Profile
    return mainNavLinks.filter((link) => link.href === "/my-profile");
  };

  const visibleLinks = getVisibleLinks();

  const isActive = (href: string) => pathname === href;

  // Redirect if current page is locked
  useEffect(() => {
    if (!session) return;
    const allowedPaths = visibleLinks.map((l) => l.href);
    const isCurrentPathAllowed = allowedPaths.some(
      (p) => pathname === p || pathname.startsWith("/players/")
    );
    if (!isCurrentPathAllowed && !pathname.startsWith("/settings")) {
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
    visibleLinks,
  ]);

  return (
    <>
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <Link
              href="/leaderboard"
              className="text-xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent shrink-0"
            >
              n38worth
            </Link>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-1">
              {visibleLinks.map((link) => {
                const active = isActive(link.href);
                const isMarketOnboarding =
                  link.href === "/leaderboard" &&
                  onboarding.avatarCompleted &&
                  !onboarding.onboardingComplete;
                return (
                  <Link key={link.href} href={link.href} onClick={() => play("changepage")}>
                    {isMarketOnboarding ? (
                      <span className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-3 text-base font-bold bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 text-black shadow-lg shadow-yellow-500/30 animate-pulse cursor-pointer">
                        <link.icon className="h-5 w-5 text-black" />
                        🎯 Market
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        className={`font-semibold px-4 py-3 text-base h-auto transition-all ${
                          active
                            ? "bg-t1-600/20 text-t1-400 border border-t1-500/40"
                            : "text-gray-400 hover:text-white hover:bg-gray-800"
                        }`}
                      >
                        <link.icon className={`h-5 w-5 mr-2 ${active ? "text-t1-400" : ""}`} />
                        {link.label}
                      </Button>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              <OwnershipLimit />
              <CreditBalance />

              {/* Theme selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-white hover:bg-gray-800 px-2"
                  >
                    <Palette className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-36 bg-gray-900 border-gray-800"
                >
                  {themes.map((t) => (
                    <DropdownMenuItem
                      key={t.value}
                      onClick={() => {
                        play("buttons");
                        setTheme(t.value);
                      }}
                      className={`cursor-pointer ${
                        theme === t.value
                          ? "text-white font-medium"
                          : "text-gray-400"
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-full mr-2 ${
                          t.value === "blue"
                            ? "bg-blue-500"
                            : t.value === "green"
                              ? "bg-green-500"
                              : "bg-orange-500"
                        }`}
                      />
                      {t.label}
                      {theme === t.value && (
                        <span className="ml-auto text-xs text-gray-500">✓</span>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-10 w-10 rounded-full p-0"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={session.user?.image || undefined}
                        alt={session.user?.name || ""}
                      />
                      <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-xs font-bold">
                        {session.user?.name?.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 bg-gray-900 border-gray-800"
                >
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium text-white">
                      {session.user?.name}
                    </p>
                  </div>
                  <DropdownMenuSeparator className="bg-gray-800" />
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/players/${session.user?.name}`}
                      onClick={() => play("buttons")}
                      className="text-gray-300 cursor-pointer"
                    >
                      <Users className="h-4 w-4 mr-2" />
                      {t.myProfile}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link
                      href="/settings"
                      onClick={() => play("buttons")}
                      className="text-gray-300 cursor-pointer"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      {t.settings}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-gray-800" />
                  <DropdownMenuItem
                    onClick={() => {
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
      </nav>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-gray-800 bg-gray-950/95 backdrop-blur-xl safe-area-bottom">
        <div className="flex items-center justify-around h-16 px-1">
          {visibleLinks.map((link) => {
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
                      ? "text-t1-400"
                      : "text-gray-500 active:text-gray-300"
                }`}
              >
                <link.icon className={`h-5 w-5 ${isMarketOnboarding ? "text-black" : active ? "text-t1-400" : ""}`} />
                <span className={`text-[10px] font-medium leading-tight ${isMarketOnboarding ? "text-black" : active ? "text-t1-400" : ""}`}>
                  {isMarketOnboarding ? "🎯 Market" : link.label}
                </span>
                {active && !isMarketOnboarding && (
                  <div className="absolute bottom-1 w-6 h-0.5 rounded-full bg-t1-400" />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
