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
import { Loader2, BadgeCheck, MessageCircle, X, Users, ShoppingCart, Trash2, TrendingUp, Coins, Zap, Crown, Trophy, Shield, Clock, User, Globe, Swords, Star, History, MessageSquare, Settings } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const hireMultiplierText = "Hire — pay target's current value → value increases (×2 at <1K, ×1.75 <10K, ×1.5 <100K, ×1.25 <1M, ×1.1 ≥1M)";
const ownershipDecayText = "Ownership Decay: offline >24h → lose 1 oldest team member per hour";

export default function Home() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { t } = useLanguage();

  const [randomCover, setRandomCover] = useState("/MayBe.png");
  const [gameplayOpen, setGameplayOpen] = useState(false);
  useEffect(() => {
    setRandomCover("/MayBe.png");
  }, []);


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
        router.push("/my-profile");
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
        <div className="relative z-10 w-full flex justify-center px-4 sm:px-6 lg:px-8 pt-8 pb-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={randomCover}
            alt="n38worth Game Cover"
            className="w-full max-w-4xl object-cover rounded-lg"
          />
        </div>

        {/* Action Buttons Row — Line 1: Game Play + Login */}
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 pt-3 pb-3 w-full">
          <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 md:gap-6 max-w-4xl w-full mx-auto">
            <button
              onClick={() => setGameplayOpen(true)}
              className="flex-1 min-w-0 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/GamePlay.png"
                alt="Game Play"
                className="w-full h-auto"
              />
            </button>
            <Link
              href="https://n38worth.com/register"
              className="flex-1 min-w-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/MMO_LOGIN.png"
                alt="Sign In"
                className="w-full h-auto"
              />
            </Link>
          </div>
        </div>

        {/* Action Buttons Row — Line 2: FFS Tribute + Dev */}
        <div className="relative z-10 px-4 sm:px-6 lg:px-8 pb-6 w-full">
          <div className="flex flex-row items-center justify-center gap-2 sm:gap-4 md:gap-6 max-w-4xl w-full mx-auto">
            <a
              href="https://en.wikipedia.org/wiki/Friends_for_Sale"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/FFS_BUTTON2.png"
                alt="A Tribute to Friends for Sale Game"
                className="w-full h-auto"
              />
            </a>
            <a
              href="https://www.linkedin.com/in/igorcarlier/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-w-0 opacity-70 hover:opacity-100 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/DEV_BUTTON.png"
                alt="Contact Developer"
                className="w-full h-auto"
              />
            </a>
          </div>
        </div>

        {/* Game Play Modal */}
        <Dialog open={gameplayOpen} onOpenChange={setGameplayOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-900 border-gray-700 text-gray-100">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-center">Game Play</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* What is n38worth? */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-2 flex items-center gap-2">
                  <Globe className="w-5 h-5" /> What is n38worth?
                </h3>
                <ul className="space-y-1 text-gray-300 text-sm list-disc list-inside">
                  <li>Social trading game — <strong className="text-white">recruit</strong> players and grow your <strong className="text-white">My Team</strong> roster</li>
                  <li>Powered by virtual <strong className="text-white">credits (¢)</strong> — no real-money value</li>
                </ul>
              </section>

              {/* Getting Started */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-2 flex items-center gap-2">
                  <Zap className="w-5 h-5" /> Getting Started
                </h3>
                <ul className="space-y-1 text-gray-300 text-sm list-disc list-inside">
                  <li>Begin with <strong className="text-white">10¢</strong> in credits; every player starts at <strong className="text-white">1¢</strong></li>
                  <li>Upload a profile photo to claim your <strong className="text-white">+10¢ avatar bonus</strong></li>
                  <li>Complete onboarding tasks to earn extra credits</li>
                </ul>
              </section>

              {/* How to Play */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-2 flex items-center gap-2">
                  <Swords className="w-5 h-5" /> How to Play
                </h3>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start gap-2">
                    <ShoppingCart className="w-4 h-4 mt-0.5 text-green-400 shrink-0" />
                    <span><strong className="text-white">{hireMultiplierText}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Trash2 className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                    <span><strong className="text-white">Discard</strong> — drop a player from your team; their value resets to <strong className="text-white">1¢</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
                    <span><strong className="text-white">Revenue</strong> — when you&apos;re hired away, you pocket <strong className="text-white">75%</strong> of the sale</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Coins className="w-4 h-4 mt-0.5 text-yellow-400 shrink-0" />
                    <span><strong className="text-white">Dividends</strong> — earn <strong className="text-white">0.01¢ per owner per minute</strong> across your portfolio</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="w-4 h-4 mt-0.5 text-purple-400 shrink-0" />
                    <span><strong className="text-white">Mass Hire</strong> — scoop up multiple players in one move from the <strong className="text-white">Network</strong></span>
                  </li>
                </ul>
              </section>

              {/* Win Condition */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-2 flex items-center gap-2">
                  <Crown className="w-5 h-5" /> Win Condition
                </h3>
                <ul className="space-y-1 text-gray-300 text-sm list-disc list-inside">
                  <li>Collect all <strong className="text-white">5 Goddess NPCs</strong> — Morríghan, Athena, Freyja, Ishtar, Inanna</li>
                  <li>Hold them through the <strong className="text-white">Goddess Countdown</strong> to claim victory</li>
                  <li>Champions are enshrined forever in the <strong className="text-white">Hall of Fame</strong></li>
                </ul>
              </section>

              {/* Game Rules */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-2 flex items-center gap-2">
                  <Shield className="w-5 h-5" /> Game Rules
                </h3>
                <ul className="space-y-2 text-gray-300 text-sm">
                  <li className="flex items-start gap-2">
                    <User className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                    <span>You can&apos;t hire yourself</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Users className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                    <span><strong className="text-white">My Team</strong> cap — up to <strong className="text-white">500 players</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <X className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                    <span>You can&apos;t own the same player twice</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Clock className="w-4 h-4 mt-0.5 text-orange-400 shrink-0" />
                    <span><strong className="text-white">{ownershipDecayText}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 mt-0.5 text-blue-400 shrink-0" />
                    <span><strong className="text-white">Value Floor</strong> — the lowest a player&apos;s value can drop to</span>
                  </li>
                </ul>
              </section>

              {/* Features at a Glance */}
              <section>
                <h3 className="text-lg font-semibold text-t1-400 mb-2 flex items-center gap-2">
                  <Star className="w-5 h-5" /> Features at a Glance
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-300">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">My Profile</strong> → your stats and portfolio</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">Network</strong> → browse and hire other players</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">My Team</strong> → the players you own</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">My Boss</strong> → who owns you</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Swords className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">Ranks</strong> → tiered progression system</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">Hall of Fame</strong> → immortal game winners</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">History</strong> → your full transaction log</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">Chat</strong> → real-time messaging</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-t1-400 shrink-0" />
                    <span><strong className="text-white">Settings</strong> → profile, theme, preferences</span>
                  </div>
                </div>
              </section>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}