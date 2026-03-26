"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import Link from "next/link";
import { Trophy, Loader2, BadgeCheck, Zap } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [quickPlayLoading, setQuickPlayLoading] = useState(false);
  const { t } = useLanguage();

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

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid username or password");
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
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 p-4 pt-12 sm:pt-20 gap-8">
      <Card className="w-full max-w-md border-gray-800 bg-gray-900/80 backdrop-blur">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent">
            {t.loginTitle}
          </CardTitle>
          <CardDescription className="text-gray-400">
            {t.loginSubtitle}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="username" className="text-gray-300">
                {t.username}
              </Label>
              <Input
                id="username"
                name="username"
                type="text"
                placeholder={t.chooseUsername}
                required
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">
                {t.password}
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder={t.choosePassword}
                required
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white font-semibold"
            >
              {loading ? t.connecting : t.signIn}
            </Button>

            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-900 px-2 text-gray-500">
                  {t.orContinueWith}
                </span>
              </div>
            </div>

            <Button
              type="button"
              disabled={googleLoading}
              onClick={() => {
                setError("");
                setGoogleLoading(true);
                signIn("google", { callbackUrl: "/leaderboard" }).catch(() => {
                  setError("Google sign-in failed. Please try again.");
                  setGoogleLoading(false);
                });
              }}
              className="w-full border border-gray-700 !bg-gray-800 hover:!bg-gray-700 !text-white font-semibold"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              {googleLoading ? t.connecting : t.signUpGoogle}
            </Button>

            <div className="relative w-full">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-900 px-2 text-gray-500">
                  {t.orTryInstantly}
                </span>
              </div>
            </div>

            <Button
              type="button"
              onClick={async () => {
                setQuickPlayLoading(true);
                setError("");
                try {
                  const res = await fetch("/api/quickplay", { method: "POST" });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error || "Quick play failed");
                  const signInResult = await signIn("credentials", {
                    username: data.username,
                    password: data.password,
                    redirect: false,
                  });
                  if (signInResult?.error) {
                    setError("Quick play sign-in failed. Please try again.");
                  } else {
                    router.push("/leaderboard");
                    router.refresh();
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Quick play failed");
                } finally {
                  setQuickPlayLoading(false);
                }
              }}
              disabled={quickPlayLoading}
              className="w-full h-12 text-base font-bold bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-400 hover:to-orange-400 text-black shadow-lg shadow-yellow-500/20"
            >
              {quickPlayLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  {t.creatingPlayer}
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5 mr-2" />
                  {t.quickPlay}
                </>
              )}
            </Button>
            <p className="text-xs text-gray-500 text-center -mt-2">
              {t.quickPlayHint}
            </p>

            <p className="text-sm text-gray-400">
              {t.dontHaveAccount}{" "}
              <Link
                href="/register"
                className="text-t1-400 hover:text-t1-300 font-medium"
              >
                {t.register}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>

      {/* Non-clickable Leaderboard */}
      <Card className="w-full max-w-2xl border-gray-800 bg-gray-900/60 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-400" />
            {t.portfolioRankings}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboardLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
            </div>
          ) : avatarPlayers.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {t.noPlayersYet}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:gap-4">
              {avatarPlayers.slice(0, 9).map(
                (
                  player: {
                    id: number;
                    username: string;
                    avatarUrl: string;
                    portfolioValue: number;
                    isVerified?: number;
                  },
                  index: number
                ) => (
                  <div
                    key={player.id}
                    className="relative aspect-square rounded-xl overflow-hidden border border-gray-700/50"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={player.avatarUrl}
                      alt={player.username}
                      className="absolute inset-0 w-full h-full object-cover"
                    />

                    {/* Rank badge */}
                    <div
                      className={`absolute top-2 left-2 flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full border ${getRankBgColor(index)} backdrop-blur-sm`}
                    >
                      {index < 3 ? (
                        <Trophy
                          className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${getMedalColor(index)}`}
                        />
                      ) : (
                        <span className="text-xs sm:text-sm font-bold text-white">
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {/* Portfolio value + username */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-2 px-2">
                      <p className="text-white text-[10px] sm:text-xs font-medium text-center truncate flex items-center justify-center gap-0.5">
                        {player.username}
                        {player.isVerified === 1 && (
                          <BadgeCheck className="h-3 w-3 text-blue-400 shrink-0" />
                        )}
                      </p>
                      <p className="text-white text-xs sm:text-sm font-semibold text-center drop-shadow-lg">
                        {Number(player.portfolioValue).toFixed(2)}¢
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
