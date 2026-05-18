"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HireButton } from "@/components/HireButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { SquareAvatarUpload } from "@/components/SquareAvatarUpload";
import { PortfolioRewardCountdown } from "@/components/PortfolioRewardCountdown";
import { RankBonusCountdown } from "@/components/RankBonusCountdown";
import { LoginReward } from "@/components/LoginReward";
import { RandomPlayerCountdown } from "@/components/RandomPlayerCountdown";
import { RewardHistory } from "@/components/RewardHistory";
import { BossIncomeCard } from "@/components/BossIncomeCard";
import { LostPlayersGrid } from "@/components/LostPlayersGrid";
import { BoostValueButton } from "@/components/BoostValueButton";
import { useCredits } from "@/hooks/useCredits";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import {
  TrendingUp,
  Loader2,
  Star,
  Gem,
  Shield,
  Swords,
  Calendar,
  Clock,
  Camera,
  Sparkles,
  Pencil,
  X,
  Check,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useOnboarding } from "@/components/OnboardingContext";
import {
  getOwnedRank,
  getValueRank,
  getOwnedRankColor,
  getValueRankColor,
} from "@/lib/ranks";
import { formatNumber } from "@/lib/utils";

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

const BIO_MAX = 160;

export default function PlayerProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { state: onboarding } = useOnboarding();
  const queryClient = useQueryClient();
  const [bioEditing, setBioEditing] = useState(false);
  const [bioDraft, setBioDraft] = useState("");

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

  const bioMutation = useMutation({
    mutationFn: async (bio: string) => {
      const res = await fetch("/api/settings/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: player?.id, bio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save bio");
      return data;
    },
    onSuccess: () => {
      toast.success("Bio updated!");
      setBioEditing(false);
      queryClient.invalidateQueries({ queryKey: ["player", username] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

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
        <p className="text-gray-400 mt-2">&ldquo;{username}&rdquo;</p>
      </div>
    );
  }

  const isOwnProfile = session?.user?.name === username;
  const showOnboardingMessage = isOwnProfile && !onboarding.avatarCompleted;

  const isNpc = player.isNpc === 1;
  const viewerOwnsTarget = player.owners?.some(
    (o: { username: string }) => o.username === session?.user?.name
  );
  const bioCost = isNpc ? 1000 : 0;
  const canEditBio =
    isOwnProfile || (isNpc && viewerOwnsTarget);

  const alreadyOwns = player.owners?.some(
    (o: { username: string }) => o.username === session?.user?.name
  );
  const canHire =
    !isOwnProfile && !alreadyOwns && (credits ?? 0) >= player.playerValue;


  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Onboarding Message */}
      {showOnboardingMessage && (
        <div className="bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border border-yellow-500/40 rounded-2xl p-4 text-center shadow-lg">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Camera className="h-5 w-5 text-yellow-400" />
            <p className="text-yellow-200 text-lg font-bold">
              🎯 Change your avatar to unlock Network
            </p>
          </div>
          <p className="text-yellow-300 text-sm">
            Upload a custom profile picture to start your journey!
          </p>
        </div>
      )}

      {/* MAIN HERO CARD — warm sunset vibe */}
      <Card className="relative border-0 bg-transparent overflow-hidden p-0 rounded-3xl">

        {/* HERO: Full-width avatar banner */}
        <div className="relative w-full flex justify-start rounded-t-3xl overflow-hidden py-4">
          <div className="relative w-1/3 aspect-square rounded-lg overflow-hidden">
            {isOwnProfile ? (
              <SquareAvatarUpload
                currentUrl={player.avatarUrl ?? null}
                username={player.username}
                avatarCompleted={onboarding.avatarCompleted}
                variant="banner"
              />
            ) : (
              // Show real avatar only if the viewer has hired this player.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewerOwnsTarget && player.avatarUrl ? player.avatarUrl : "/UNHIRED2.png"}
                alt={player.username}
                className="w-full h-full object-cover"
              />
            )}
            {!isOwnProfile && player.isActive === 0 && (
              <div className="absolute top-3 left-3 bg-red-500/80 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full shadow-lg">
                Inactive
              </div>
            )}
          </div>
        </div>

        {/* IDENTITY SECTION — below avatar */}
        <div className="relative border border-white/10 backdrop-blur-sm bg-gray-950/70 rounded-b-3xl px-5 sm:px-8 py-5 space-y-3">
          {/* Row 1: Username + icons + Hire button */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-2 flex-wrap min-w-0">
              <h1 className="text-xl sm:text-4xl font-black text-white break-all leading-tight">
                {player.username}
              </h1>
              <div className="flex items-center gap-1 mt-1">
                {player.valueFloor >= 100 && (
                  <Gem className="h-6 w-6 sm:h-7 sm:w-7 text-purple-400 shrink-0 drop-shadow-[0_0_8px_rgba(168,85,247,0.7)]" />
                )}
                {player.valueFloor >= 10 && player.valueFloor < 100 && (
                  <Star className="h-6 w-6 sm:h-7 sm:w-7 text-yellow-400 shrink-0 drop-shadow-[0_0_8px_rgba(250,204,21,0.7)]" />
                )}
                {isOwnProfile && (
                  <Badge className="bg-gradient-to-r from-t1-500 to-t2-500 text-white border-0 shrink-0">
                    <Sparkles className="h-3 w-3 mr-1" />
                    You
                  </Badge>
                )}
              </div>
            </div>
            {!isOwnProfile && (
              <div className="shrink-0">
                <HireButton
                  targetId={player.id}
                  targetUsername={player.username}
                  cost={player.playerValue}
                  disabled={!canHire}
                  blockSellUntil={player.blockSellUntil ?? null}
                />
              </div>
            )}
          </div>

          {/* Row 2: Rank badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getValueRankColor(player.playerValue)}`}>
              <TrendingUp className="h-3 w-3" />
              {getValueRank(player.playerValue).title}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${getOwnedRankColor(player.ownedCount)}`}>
              <Swords className="h-3 w-3" />
              {getOwnedRank(player.ownedCount).title}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-gray-300 bg-white/5 border-white/20">
              <Shield className="h-3 w-3" />
              {player.ownerCount} boss{player.ownerCount !== 1 ? "es" : ""}
            </span>
          </div>

          {/* Row 3: Hire status messages */}
          {!isOwnProfile && alreadyOwns && (
            <div className="flex items-center gap-2 text-sm text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              You own this player
            </div>
          )}
          {!isOwnProfile && !alreadyOwns && (credits ?? 0) < player.playerValue && (
            <div className="flex items-center gap-2 text-sm text-red-300">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              Need {formatNumber(player.playerValue - (credits ?? 0))} more credits
            </div>
          )}

          {/* Row 4: Bio section */}
          <div>
            {bioEditing ? (
              <div className="flex flex-col gap-2">
                <textarea
                  className="w-full bg-gray-800/80 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-t1-400"
                  rows={3}
                  maxLength={BIO_MAX}
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  placeholder="Write a short bio…"
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[11px] ${bioDraft.length > BIO_MAX - 10 ? "text-orange-400" : "text-gray-500"}`}>
                    {bioDraft.length}/{BIO_MAX}
                  </span>
                  <div className="flex items-center gap-2">
                    {bioCost > 0 && (
                      <span className="text-[11px] text-amber-400 font-semibold">
                        Costs {bioCost.toLocaleString()}¢
                      </span>
                    )}
                    <button
                      onClick={() => setBioEditing(false)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-white/10 hover:border-white/30 transition-colors"
                    >
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button
                      onClick={() => bioMutation.mutate(bioDraft)}
                      disabled={bioMutation.isPending}
                      className="flex items-center gap-1 text-xs text-white bg-t1-600 hover:bg-t1-500 disabled:opacity-50 px-2 py-1 rounded transition-colors"
                    >
                      <Check className="h-3 w-3" /> Save
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 group/bio">
                {player.bio ? (
                  <p className="text-sm text-gray-300 italic leading-snug flex-1">
                    &ldquo;{player.bio}&rdquo;
                  </p>
                ) : (
                  canEditBio && (
                    <p className="text-xs text-gray-600 italic flex-1">No bio yet.</p>
                  )
                )}
                {canEditBio && (
                  <button
                    onClick={() => { setBioDraft(player.bio ?? ""); setBioEditing(true); }}
                    className="shrink-0 opacity-0 group-hover/bio:opacity-100 transition-opacity text-gray-500 hover:text-t1-400 p-1 rounded"
                    title={bioCost > 0 ? `Edit bio (${bioCost.toLocaleString()}¢)` : "Edit bio"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Own profile: upload action buttons */}
          {isOwnProfile && (
            <SquareAvatarUpload
              currentUrl={player.avatarUrl ?? null}
              username={player.username}
              avatarCompleted={onboarding.avatarCompleted}
              variant="actions"
            />
          )}

          {/* Own profile: boost own value (not for goddesses) */}
          {isOwnProfile && !GODDESS_USERNAMES.includes(player.username) && (
            <BoostValueButton
              targetId={player.id}
              targetUsername={player.username}
              playerValue={player.playerValue}
              className="w-full"
            />
          )}

          {/* Row 5: Meta footer */}
          <div className="flex items-center gap-3 text-[11px] text-gray-500 pt-1">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(player.createdAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </span>
            <span className="w-1 h-1 rounded-full bg-gray-600" />
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {player.lastOnlineAt ? formatLastOnline(player.lastOnlineAt) : "Never seen"}
            </span>
          </div>
        </div>
      </Card>

      {/* Own-profile only: reward countdowns & income history */}
      {isOwnProfile && (
        <>
          <div className="space-y-4">
            {/* Row 1: 3 cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <PortfolioRewardCountdown />
              <RankBonusCountdown />
              <BossIncomeCard userId={player.id} />
            </div>
            {/* Row 2: 2 cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RandomPlayerCountdown />
              <LoginReward />
            </div>
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

      {/* Lost players grid — players that were taken from this profile */}
      <LostPlayersGrid profileUsername={username} />
    </div>
  );
}

/* ─────────── Sub-components ─────────── */
