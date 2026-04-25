"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { HireButton } from "@/components/HireButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { SquareAvatarUpload } from "@/components/SquareAvatarUpload";
import { PortfolioRewardCountdown } from "@/components/PortfolioRewardCountdown";
import { RankBonusCountdown } from "@/components/RankBonusCountdown";
import { LoginReward } from "@/components/LoginReward";
import { RandomPlayerCountdown } from "@/components/RandomPlayerCountdown";
import { RewardHistory } from "@/components/RewardHistory";
import { useCredits } from "@/hooks/useCredits";
import {
  TrendingUp,
  Crown,
  Users,
  Calendar,
  Clock,
  Loader2,
  Star,
  Gem,
  Briefcase,
  Coins,
  Shield,
  Swords,
  User,
  CreditCard,
  Camera,
  Sparkles,
  Trophy,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useOnboarding } from "@/components/OnboardingContext";
import {
  getOwnedRank,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getNextOwnedRank,
  getNextCreditsRank,
  getNextValueRank,
  getNextPortfolioRank,
  getOwnedRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";
import { formatNumber, getDynamicStatFontSize, getDynamicFontSize } from "@/lib/utils";

function formatLastOnline(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Compute % progress toward the next rank threshold */
function rankProgress(current: number, threshold: number | undefined): number {
  if (!threshold || threshold <= 0) return 100;
  return Math.min(100, Math.max(0, (current / threshold) * 100));
}

export default function PlayerProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { state: onboarding } = useOnboarding();

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", username],
    queryFn: async () => {
      // Use ?lite=1 to skip heavy base64 avatar_url fields for owners/ownedPlayers
      // (not rendered on this page) — prevents 25MB+ payloads from 500ing for
      // users with many owned players.
      const res = await fetch(`/api/players/${username}?lite=1`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  const { data: credits } = useCredits();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-400" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white">{t.playerNotFound}</h2>
        <p className="text-gray-400 mt-2">"{username}"</p>
      </div>
    );
  }

  const isOwnProfile = session?.user?.name === username;
  const showOnboardingMessage = isOwnProfile && !onboarding.avatarCompleted;
  const alreadyOwns = player.owners?.some(
    (o: { username: string }) => o.username === session?.user?.name
  );
  const canHire =
    !isOwnProfile && !alreadyOwns && (credits ?? 0) >= player.playerValue;

  const nextOwned = getNextOwnedRank(player.ownedCount);
  const nextCredits = getNextCreditsRank(player.credits ?? 0);
  const nextValue = getNextValueRank(player.playerValue);
  const nextPortfolio = getNextPortfolioRank(player.portfolioValue ?? 0);

  // Derive "achievements" from existing data
  const achievements: Array<{ icon: string; label: string; earned: boolean; color: string }> = [
    { icon: "🎬", label: "First Steps", earned: true, color: "from-sky-500 to-blue-600" },
    { icon: "🛒", label: "First Hire", earned: (player.ownedCount ?? 0) >= 1, color: "from-emerald-500 to-teal-600" },
    { icon: "💪", label: "Squad of 10", earned: (player.ownedCount ?? 0) >= 10, color: "from-violet-500 to-purple-600" },
    { icon: "🏆", label: "Mogul", earned: (player.ownedCount ?? 0) >= 50, color: "from-amber-500 to-orange-600" },
    { icon: "💎", label: "Precious", earned: (player.valueFloor ?? 0) >= 100, color: "from-fuchsia-500 to-pink-600" },
    { icon: "⭐", label: "Rising Star", earned: (player.valueFloor ?? 0) >= 10, color: "from-yellow-400 to-amber-500" },
    { icon: "👑", label: "Has Bosses", earned: (player.ownerCount ?? 0) >= 1, color: "from-rose-500 to-red-600" },
    { icon: "💰", label: "Rich", earned: (player.credits ?? 0) >= 10000, color: "from-lime-500 to-emerald-600" },
    { icon: "🤝", label: "Hired", earned: (player.purchaseCount ?? 0) >= 1, color: "from-cyan-500 to-sky-600" },
    { icon: "🔥", label: "In Demand", earned: (player.purchaseCount ?? 0) >= 10, color: "from-orange-500 to-red-600" },
    { icon: "🌟", label: "Fan Favorite", earned: (player.purchaseCount ?? 0) >= 50, color: "from-yellow-400 to-orange-500" },
    { icon: "🪩", label: "Legend", earned: (player.purchaseCount ?? 0) >= 100, color: "from-pink-500 to-purple-600" },
  ];
  const earnedCount = achievements.filter((a) => a.earned).length;
  const hiredCount = player.purchaseCount ?? 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Onboarding Message */}
      {showOnboardingMessage && (
        <div className="bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border border-yellow-500/40 rounded-2xl p-4 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Camera className="h-5 w-5 text-yellow-400" />
            <p className="text-yellow-200 text-lg font-bold">
              🎯 Change your avatar to unlock Market
            </p>
          </div>
          <p className="text-yellow-300 text-sm">
            Upload a custom profile picture to start your journey!
          </p>
        </div>
      )}

      {/* MAIN HERO CARD — warm sunset vibe */}
      <Card className="relative border-0 bg-transparent overflow-hidden p-0 rounded-3xl">
        {/* Animated gradient banner */}
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-orange-500/25 via-pink-500/25 to-purple-600/25 pointer-events-none" />
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-yellow-400/10 via-transparent to-cyan-400/10 pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-pink-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full bg-orange-500/20 blur-3xl pointer-events-none" />

        <div className="relative rounded-3xl border border-white/10 backdrop-blur-sm bg-gray-950/70 p-5 sm:p-8 space-y-6">
          {/* TOP: Avatar + identity side-by-side on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,280px)_1fr] gap-6">
            {/* LEFT: Square avatar — matching PlayerCard format */}
            <div className="w-full max-w-[280px] mx-auto md:mx-0">
              {isOwnProfile ? (
                <SquareAvatarUpload
                  currentUrl={player.avatarUrl ?? null}
                  username={player.username}
                  avatarCompleted={onboarding.avatarCompleted}
                />
              ) : (
                <div className="relative w-full overflow-hidden rounded-2xl ring-2 ring-white/10 shadow-xl shadow-black/40">
                  <Avatar className="w-full h-auto aspect-square rounded-2xl">
                    <AvatarImage
                      src={player.avatarUrl || undefined}
                      className="object-cover"
                    />
                    <AvatarFallback className="rounded-2xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white font-bold text-5xl sm:text-7xl">
                      {player.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {player.isActive === 0 && (
                    <div className="absolute top-3 left-3 bg-red-500/80 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                      Inactive
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT: Identity + badges + hire button */}
            <div className="flex flex-col gap-3 min-w-0">
              {/* Username + Trophy icons */}
              <div className="flex items-start gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-4xl font-black bg-gradient-to-r from-orange-300 via-pink-300 to-purple-300 bg-clip-text text-transparent break-words leading-tight">
                  {player.username}
                </h1>
                {player.valueFloor >= 100 && (
                  <Gem className="h-7 w-7 text-purple-400 shrink-0 drop-shadow-[0_0_8px_rgba(168,85,247,0.7)] mt-1" />
                )}
                {player.valueFloor >= 10 && player.valueFloor < 100 && (
                  <Star className="h-7 w-7 text-yellow-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)] mt-1" />
                )}
                {isOwnProfile && (
                  <Badge className="bg-gradient-to-r from-pink-500 to-purple-500 text-white border-0 ml-auto shrink-0">
                    <Sparkles className="h-3 w-3 mr-1" />
                    You
                  </Badge>
                )}
              </div>

              {/* Rank badges row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {player.playerType === "human" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-emerald-200 bg-emerald-500/20 border-emerald-400/40">
                    <User className="h-3 w-3" />
                    Human
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-cyan-200 bg-cyan-500/20 border-cyan-400/40">
                    <CreditCard className="h-3 w-3" />
                    Card
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-gray-300 bg-white/5 border-white/20">
                  <Shield className="h-3 w-3" />
                  {player.ownerCount} boss{player.ownerCount !== 1 ? "es" : ""}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getOwnedRankColor(player.ownedCount)}`}>
                  <Swords className="h-3 w-3" />
                  {getOwnedRank(player.ownedCount).title}
                </span>
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getValueRankColor(player.playerValue)}`}>
                  <TrendingUp className="h-3 w-3" />
                  {getValueRank(player.playerValue).title}
                </span>
              </div>

              {/* Meta info */}
              <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-400 flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-orange-400" />
                  Joined{" "}
                  {new Date(player.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-pink-400" />
                  {player.lastOnlineAt ? formatLastOnline(player.lastOnlineAt) : "Never seen"}
                </span>
              </div>

              {/* Hire button (non-own profile) */}
              {!isOwnProfile && (
                <div className="mt-2">
                  <HireButton
                    targetId={player.id}
                    targetUsername={player.username}
                    cost={player.playerValue}
                    disabled={!canHire}
                  />
                </div>
              )}

              {!isOwnProfile && alreadyOwns && (
                <div className="mt-1 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
                  ✓ You already own this player
                </div>
              )}
              {!isOwnProfile && !alreadyOwns && (credits ?? 0) < player.playerValue && (
                <div className="mt-1 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                  You need {player.playerValue - (credits ?? 0)} more credits to hire
                </div>
              )}
            </div>
          </div>

          {/* KEY STATS — warm gradient glass cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<TrendingUp className="h-5 w-5" />}
              label={t.playerValue}
              value={`${formatNumber(player.playerValue)}¢`}
              gradient="from-orange-500/20 to-pink-500/20"
              iconColor="text-orange-300"
              valueSize={getDynamicStatFontSize(player.playerValue)}
            />
            <StatCard
              icon={<Coins className="h-5 w-5" />}
              label={t.credits}
              value={`${formatNumber(parseFloat((player.credits ?? 0).toFixed(2)))}¢`}
              gradient="from-yellow-500/20 to-amber-500/20"
              iconColor="text-yellow-300"
              valueSize={getDynamicStatFontSize(player.credits ?? 0)}
            />
            <StatCard
              icon={<Crown className="h-5 w-5" />}
              label={t.owners}
              value={String(player.ownerCount)}
              gradient="from-rose-500/20 to-red-500/20"
              iconColor="text-rose-300"
              valueSize={getDynamicStatFontSize(player.ownerCount)}
            />
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label={t.owns}
              value={String(player.ownedCount)}
              gradient="from-violet-500/20 to-purple-500/20"
              iconColor="text-violet-300"
              valueSize={getDynamicStatFontSize(player.ownedCount)}
            />
          </div>

          {/* ACHIEVEMENTS STRIP */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Trophy className="h-4 w-4 text-yellow-400" />
                Achievements
              </h3>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border text-cyan-100 bg-gradient-to-r from-cyan-500/20 to-sky-500/20 border-cyan-400/30"
                  title="Lifetime times hired"
                >
                  🤝 Hired {formatNumber(hiredCount)}×
                </span>
                <span className="text-xs text-gray-400 font-mono">
                  {earnedCount}/{achievements.length}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-12 gap-2">
              {achievements.map((a) => (
                <div
                  key={a.label}
                  className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 border transition-all ${
                    a.earned
                      ? `bg-gradient-to-br ${a.color} border-white/20 shadow-lg hover:scale-105`
                      : "bg-gray-900/60 border-gray-800 opacity-40 grayscale"
                  }`}
                  title={a.label}
                >
                  <span className="text-2xl leading-none">{a.icon}</span>
                  <span className={`text-[10px] font-semibold text-center leading-tight ${a.earned ? "text-white" : "text-gray-500"}`}>
                    {a.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* RANK DETAIL CARDS with progress bars */}
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-pink-400" />
              Ranks & Progression
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <RankCard
                icon={player.playerType === "human" ? <User className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                label="Player Type"
                value={player.playerType === "human" ? "Human" : "Card"}
                subtext={player.playerType === "human" ? "Real player account" : "Auto-generated NPC"}
                colorClass={player.playerType === "human" ? "text-emerald-200 bg-emerald-500/10 border-emerald-500/30" : "text-cyan-200 bg-cyan-500/10 border-cyan-500/30"}
              />
              <RankCard
                icon={<Shield className="h-4 w-4" />}
                label="Boss"
                value={`${player.ownerCount} boss${player.ownerCount !== 1 ? "es" : ""}`}
                subtext="Demand from other players"
                colorClass="text-gray-300 bg-white/5 border-white/10"
              />
              <RankCard
                icon={<Swords className="h-4 w-4" />}
                label="Empire Rank"
                value={getOwnedRank(player.ownedCount).title}
                subtext={
                  nextOwned
                    ? `${player.ownedCount} · Next: ${nextOwned.title} at ${nextOwned.threshold}`
                    : `${player.ownedCount} · Max rank! 🏆`
                }
                progress={nextOwned ? rankProgress(player.ownedCount, nextOwned.threshold) : 100}
                colorClass={getOwnedRankColor(player.ownedCount)}
              />
              <RankCard
                icon={<Coins className="h-4 w-4" />}
                label="Credits Rank"
                value={getCreditsRank(player.credits ?? 0).title}
                subtext={
                  nextCredits
                    ? `${Math.round(player.credits ?? 0).toLocaleString()}¢ · Next at ${nextCredits.threshold.toLocaleString()}¢`
                    : `${Math.round(player.credits ?? 0).toLocaleString()}¢ · Max rank! 🏆`
                }
                progress={nextCredits ? rankProgress(player.credits ?? 0, nextCredits.threshold) : 100}
                colorClass={getCreditsRankColor(player.credits ?? 0)}
              />
              <RankCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="Value Rank"
                value={getValueRank(player.playerValue).title}
                subtext={
                  nextValue
                    ? `${player.playerValue} · Next: ${nextValue.title} at ${nextValue.threshold}`
                    : `${player.playerValue} · Max rank! 🏆`
                }
                progress={nextValue ? rankProgress(player.playerValue, nextValue.threshold) : 100}
                colorClass={getValueRankColor(player.playerValue)}
              />
              <RankCard
                icon={<Briefcase className="h-4 w-4" />}
                label="Portfolio Rank"
                value={getPortfolioRank(player.portfolioValue ?? 0).title}
                subtext={
                  nextPortfolio
                    ? `${Math.round(player.portfolioValue ?? 0).toLocaleString()}¢ · Next at ${nextPortfolio.threshold.toLocaleString()}¢`
                    : `${Math.round(player.portfolioValue ?? 0).toLocaleString()}¢ · Max rank! 🏆`
                }
                progress={nextPortfolio ? rankProgress(player.portfolioValue ?? 0, nextPortfolio.threshold) : 100}
                colorClass={getPortfolioRankColor(player.portfolioValue ?? 0)}
              />
            </div>
          </div>

        </div>
      </Card>

      {/* Own-profile only: reward countdowns & income history */}
      {isOwnProfile && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <PortfolioRewardCountdown />
            <RankBonusCountdown />
            <LoginReward />
            <RandomPlayerCountdown />
          </div>
          <RewardHistory />
          <div className="pt-4 border-t border-white/10">
            <DeleteAccountButton
              playerValue={player.playerValue}
              ownerCount={player.ownerCount}
              ownedCount={player.ownedCount}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────── Sub-components ─────────── */

function StatCard({
  icon,
  label,
  value,
  gradient,
  iconColor,
  valueSize,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  gradient: string;
  iconColor: string;
  valueSize: string;
}) {
  return (
    <div
      className={`relative text-center p-4 rounded-2xl bg-gradient-to-br ${gradient} border border-white/10 overflow-hidden transition-all hover:scale-[1.02] hover:border-white/20`}
    >
      <div className={`${iconColor} mx-auto mb-1 flex justify-center`}>{icon}</div>
      <p className={`${valueSize} font-black font-mono text-white truncate drop-shadow`}>
        {value}
      </p>
      <p className="text-[10px] sm:text-xs text-gray-300/80 uppercase tracking-wider font-semibold">
        {label}
      </p>
    </div>
  );
}

function RankCard({
  icon,
  label,
  value,
  subtext,
  progress,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext: string;
  progress?: number;
  colorClass: string;
}) {
  return (
    <div className={`relative rounded-2xl border p-3 ${colorClass} overflow-hidden transition-all hover:scale-[1.01]`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
          {label}
        </span>
      </div>
      <p className="text-base font-bold">{value}</p>
      <p className="text-[10px] opacity-70 mt-0.5 leading-tight">{subtext}</p>
      {typeof progress === "number" && (
        <div className="mt-2 h-1.5 w-full rounded-full bg-black/30 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-orange-400 via-pink-400 to-purple-400 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
