"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, Gem, ShoppingCart, Loader2, Coins, BadgeCheck, Shield, Eye, Crown, Users, Lock, Clock } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useEffect, useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useKnowledgePower } from "@/hooks/useKnowledgePower";
import { getAvatarSrc, UNHIRED_AVATAR_SRC } from "@/lib/avatar-utils";
import { formatNumber, formatCompact, getDynamicFontSize, navbarBtnStyle, formatLastOnline } from "@/lib/utils";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { isAgentUsername } from "@/lib/agent/roster";
import { getProfessionImage } from "@/lib/professions";
import { PhotoAttribution } from "@/components/PhotoAttribution";
import { BlockCountdownBar } from "@/components/BlockCountdownBar";
import { AssignProfessionDialog } from "@/components/AssignProfessionDialog";
import { PermBlockButton } from "@/components/PermBlockButton";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { isLockablePurchaseCard, isPurchaseUnlockedAtLevel, purchaseUnlockThreshold } from "@/lib/missions-data";
import { memo } from "react";

function formatTimeRemaining(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

interface PlayerCardProps {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  valueFloor?: number;
  ownerCount?: number;
  ownedCount?: number;
  credits?: number;
  portfolioValue?: number;
  blockSellUntil?: string | Date | null;
  permBlockUntil?: string | Date | null;
  estimatedDeletionAt?: string | Date | null;
  isActive?: number;
  lastOnlineAt?: string | Date | null;
  totalOnlineMinutes?: number;
  createdAt?: string | Date | null;
  isVerified?: number;
  playerType?: string;
  photoAuthorName?: string | null;
  photoAuthorUrl?: string | null;
  photoSourceUrl?: string | null;
  photoScore?: number;
  lastRankBonusAt?: string | Date | null;
  ownerName?: string | null;
  ownerValue?: number | null;
  purchaseCount?: number;
  bio?: string | null;
  profession?: string | null;
  avatarRevealUntil?: string | Date | null;
  onboardingComplete?: number;
  onRevealed?: (avatarUrl: string | null, username: string, avatarRevealUntil: string | null) => void;
  actionsOnly?: boolean;
  leaderboardMode?: boolean;
  comboSelection?: {
    isSelected: (playerId: number) => boolean;
    onToggle: (
      player: {
        playerId: number;
        username: string;
        playerValue: number;
        avatarUrl: string | null;
        isNpc: number;
        valueFloor: number;
      },
      profession: string
    ) => boolean;
  };
}

function PlayerCardImpl({
  id,
  username,
  avatarUrl,
  playerValue,
  valueFloor = 1,
  ownerCount,
  ownedCount = 0,
  ownerName,
  ownerValue,
  photoScore = 0,
  photoAuthorName,
  photoAuthorUrl,
  photoSourceUrl,
  blockSellUntil,
  permBlockUntil,
  isActive,
  isVerified,
  profession,
  playerType,
  lastOnlineAt,
  avatarRevealUntil,
  onRevealed,
  actionsOnly = false,
  leaderboardMode = false,
  comboSelection,
}: PlayerCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const { hasKnowledge, hasWar } = useKnowledgePower();
  const missionLevel = useMissionLevel();
  const isOwnProfile = session?.user?.name === username;

  // Goddesses (and the 3 passive bonus cards) are locked for purchase until the
  // player completes the mission that awards them. Show a locked state on the
  // buy button instead of GET while it's still blocked for this viewer.
  const isPurchaseLocked =
    isLockablePurchaseCard(username) &&
    !isPurchaseUnlockedAtLevel(username, missionLevel);
  const unlockThreshold = purchaseUnlockThreshold(username);
  const [isAvatarTempRevealed, setIsAvatarTempRevealed] = useState(false);
  const [tempRevealedAvatarUrl, setTempRevealedAvatarUrl] = useState<string | null>(null);

  // One-shot Y-axis 360° flip animation triggered when an action (GET, Pump,
  // Break, Reveal, 6h hire) succeeds. The class is applied for the animation
  // duration, then removed so it can replay on the next action.
  const [flipping, setFlipping] = useState(false);
  const triggerFlip = () => {
    setFlipping(true);
    setTimeout(() => setFlipping(false), 700);
  };

  const isAvatarRevealed = avatarRevealUntil ? new Date(avatarRevealUntil) > new Date() : false;

  const getBlockEnd = () => {
    const blockEnd = blockSellUntil ? new Date(blockSellUntil).getTime() : 0;
    const permEnd = permBlockUntil ? new Date(permBlockUntil).getTime() : 0;
    return Math.max(blockEnd, permEnd);
  };

  const isHireBlocked = getBlockEnd() > Date.now();
  const isPermBlocked = permBlockUntil ? new Date(permBlockUntil) > new Date() : false;
  const [blockCountdown, setBlockCountdown] = useState<string>("");
  const [blockRemainingMs, setBlockRemainingMs] = useState<number>(0);
  // Fate seals use a far-future timestamp (year 2099). Normal blocks max at 12h.
  const isFateSealed = isHireBlocked && blockRemainingMs > 30 * 24 * 60 * 60 * 1000;
  useEffect(() => {
    if (!isHireBlocked) return;
    const update = () => {
      const ms = Math.max(0, getBlockEnd() - Date.now());
      setBlockRemainingMs(ms);
      setBlockCountdown(formatTimeRemaining(new Date(getBlockEnd())) ?? "");
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [blockSellUntil, permBlockUntil, isHireBlocked]);
  
  // Bonus cards have been removed from the game — no player is ever a bonus card.
  const isBonusCard = false;
  const isGoddess = GODDESS_USERNAMES.includes(username);
  const isAgent = isAgentUsername(username);
  // Special cards (Agent, Goddesses, bonus) use fill to stretch their art to
  // fill the avatar space without cropping — distortion is acceptable.
  const isSpecialCard = isAgent || isGoddess || isBonusCard;
  const avatarFitClass = isSpecialCard ? "object-fill" : "object-cover";
  const effectiveAvatarUrl = tempRevealedAvatarUrl ?? avatarUrl;

  // Owned (acquired) players get a purple card background to stand out from the
  // default dark-blue of ownerless players.
  const hasOwner = (ownerCount ?? 0) > 0;
  const cardClassName = hasOwner
    ? "border-purple-700/60 bg-purple-950/50 hover:bg-purple-900/60 hover:border-purple-600 transition-all duration-200 cursor-pointer group"
    : "border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 cursor-pointer group";

  // Goddess and bonus cards never have a profession
  const effectiveProfession = isBonusCard || isGoddess ? null : profession;
  const professionImage = getProfessionImage(effectiveProfession);

  // Profession-combo selection (market browse view). When active, clicking an
  // OWNED player with a profession toggles them into the combo slot for that
  // profession instead of navigating to their profile. Only owned players can
  // be added to a combo (the combo sells YOUR players), so it's gated on
  // ownership here.
  const isComboSelected = comboSelection?.isSelected(id) ?? false;
  const canCombo = !!comboSelection && !!effectiveProfession && ownedIds.has(id);
  const handleComboToggle = (e: React.MouseEvent) => {
    if (!canCombo || !comboSelection || !effectiveProfession) return;
    e.preventDefault();
    e.stopPropagation();
    comboSelection.onToggle(
      {
        playerId: id,
        username,
        playerValue,
        avatarUrl,
        isNpc: playerType && playerType !== "human" ? 1 : 0,
        valueFloor,
      },
      effectiveProfession
    );
  };

  const resolvedAvatarSrc = getAvatarSrc({
    avatarUrl: effectiveAvatarUrl,
    playerId: id,
    playerUsername: username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isGoddess,
    isAvatarRevealed: isAvatarRevealed || isAvatarTempRevealed || isBonusCard,
    viewerHasKnowledge: hasKnowledge,
    ownerCount,
  });

  const displayedAvatarSrc = (resolvedAvatarSrc === UNHIRED_AVATAR_SRC && professionImage)
    ? professionImage
    : resolvedAvatarSrc;

  // Whether the avatar currently shown is an Unsplash photo. When it isn't
  // (masked placeholder, profession art, goddess/AGI image, uploaded avatar),
  // we surface a "View full image" link so people can open it at full size.
  const isShowingUnsplashPhoto =
    !!photoSourceUrl && displayedAvatarSrc === effectiveAvatarUrl;
  const showFullImageLink = !isShowingUnsplashPhoto && !!displayedAvatarSrc;

  const canAfford = isBonusCard || (myCredits ?? 0) >= playerValue;
  const { play } = useSound();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - playerValue : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          `You bought ${username}! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
        ]);
      }
    },
  });

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    mutation.mutate();
  };

  // Pump: an owner spends 100% of the card's current value to double it. The
  // spent credits are gifted to the pumped player. Replaces the GET button on
  // cards the viewer already owns.
  const pumpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pump failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - playerValue : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      toast.success(`🚀 Pumped ${username}! Value → ${formatNumber(data.newValue)}¢`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
  });

  const handlePumpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    pumpMutation.mutate();
  };

  const mutation6h = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id, blockDurationHours: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - playerValue * 6 : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          `You bought ${username} with 18-minute block! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
        ]);
      }
    },
  });

  const handle6hBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((myCredits ?? 0) < playerValue * 6) {
      toast.error(`Not enough credits. Need ${formatNumber(playerValue * 6)}¢ (6x player value)`);
      return;
    }
    const ok = window.confirm(
      `Hire ${username} with 18-minute sell block?\n\n` +
      `• Cost: ${formatNumber(playerValue * 6)}¢ (6x player value)\n` +
      `• They will be blocked from being sold for 18 minutes\n` +
      `• This helps secure your investment`
    );
    if (!ok) return;
    play("hire");
    mutation6h.mutate();
  };

  const revealMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/reveal-avatar-short", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reveal avatar");
      return data;
    },
    onSuccess: (data) => {
      triggerFlip();
      toast.success(`Revealed ${username}'s avatar for 1 minute! 👁️`);
      const revealedAvatarUrl = data.targetAvatarUrl ?? avatarUrl;
      setIsAvatarTempRevealed(true);
      setTempRevealedAvatarUrl(revealedAvatarUrl);
      onRevealed?.(revealedAvatarUrl, username, data.avatarRevealUntil ?? null);
      setTimeout(() => {
        setIsAvatarTempRevealed(false);
        setTempRevealedAvatarUrl(null);
      }, 60000);
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Break cost: 1000× value for Fate-sealed players (War does NOT waive this).
  // Normal: ceil(hoursRemaining) × playerValue. War: 0.
  // Perm blocks are unbreakable, so the break button is disabled.
  const breakCost = isHireBlocked && !isPermBlocked
    ? isFateSealed
      ? playerValue * 1000
      : hasWar
        ? 0
        : Math.ceil(blockRemainingMs / (60 * 60 * 1000)) * playerValue
    : 0;
  const totalBreakCost = isPermBlocked ? 0 : breakCost + playerValue;

  const breakMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/break-partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to break partnership");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - totalBreakCost : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(`Partnership broken! You hired ${username}! Their value is now ${data.newValue} 💰`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
        ]);
      }
    },
  });

  const handleBreakClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPermBlocked) {
      toast.error("This partnership is unbreakable.");
      return;
    }
    if ((myCredits ?? 0) < totalBreakCost) {
      toast.error(`Not enough credits. Need ${formatNumber(totalBreakCost)}¢ (${formatNumber(breakCost)}¢ break fee + ${formatNumber(playerValue)}¢ hire)`);
      return;
    }
    play("hire");
    breakMutation.mutate(undefined);
  };

  const revealCostRate = isHireBlocked ? 0.2 : 0.1;
  const revealCost = Math.round(playerValue * revealCostRate * 100) / 100;

  const handleRevealClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((myCredits ?? 0) < revealCost) {
      toast.error(`Not enough credits. Need ${formatNumber(revealCost)}¢ (${Math.round(revealCostRate * 100)}% of player value)`);
      return;
    }
    play("hire");
    revealMutation.mutate();
  };

  const professionBadge = effectiveProfession && professionImage ? (
    <div className="flex flex-col items-center gap-1">
      <div className="rounded-md overflow-hidden ring-1 ring-amber-500/40 bg-black/50 shrink-0 aspect-video" style={{width:'clamp(3rem,8vw,5rem)'}} title={effectiveProfession}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={professionImage} alt={effectiveProfession} loading="lazy" className="w-full h-full object-contain p-0.5" />
      </div>
      {ownedIds.has(id) && !isGoddess && !isOwnProfile && (
        <AssignProfessionDialog targetId={id} targetUsername={username} currentProfession={effectiveProfession} />
      )}
    </div>
  ) : ownedIds.has(id) && !isGoddess && !isOwnProfile ? (
    <div className="flex flex-col items-center gap-1">
      <AssignProfessionDialog targetId={id} targetUsername={username} currentProfession={null} />
    </div>
  ) : null;

  const actionButtons = !isOwnProfile ? (
    <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
      <div className="flex flex-row items-end gap-2 flex-wrap justify-end">
      {isHireBlocked ? (
        <>
          <div className={`px-2 rounded-md flex flex-col items-center justify-center gap-0.5 text-center aspect-video ${
            isFateSealed
              ? "bg-indigo-950/60 border border-indigo-500/40 text-indigo-400"
              : isPermBlocked
                ? "bg-red-950/60 border border-red-500/40 text-red-400"
                : "bg-amber-950/60 border border-amber-500/40 text-amber-400"
          }`} style={{width:'clamp(3rem,8vw,5rem)'}}>
            <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="text-[8px] sm:text-[9px] leading-none font-bold">{isFateSealed ? "Fate Seal" : isPermBlocked ? "Unbreakable" : "Partnered"}</span>
            <span className="text-[8px] sm:text-[9px] leading-none tabular-nums">{isFateSealed ? "🔒" : blockCountdown}</span>
          </div>
          <div className="flex flex-row flex-wrap justify-end gap-2">
            {!ownedIds.has(id) && !isAvatarTempRevealed && !isAvatarRevealed && !isBonusCard && !hasKnowledge && (
              <Button
                onClick={handleRevealClick}
                disabled={revealMutation.isPending || (myCredits ?? 0) < revealCost}
                className={`p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap aspect-video ${
                  (myCredits ?? 0) >= revealCost
                    ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                }`}
              style={{...((myCredits ?? 0) >= revealCost ? navbarBtnStyle : {}), width:'clamp(3rem,8vw,5rem)'}}
              >
                {revealMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Eye className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                    <span className="text-[9px] sm:text-[10px] leading-none">Reveal 2x</span>
                    <span className={`leading-none mt-0.5 ${getDynamicFontSize(revealCost)}`}>
                      {formatCompact(revealCost)}¢
                    </span>
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={handleBreakClick}
              disabled={breakMutation.isPending || isPermBlocked || (myCredits ?? 0) < totalBreakCost || isBonusCard}
              className={`p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap aspect-video ${
                (myCredits ?? 0) >= totalBreakCost && !isBonusCard && !isPermBlocked
                  ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
              style={{...((myCredits ?? 0) >= totalBreakCost && !isBonusCard && !isPermBlocked ? navbarBtnStyle : {}), width:'clamp(3rem,8vw,5rem)'}}
            >
              {breakMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isBonusCard ? (
                <>
                  <Shield className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                  <span className="text-[8px] sm:text-[9px] leading-none">Unbreakable</span>
                  <span className="text-[8px] sm:text-[9px] leading-none">Block</span>
                </>
              ) : isPermBlocked ? (
                <>
                  <Shield className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                  <span className="text-[8px] sm:text-[9px] leading-none">Unbreakable</span>
                  <span className="text-[8px] sm:text-[9px] leading-none">{blockCountdown}</span>
                </>
              ) : (
                <>
                  <Shield className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                  <span className="text-[8px] sm:text-[9px] leading-none">{isFateSealed ? "Fate Break" : hasWar ? "Free Break" : "Break"}</span>
                  <span className={`leading-none mt-0.5 ${getDynamicFontSize(totalBreakCost)}`}>
                    {formatCompact(totalBreakCost)}¢
                  </span>
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* Left column: profession badge above Hire 1h */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            {professionBadge}
            <Button
              onClick={handleBuyClick}
              disabled={!canAfford || mutation.isPending}
              className={`p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap aspect-video ${
                canAfford
                  ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
              style={{...(canAfford ? navbarBtnStyle : {}), width:'clamp(3rem,8vw,5rem)'}}
            >
              {mutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : isBonusCard ? (
                <>
                  <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                  <span className="text-[9px] sm:text-[10px] leading-none">Hire 3h</span>
                  <span className="text-[9px] sm:text-[10px] leading-none">Block</span>
                  <span className="text-[9px] sm:text-[10px] leading-none mt-0.5 text-purple-300">Free</span>
                </>
              ) : (
                <>
                  <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                  <span className="text-[9px] sm:text-[10px] leading-none">Hire 3m</span>
                  <span className="text-[9px] sm:text-[10px] leading-none">Block</span>
                  <span className={`leading-none mt-0.5 ${getDynamicFontSize(playerValue)}`}>
                    {formatCompact(playerValue)}¢
                  </span>
                </>
              )}
            </Button>
          </div>
          {/* Right column: Reveal above Hire 6h */}
          {!GODDESS_USERNAMES.includes(username) && !isBonusCard && (
          <div className="flex flex-col gap-2 shrink-0">
            {!ownedIds.has(id) && !isAvatarTempRevealed && !isAvatarRevealed && !isBonusCard && !hasKnowledge && (
              <Button
                onClick={handleRevealClick}
                disabled={revealMutation.isPending || (myCredits ?? 0) < playerValue * 0.1}
                className={`p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap aspect-video ${
                  (myCredits ?? 0) >= playerValue * 0.1
                    ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                }`}
                style={{...((myCredits ?? 0) >= playerValue * 0.1 ? navbarBtnStyle : {}), width:'clamp(3rem,8vw,5rem)'}}
              >
                {revealMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Eye className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                    <span className="text-[9px] sm:text-[10px] leading-none">Reveal</span>
                    <span className={`leading-none mt-0.5 ${getDynamicFontSize(playerValue * 0.1)}`}>
                      {formatCompact(Math.round(playerValue * 0.1 * 100) / 100)}¢
                    </span>
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={handle6hBuyClick}
              disabled={(myCredits ?? 0) < playerValue * 6 || mutation6h.isPending}
              className={`p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap aspect-video ${
                (myCredits ?? 0) >= playerValue * 6
                  ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
              style={{...((myCredits ?? 0) >= playerValue * 6 ? navbarBtnStyle : {}), width:'clamp(3rem,8vw,5rem)'}}
            >
              {mutation6h.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                  <span className="text-[9px] sm:text-[10px] leading-none">Hire 18m</span>
                  <span className="text-[9px] sm:text-[10px] leading-none">Block</span>
                  <span className={`leading-none mt-0.5 ${getDynamicFontSize(playerValue * 6)}`}>
                    {formatCompact(playerValue * 6)}¢
                  </span>
                </>
              )}
            </Button>
          </div>
          )}
        </>
      )}
      </div>
    </div>
  ) : null;

  if (actionsOnly) {
    return actionButtons;
  }

  if (leaderboardMode) {
    return (
      <Link href={`/players/${username}`}>
        <Card className={`${cardClassName} relative ${isComboSelected ? "ring-2 ring-amber-400 border-amber-400/60 bg-amber-950/20" : ""} ${flipping ? "animate-card-flip-y" : ""}`}>
          {flipping && <div className="card-flip-back" />}
          {isComboSelected && (
            <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
          <CardContent className="p-2.5 relative flex flex-col items-center gap-1.5">
            {/* "Owns N" badge — always shown above the avatar so all cards
                match visually regardless of whether they own other cards. */}
            <div className="w-full flex justify-center">
              <span className={`inline-flex items-center gap-1.5 text-2xl font-bold rounded-full px-3 py-1 border ${
                ownedCount > 0
                  ? "text-t2-400 bg-t2-950/40 border-t2-500/30"
                  : "text-gray-600 bg-gray-950/40 border-gray-800"
              }`}>
                <Users className="h-6 w-6 shrink-0" />
                Owns {formatCompact(ownedCount)}
              </span>
            </div>

            <div className="relative w-full">
              <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
                <AvatarImage src={displayedAvatarSrc} alt={username} className={avatarFitClass} />
                <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-3xl sm:text-4xl">
                  {username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {isActive === 0 && (
                <Badge variant="secondary" className="absolute top-2 left-2 bg-red-500/20 text-red-300 border-red-500/30 text-[10px] backdrop-blur-sm">
                  Inactive
                </Badge>
              )}
            </div>

            <div className="w-full text-center">
              <h3 className="font-bold text-white group-hover:text-t1-400 transition-colors leading-tight break-words flex items-center justify-center gap-1.5 flex-wrap" style={{ fontSize: "clamp(0.7rem, 1.3vw, 1.05rem)" }}>
                {username}
                {isVerified === 1 && (<BadgeCheck className="h-5 w-5 text-blue-400 shrink-0" />)}
                {valueFloor >= 100 && (<Gem className="h-5 w-5 text-purple-400 shrink-0" />)}
                {valueFloor >= 10 && valueFloor < 100 && (<Star className="h-5 w-5 text-yellow-400 shrink-0" />)}
              </h3>
              {/* The profession name is the combo toggle (owned players only);
                  clicking anywhere else on the card opens the profile. */}
              {canCombo ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleComboToggle}
                  className={`inline-flex items-center gap-1.5 text-xs mt-1 rounded-full border px-3 py-1 cursor-pointer transition-colors ${
                    isComboSelected
                      ? "border-amber-400/70 bg-amber-500/15 text-amber-200"
                      : "border-amber-500/40 text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-200"
                  }`}
                  title="Tap to add/remove from your 6-profession combo"
                >
                  {effectiveProfession}
                </span>
              ) : effectiveProfession ? (
                <span className="inline-flex items-center gap-1.5 text-xs mt-1 rounded-full border border-gray-700 px-3 py-1 text-gray-400">
                  {effectiveProfession}
                </span>
              ) : !isGoddess && !isBonusCard && !isOwnProfile ? (
                ownedIds.has(id) ? (
                  <AssignProfessionDialog
                    targetId={id}
                    targetUsername={username}
                    currentProfession={null}
                    triggerClassName="mt-1 rounded-full border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 h-auto px-3 py-1 text-xs"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs mt-1 rounded-full border border-gray-700/70 px-3 py-1 text-gray-500">
                    No Profession
                  </span>
                )
              ) : null}
            </div>

            {ownedIds.has(id) ? (
              <>
                <Button
                  onClick={handlePumpClick}
                  disabled={(myCredits ?? 0) < playerValue || pumpMutation.isPending}
                  className={`w-[85%] aspect-video h-auto rounded-md flex flex-col items-center justify-center gap-0.5 font-bold ${
                    (myCredits ?? 0) >= playerValue
                      ? "text-white bg-transparent border-2 border-fuchsia-500 hover:bg-fuchsia-500/15 shadow-lg shadow-purple-900/30"
                      : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
                  }`}
                >
                  {pumpMutation.isPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <span className="text-xs sm:text-sm leading-none">PUMP</span>
                      <span style={{ fontSize: "clamp(0.55rem, 1vw, 0.7rem)" }}>
                        {formatCompact(playerValue)}¢
                      </span>
                    </>
                  )}
                </Button>
                <PermBlockButton
                  targetId={id}
                  targetUsername={username}
                  permBlockUntil={permBlockUntil}
                  size="sm"
                  className="w-[85%]"
                />
              </>
            ) : isPurchaseLocked ? (
              // locked
              <div
                className="w-[85%] aspect-video rounded-md flex flex-col items-center justify-center gap-0.5 border border-gray-700 bg-gray-800/70 text-gray-300"
                title={unlockThreshold !== null ? `Own ${formatCompact(unlockThreshold)} cards to unlock` : "Locked"}
              >
                <span className="flex items-center gap-1 text-xs sm:text-sm font-bold leading-none">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
                {unlockThreshold !== null && (
                  <span className="text-center leading-tight px-1" style={{ fontSize: "clamp(0.5rem, 0.9vw, 0.65rem)" }}>
                    {formatCompact(unlockThreshold)} cards to unlock
                  </span>
                )}
              </div>
            ) : !isOwnProfile && !isHireBlocked ? (
              <Button
                onClick={handleBuyClick}
                disabled={!canAfford || mutation.isPending}
                className={`w-[85%] aspect-video h-auto rounded-md flex flex-col items-center justify-center gap-0.5 font-bold ${
                  canAfford
                    ? "text-white bg-transparent border-2 border-green-500 hover:bg-green-500/15 shadow-lg shadow-green-900/30"
                    : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : isBonusCard ? (
                  <span className="text-xs sm:text-sm leading-none">GET</span>
                ) : (
                  <>
                    <span className="text-xs sm:text-sm leading-none">GET</span>
                    <span style={{ fontSize: "clamp(0.55rem, 1vw, 0.7rem)" }}>
                      {formatCompact(playerValue)}¢
                    </span>
                  </>
                )}
              </Button>
            ) : null}

            {/* Sell/hire block countdown + break button — a pumped (or otherwise
                blocked) player can't be sold or hired until this runs out.
                Shows a break button so viewers can break the partnership. */}
            {isHireBlocked && (blockSellUntil || permBlockUntil) && (
              <div className="w-[85%] flex flex-col items-center gap-1">
                <div className={`w-full flex flex-col items-center gap-1 rounded-md border py-1 px-2 ${
                  isFateSealed
                    ? "bg-indigo-950/50 border-indigo-500/30"
                    : isPermBlocked
                      ? "bg-red-950/50 border-red-500/30"
                      : "bg-amber-950/50 border-amber-500/30"
                }`}>
                  <span className={`flex items-center gap-1 text-[10px] sm:text-xs font-bold leading-none tabular-nums ${
                    isFateSealed ? "text-indigo-400" : isPermBlocked ? "text-red-400" : "text-amber-400"
                  }`}>
                    <Shield className="h-3 w-3" />
                    {isFateSealed ? "Fate Seal" : isPermBlocked ? "Unbreakable" : blockCountdown}
                  </span>
                  {!isFateSealed && !isPermBlocked && blockSellUntil && (
                    <BlockCountdownBar blockSellUntil={blockSellUntil} className="w-[85%]" />
                  )}
                </div>
                {!ownedIds.has(id) && (
                  <Button
                    onClick={handleBreakClick}
                    disabled={breakMutation.isPending || isPermBlocked || (myCredits ?? 0) < totalBreakCost}
                    className={`w-full aspect-video h-auto rounded-md flex flex-col items-center justify-center gap-0.5 font-bold ${
                      (myCredits ?? 0) >= totalBreakCost && !isPermBlocked
                        ? isFateSealed
                          ? "text-white bg-transparent border-2 border-blue-500 hover:bg-blue-500/15 shadow-lg shadow-blue-900/30"
                          : hasWar
                            ? "text-white bg-transparent border-2 border-orange-500 hover:bg-orange-500/15 shadow-lg shadow-red-900/30"
                            : "text-white bg-transparent border-2 border-red-500 hover:bg-red-500/15 shadow-lg shadow-amber-900/30"
                        : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {breakMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isPermBlocked ? (
                      <>
                        <div className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          <span className="text-[10px] sm:text-xs leading-none">Unbreakable</span>
                        </div>
                        <span style={{ fontSize: "clamp(0.55rem, 1vw, 0.7rem)" }}>
                          {blockCountdown}
                        </span>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          <span className="text-[10px] sm:text-xs leading-none">{isFateSealed ? "Fate Break" : hasWar ? "Free Break" : "Break"}</span>
                        </div>
                        <span style={{ fontSize: "clamp(0.55rem, 1vw, 0.7rem)" }}>
                          {formatCompact(totalBreakCost)}¢
                        </span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {/* Remaining info — below the action buttons so buttons stay aligned
                across cards regardless of how much extra info each card has. */}
            <div className="w-full text-center">
              <p className="text-[10px] font-semibold text-gray-300">
                {isAgent ? "AGI" : playerType === "human" ? "Human" : "NPC"}
              </p>
              {/* Last online timestamp */}
              {lastOnlineAt && (
                <p className="flex items-center justify-center gap-1 text-[9px] text-gray-500 mt-0.5 leading-none">
                  <Clock className="h-2.5 w-2.5 shrink-0" />
                  {formatLastOnline(lastOnlineAt)}
                </p>
              )}
              {/* Photo score (Unsplash likes proxy — "how good the photo looks"). */}
              <p className="mt-0.5 flex items-center justify-center gap-1 text-[10px] font-semibold text-amber-300/90 leading-none">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400 shrink-0" />
                Score {formatCompact(photoScore)}
              </p>
              {/* Owner name (their boss). "Owns N" is now above the avatar. */}
              {ownerName && (
                <div className="mt-1 flex flex-col items-center gap-0.5 text-[10px] leading-tight">
                  <span className="flex items-center gap-1 justify-center text-yellow-300/90 max-w-full min-w-0">
                    <Crown className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">
                      {ownerName}
                      {ownerValue !== null && ownerValue !== undefined
                        ? ` (${formatCompact(ownerValue)}¢)`
                        : ""}
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Unsplash photo credit — at the very bottom of the card. */}
            <PhotoAttribution
              authorName={photoAuthorName}
              authorUrl={photoAuthorUrl}
              sourceUrl={photoSourceUrl}
              className="max-w-full"
            />
            {/* Non-Unsplash avatars (masked placeholder, profession art,
                goddess/AGI image, uploaded avatar) get a "View full image"
                link so the full-resolution art is reachable. */}
            {showFullImageLink && (
              <a
                href={displayedAvatarSrc}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-1 inline-flex items-center gap-1 text-[10px] text-gray-400 underline-offset-2 hover:text-t1-300 hover:underline"
              >
                <Eye className="h-3 w-3 shrink-0" />
                View full image
              </a>
            )}
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/players/${username}`}>
      <Card className={`${cardClassName} relative ${isComboSelected ? "ring-2 ring-amber-400 border-amber-400/60 bg-amber-950/20" : ""} ${flipping ? "animate-card-flip-y" : ""}`}>
        {flipping && <div className="card-flip-back" />}
        {isComboSelected && (
          <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        <CardContent className="p-2.5 relative">
          {/* "Owns N" badge — always shown above the avatar for consistent
              avatar position across all cards. */}
          <div className="w-full flex justify-center mb-1.5">
            <span className={`inline-flex items-center gap-1.5 text-2xl font-bold rounded-full px-3 py-1 border ${
              ownedCount > 0
                ? "text-t2-400 bg-t2-950/40 border-t2-500/30"
                : "text-gray-600 bg-gray-950/40 border-gray-800"
            }`}>
              <Users className="h-6 w-6 shrink-0" />
              Owns {formatCompact(ownedCount)}
            </span>
          </div>
          <div className="relative mb-2">
            <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
              <AvatarImage src={displayedAvatarSrc} alt={username} className={avatarFitClass} />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-3xl sm:text-4xl">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isActive === 0 && (
              <Badge variant="secondary" className="absolute top-2 left-2 bg-red-500/20 text-red-300 border-red-500/30 text-[10px] backdrop-blur-sm">
                Inactive
              </Badge>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-bold text-white group-hover:text-t1-400 transition-colors leading-tight break-words text-left flex items-center justify-start gap-1.5 flex-wrap" style={{ fontSize: "clamp(0.7rem, 1.3vw, 1.05rem)" }}>
                {username}
                {isVerified === 1 && (<BadgeCheck className="h-5 w-5 text-blue-400 shrink-0" />)}
                {valueFloor >= 100 && (<Gem className="h-5 w-5 text-purple-400 shrink-0" />)}
                {valueFloor >= 10 && valueFloor < 100 && (<Star className="h-5 w-5 text-yellow-400 shrink-0" />)}
              </h3>
              {canCombo ? (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleComboToggle}
                  className={`inline-flex items-center gap-1.5 text-sm mt-1 rounded-full border px-4 py-1.5 cursor-pointer transition-colors ${
                    isComboSelected
                      ? "border-amber-400/70 bg-amber-500/15 text-amber-200"
                      : "border-amber-500/40 text-amber-300/90 hover:bg-amber-500/10 hover:text-amber-200"
                  }`}
                  title="Tap to add/remove from your 6-profession combo"
                >
                  {effectiveProfession}
                </span>
              ) : effectiveProfession ? (
                <span className="inline-flex items-center gap-1.5 text-sm mt-1 rounded-full border border-gray-700 px-4 py-1.5 text-gray-400">
                  {effectiveProfession}
                </span>
              ) : !isGoddess && !isBonusCard && !isOwnProfile ? (
                ownedIds.has(id) ? (
                  <AssignProfessionDialog
                    targetId={id}
                    targetUsername={username}
                    currentProfession={null}
                    triggerClassName="mt-1 rounded-full border border-amber-500/50 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 h-auto px-4 py-1.5 text-sm"
                  />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm mt-1 rounded-full border border-gray-700/70 px-4 py-1.5 text-gray-500">
                    No Profession
                  </span>
                )
              ) : null}

              <div className={`flex items-center gap-1 mt-1.5 ${getDynamicFontSize(playerValue)}`}>
                <Coins className="h-3.5 w-3.5 text-t1-400 shrink-0" />
                <span className="text-t1-400 font-bold">{formatCompact(playerValue)}¢</span>
              </div>
              {/* Last online timestamp */}
              {lastOnlineAt && (
                <p className="flex items-center gap-1 text-[10px] text-gray-500 mt-0.5 leading-none">
                  <Clock className="h-2.5 w-2.5 shrink-0" />
                  {formatLastOnline(lastOnlineAt)}
                </p>
              )}
            </div>

            {!isOwnProfile && (
            <div className="shrink-0 w-full sm:w-auto flex justify-end">
              {actionButtons}
            </div>
          )}
          </div>

          {/* Non-Unsplash avatars (masked placeholder, profession art,
              goddess/AGI image, uploaded avatar) get a "View full image"
              link so the full-resolution art is reachable. */}
          {showFullImageLink && (
            <a
              href={displayedAvatarSrc}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 text-[10px] text-gray-400 underline-offset-2 hover:text-t1-300 hover:underline"
            >
              <Eye className="h-3 w-3 shrink-0" />
              View full image
            </a>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// Memoized export — prevents re-rendering all 90 cards when a parent component
// re-renders due to unrelated state changes (navbar polls, etc.). The internal
// hooks (useCredits, useOwnedPlayerIds, etc.) still update independently when
// their query data changes.
export const PlayerCard = memo(PlayerCardImpl);
