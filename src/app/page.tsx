"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, BadgeCheck, Palette, LogIn } from "lucide-react";
import { useThemeColor, type ThemeName } from "@/components/ThemeContext";
import { useLanguage } from "@/components/LanguageContext";

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { theme, setTheme } = useThemeColor();
  const { t } = useLanguage();

  const coverImages = [
    "/GameCoverFFS.png",
    "/GameCoverFFS2.png",
    "/GameCoverFFS3.png",
    "/GameCoverFFS4.png",
    "/GameCoverFFS5.png",
  ];
  const [randomCover, setRandomCover] = useState("/GameCoverFFS.png");
  useEffect(() => {
    setRandomCover(coverImages[Math.floor(Math.random() * coverImages.length)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const themes: { value: ThemeName; label: string; dot: string }[] = [
    { value: "blue", label: "Blue", dot: "bg-blue-500" },
    { value: "green", label: "Green", dot: "bg-emerald-500" },
    { value: "white", label: "White", dot: "bg-gradient-to-r from-pink-500 to-orange-400" },
  ];


  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery({
    queryKey: ["leaderboard", "portfolio", "public"],
    queryFn: async () => {
      const res = await fetch(`/api/leaderboard?type=portfolio`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const getMedalColor = (index: number) => {
    if (index === 0) return "text-yellow-400";
    if (index === 1) return "text-gray-300";
    if (index === 2) return "text-amber-600";
    return "text-gray-500";
  };

  const getRankBgColor = (index: number) => {
    if (index === 0) return "bg-yellow-400/20 border-yellow-400/40";
    if (index === 1) return "bg-gray-300/20 border-gray-300/40";
    if (index === 2) return "bg-amber-600/20 border-amber-600/40";
    return "bg-gray-700/40 border-gray-600/40";
  };

  const avatarPlayers = (leaderboardData?.players ?? []).filter(
    (p: { avatarUrl: string | null }) =>
      p.avatarUrl !== null && p.avatarUrl !== undefined && p.avatarUrl !== ""
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registration failed");
        setLoading(false);
        return;
      }

      // Auto sign in after registration
      const signInResult = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        router.push("/login");
      } else {
        router.push("/leaderboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-start justify-center">
      <div className="relative overflow-hidden w-full">
        <div className="absolute inset-0 bg-gradient-to-br from-t1-600/10 via-transparent to-t2-600/10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-t1-500/5 rounded-full blur-3xl" />

        {/* Game Cover */}
        <div className="relative z-10 w-full flex justify-center px-4 sm:px-6 lg:px-8 pt-0 pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={randomCover}
            alt="n38worth Game Cover"
            className="w-full max-w-4xl object-cover rounded-lg"
          />
        </div>

        {/* Sign In Button */}
        <div className="relative z-10 flex flex-col items-center px-4 sm:px-6 lg:px-8 pt-3 pb-1 gap-3 w-full">
          <Link
            href="/login"
            className="w-full max-w-4xl flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-400 hover:to-purple-400 text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-400/35 transition-all"
          >
            <LogIn className="h-9 w-9" />
            <span className="text-4xl font-bold tracking-wide">Sign In</span>
          </Link>
        </div>

        {/* Theme & Language Selector */}
        <div className="relative z-10 flex justify-center px-4 sm:px-6 lg:px-8 pt-3 pb-0 gap-2 flex-wrap">
          <div className="flex items-center gap-2 rounded-full border border-gray-700/60 bg-gray-900/60 backdrop-blur-sm px-4 py-2">
            <Palette className="h-4 w-4 text-gray-400" />
            {themes.map((th) => (
              <button
                key={th.value}
                onClick={() => setTheme(th.value)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
                  theme === th.value
                    ? "bg-gray-700/80 text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${th.dot}`} />
                {th.label}
              </button>
            ))}
          </div>
        </div>

        {/* Version & Last Update Info */}
        <div className="relative z-10 flex justify-center px-4 sm:px-6 lg:px-8 pt-4 pb-4">
          <div className="flex flex-col items-center gap-1 text-gray-500 text-xs">
            <span className="font-semibold text-gray-400">Version 1.4</span>
            <span>Last updated: March 27, 2026 — 23:05 UTC+8</span>
          </div>
        </div>
      </div>
    </div>
  );
}
