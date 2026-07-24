"use client";

import { useEffect, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useKnowledgePower } from "@/hooks/useKnowledgePower";
import { useMissionLevel, useFinalGoddessThreshold } from "@/hooks/useMissionLevel";
import { getAvatarSrc, UNHIRED_AVATAR_SRC } from "@/lib/avatar-utils";
import {
  cn,
  formatNumber,
  formatCompact,
} from "@/lib/utils";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { isAgentUsername } from "@/lib/agent/roster";
import { getProfessionImage } from "@/lib/professions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AssignProfessionDialog } from "@/components/AssignProfessionDialog";
import { PermBlockButton } from "@/components/PermBlockButton";
import { PhotoAttribution } from "@/components/PhotoAttribution";
import {
  isLockablePurchaseCard,
  isPurchaseUnlockedAtLevel,
  purchaseUnlockThreshold,
  FINAL_GODDESS_CARD,
} from "@/lib/missions-data";
import {
  Star,
  Gem,
  Loader2,
  Coins,
  BadgeCheck,
  Shield,
  Eye,
  Crown,
  Users,
  Lock,
  Check,
} from "lucide-react";

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
  photoAuthorName,
  photoAuthorUrl,
  photoSourceUrl,
  blockSellUntil,
  permBlockUntil,
  isActive,
  isVerified,
  profession,
  playerType,
  avatarRevealUntil,
  leaderboardMode = false,
  comboSelection,
}: PlayerCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const { hasKnowledge, hasWar } = useKnowledgePower();
  const missionLevel = useMissionLevel();
  const finalGoddessThreshold = useFinalGoddessThreshold();
  const isOwnProfile = session?.user?.name === username;
  // Card belongs to the viewer — all card text takes the "MINE" yellow color.
  const isMine = !!ownerName && ownerName === session?.user?.name;

  const isPurchaseLocked =
    isLockablePurchaseCard(username) &&
    !isPurchaseUnlockedAtLevel(username, missionLevel);
  // The final Goddess threshold is dynamic (5,000 base +1,000 per game won).
  const unlockThreshold =
    username === FINAL_GODDESS_CARD && finalGoddessThreshold !== null
      ? finalGoddessThreshold
      : purchaseUnlockThreshold(username);

  const [flipping, setFlipping] = useState(false);
  const triggerFlip = () => {
    setFlipping(true);
    setTimeout(() => setFlipping(false), 700);
  };

  // Countdown overlay shown on ownerless cards while the GET (purchase)
  // action is processing (~5s). Purely visual — the purchase happens in
  // parallel; when it completes the avatar reveals in place.
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const isAvatarRevealed = avatarRevealUntil ? new Date(avatarRevealUntil) > new Date() : false;

  const getBlockEnd = () => {
    const blockEnd = blockSellUntil ? new Date(blockSellUntil).getTime() : 0;
    const permEnd = permBlockUntil ? new Date(permBlockUntil).getTime() : 0;
    return Math.max(blockEnd, permEnd);
  };

  const isPermBlocked = permBlockUntil ? new Date(permBlockUntil) > new Date() : false;
  const [blockRemainingMs, setBlockRemainingMs] = useState(() =>
    Math.max(0, getBlockEnd() - Date.now())
  );
  const isHireBlocked = blockRemainingMs > 0;
  const isFateSealed = isHireBlocked && blockRemainingMs > 30 * 24 * 60 * 60 * 1000;

  useEffect(() => {
    const getEnd = () => {
      const blockEnd = blockSellUntil ? new Date(blockSellUntil).getTime() : 0;
      const permEnd = permBlockUntil ? new Date(permBlockUntil).getTime() : 0;
      return Math.max(blockEnd, permEnd);
    };
    const update = () => {
      const ms = Math.max(0, getEnd() - Date.now());
      setBlockRemainingMs(ms);
    };
    update();
    const intervalId = setInterval(update, 1000);
    return () => clearInterval(intervalId);
  }, [blockSellUntil, permBlockUntil]);

  const isBonusCard = false;
  const isGoddess = GODDESS_USERNAMES.includes(username);
  const isAgent = isAgentUsername(username);
  const isSpecialCard = isAgent || isGoddess || isBonusCard;
  const avatarFitClass = isSpecialCard ? "object-fill" : "object-cover";

  const hasOwner = (ownerCount ?? 0) > 0;
  const cardClassName = hasOwner
    ? "border-purple-700/60 bg-purple-950/50 hover:bg-purple-900/60 hover:border-purple-600 transition-all duration-200 cursor-pointer group"
    : "border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 cursor-pointer group";

  const effectiveProfession = isBonusCard || isGoddess ? null : profession;
  const professionImage = getProfessionImage(effectiveProfession);

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
    avatarUrl,
    playerId: id,
    playerUsername: username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isGoddess,
    isBonus: isBonusCard,
    isAvatarRevealed: isAvatarRevealed || isBonusCard,
    viewerHasKnowledge: hasKnowledge,
    ownerCount,
  });

  const displayedAvatarSrc =
    resolvedAvatarSrc === UNHIRED_AVATAR_SRC && professionImage
      ? professionImage
      : resolvedAvatarSrc;

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
      setCountdown(null);
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
        toast.success(`You bought ${username}! Their value is now ${data.newValue} 💰`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
        ]);
      }
      setCountdown(null);
    },
  });

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    if (leaderboardMode && !ownerName) setCountdown(5);
    mutation.mutate();
  };

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

  const breakCost =
    isHireBlocked && !isPermBlocked
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
      toast.error(
        `Not enough credits. Need ${formatNumber(totalBreakCost)}¢ (${formatNumber(breakCost)}¢ break fee + ${formatNumber(playerValue)}¢ hire)`
      );
      return;
    }
    play("hire");
    breakMutation.mutate(undefined);
  };

  type ActionMode = "get" | "pump" | "break" | "locked";
  const isOwnedByViewer = ownedIds.has(id);

  const actionMode: ActionMode = isOwnProfile
    ? "locked"
    : isPurchaseLocked
      ? "locked"
      : isOwnedByViewer
        ? "pump"
        : isHireBlocked
          ? isPermBlocked
            ? "locked"
            : "break"
          : "get";

  const actionCost =
    actionMode === "get" || actionMode === "pump"
      ? playerValue
      : actionMode === "break"
        ? totalBreakCost
        : 0;

  const canAffordAction = isBonusCard
    ? true
    : actionMode === "get"
      ? canAfford
      : actionMode === "pump"
        ? (myCredits ?? 0) >= playerValue
        : actionMode === "break"
          ? (myCredits ?? 0) >= totalBreakCost
          : false;

  const isActionPending =
    (actionMode === "get" && mutation.isPending) ||
    (actionMode === "pump" && pumpMutation.isPending) ||
    (actionMode === "break" && breakMutation.isPending);

  const getActionColors = () => {
    if (actionMode === "locked" || !canAffordAction) {
      return { ring: "ring-gray-600", text: "text-gray-400" };
    }
    if (actionMode === "get") return { ring: "ring-green-500", text: "text-green-400" };
    if (actionMode === "pump") return { ring: "ring-fuchsia-500", text: "text-fuchsia-400" };
    if (actionMode === "break") {
      if (isFateSealed) return { ring: "ring-blue-500", text: "text-blue-400" };
      if (hasWar) return { ring: "ring-orange-500", text: "text-orange-400" };
      return { ring: "ring-red-500", text: "text-red-400" };
    }
    return { ring: "ring-gray-600", text: "text-gray-400" };
  };
  const { ring: ringColor, text: actionTextColor } = getActionColors();

  const isAvatarDisabled =
    !isOwnProfile && (actionMode === "locked" || !canAffordAction || isActionPending);

  const handleAvatarAction = (e: React.MouseEvent) => {
    if (isOwnProfile || isPurchaseLocked || !canAffordAction || isActionPending) return;
    e.preventDefault();
    e.stopPropagation();
    if (actionMode === "get") {
      handleBuyClick(e);
    } else if (actionMode === "pump") {
      handlePumpClick(e);
    } else if (actionMode === "break") {
      handleBreakClick(e);
    }
  };

  const avatarTitle = (() => {
    if (isOwnProfile) return "Your profile";
    if (isPurchaseLocked)
      return unlockThreshold !== null
        ? `Own ${formatCompact(unlockThreshold)} cards to unlock`
        : "Locked";
    if (isHireBlocked && isPermBlocked) return "Unbreakable partnership";
    if (!canAffordAction) return `Need ${formatNumber(actionCost)}¢`;
    return undefined;
  })();

  const actionLabel = (() => {
    if (isActionPending) {
      return <Loader2 className="h-4 w-4 animate-spin text-white" />;
    }
    if (isOwnProfile) {
      return (
        <span className="inline-flex items-center gap-1">
          <Eye className="h-3 w-3" />
          VIEW
        </span>
      );
    }
    if (actionMode === "locked") {
      return (
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          LOCKED
        </span>
      );
    }
    const label = actionMode === "get" ? "GET" : actionMode === "pump" ? "PUMP" : "BREAK";
    return (
      <span className="inline-flex items-center gap-1">
        {actionMode === "break" && <Shield className="h-3 w-3" />}
        {label} {formatCompact(actionCost)}¢
      </span>
    );
  })();

  const professionBadge = (() => {
    if (!effectiveProfession) return null;
    if (canCombo) {
      return (
        <button
          onClick={handleComboToggle}
          className={cn(
            "pointer-events-auto w-full inline-flex items-center justify-center gap-1 text-xs font-bold rounded-md border px-2 py-1 transition-colors",
            isComboSelected
              ? "border-amber-400/70 bg-amber-500/15 text-amber-200"
              : isMine
                ? "border-purple-800 bg-transparent text-yellow-300/90 hover:bg-purple-900/30 hover:text-yellow-200"
                : "border-purple-800 bg-transparent text-purple-200 hover:bg-purple-900/30 hover:text-white"
          )}
          title="Tap to add/remove from your 6-profession combo"
        >
          {effectiveProfession}
        </button>
      );
    }
    return (
      <span
        className={cn(
          "w-full inline-flex items-center justify-center gap-1 text-xs font-bold rounded-md border border-purple-800 px-2 py-1",
          isMine ? "text-yellow-300/90" : "text-purple-200/80"
        )}
      >
        {effectiveProfession}
      </span>
    );
  })();

  const canAssignProfession =
    ownedIds.has(id) && !isGoddess && !isAgent && playerType !== "human" && !isOwnProfile;

  const showMeta = effectiveProfession || leaderboardMode;

  return (
    <Card
      onClick={(e) => {
        // Ownerless cards in the browse grid never open the profile page —
        // clicking anywhere on them triggers the GET action instead.
        if (leaderboardMode && !ownerName) {
          handleAvatarAction(e);
          return;
        }
        router.push(`/players/${username}`);
      }}
      className={cn(
        cardClassName,
        "relative overflow-hidden pt-0",
        isComboSelected && "ring-2 ring-amber-400 border-amber-400/60 bg-amber-950/20",
        flipping && "animate-card-flip-y"
      )}
    >
      {flipping && <div className="card-flip-back" />}
      <CardContent className="p-2 relative flex flex-col items-center">
        {/* Header above avatar: username left (vertically centered), badges right */}
        <div className="w-full flex items-center justify-between gap-1.5 mb-1 min-h-[3rem]">
          <div className="min-w-0">
            <h3
              className={cn(
                "font-bold leading-tight break-words flex items-center gap-1 flex-wrap",
                isMine ? "text-yellow-300/90" : "text-white"
              )}
              style={{ fontSize: "clamp(0.87rem, 1.6vw, 1.2rem)" }}
            >
              {username}
              {isVerified === 1 && (
                <BadgeCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              )}
              {valueFloor >= 100 && (
                <Gem className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              )}
              {valueFloor >= 10 && valueFloor < 100 && (
                <Star className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
              )}
            </h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {isComboSelected && (
              <div className="w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            {ownedCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5 border border-t2-500/30 text-t2-300 bg-t2-950/40">
                <Users className="h-3 w-3" />
                Owns {formatCompact(ownedCount)}
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "relative w-full aspect-square rounded-lg overflow-hidden ring-2 transition-all",
            ringColor
          )}
        >
          <button
            type="button"
            aria-disabled={isAvatarDisabled}
            title={avatarTitle}
            onClick={handleAvatarAction}
            className={cn(
              "absolute inset-0 z-0 flex items-center justify-center transition-all focus:outline-none",
              isAvatarDisabled
                ? "cursor-not-allowed opacity-80"
                : "cursor-pointer hover:brightness-110"
            )}
          >
            <Avatar
              className={cn(
                "w-full h-full rounded-lg",
                // Cards the viewer can't afford to act on: avatar 50% darker.
                !isOwnProfile && !canAffordAction && "brightness-50"
              )}
            >
              <AvatarImage
                src={displayedAvatarSrc || undefined}
                alt={username}
                className={cn("w-full h-full", avatarFitClass)}
              />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-2xl sm:text-3xl">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>

          {countdown !== null && countdown > 0 && (
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="absolute inset-0 z-30 flex items-center justify-center cursor-wait"
            >
              <span className="text-6xl font-bold text-white tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]">
                {countdown}
              </span>
            </div>
          )}

          {isActive === 0 && (
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 z-20 bg-red-500/20 text-red-300 border-red-500/30 text-[10px] backdrop-blur-sm pointer-events-none"
            >
              Inactive
            </Badge>
          )}

          {/* Bottom overlay: value and action label */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none">
            <div className="flex flex-wrap items-end justify-between gap-1.5">
              <div className="flex items-center gap-1 text-sm font-bold drop-shadow-sm">
                <Coins className={cn("h-3.5 w-3.5 shrink-0", isMine ? "text-yellow-300/90" : "text-t1-400")} />
                <span className={isMine ? "text-yellow-300/90" : "text-t1-400"}>{formatCompact(playerValue)}¢</span>
              </div>
              <div
                className={cn(
                  "text-sm font-bold drop-shadow-sm inline-flex items-center gap-1",
                  isMine ? "text-yellow-300/90" : actionTextColor
                )}
              >
                {actionLabel}
              </div>
            </div>
          </div>
        </div>

        {canAssignProfession && (
          <AssignProfessionDialog
            targetId={id}
            targetUsername={username}
            currentProfession={effectiveProfession ?? null}
            triggerClassName={cn(
              "w-full mt-2 rounded-md border border-purple-800 bg-transparent hover:bg-purple-900/30 font-bold h-auto px-2 py-1 text-xs",
              isMine
                ? "text-yellow-300/90 hover:text-yellow-200"
                : "text-purple-200 hover:text-white"
            )}
          />
        )}

        {ownedIds.has(id) && !isGoddess && !isAgent && playerType !== "human" && (
          <PermBlockButton
            targetId={id}
            targetUsername={username}
            permBlockUntil={permBlockUntil}
            size="sm"
            className={cn("w-full mt-2", isMine && "text-yellow-300/90 hover:text-yellow-200")}
          />
        )}

        {showMeta && (
          <div className="w-full mt-2 text-center space-y-1">
            {professionBadge && (
              <div className="flex justify-center">{professionBadge}</div>
            )}
            {leaderboardMode && ownerName && (
              <div className="flex flex-col items-center gap-0.5 text-[20px] leading-tight">
                {ownerName !== session?.user?.name && (
                  <span className="text-[10px] font-semibold tracking-widest text-white/70 uppercase leading-none">
                    Belongs to
                  </span>
                )}
                <span
                  className={cn(
                    "flex items-center gap-2 justify-center max-w-full min-w-0",
                    ownerName === session?.user?.name ? "text-yellow-300/90" : "text-white"
                  )}
                >
                  <Crown className="h-5 w-5 shrink-0" />
                  <span className="truncate">
                    {ownerName === session?.user?.name ? "MINE" : ownerName}
                  </span>
                </span>
              </div>
            )}
            {leaderboardMode && !ownerName && (
              <div className="flex flex-col items-center gap-1 text-[20px] leading-tight">
                <span className="flex items-center gap-2 justify-center text-white max-w-full min-w-0">
                  <Crown className="h-5 w-5 shrink-0" />
                  <span className="truncate">LOST</span>
                </span>
              </div>
            )}
          </div>
        )}

        {leaderboardMode && (
          <PhotoAttribution
            authorName={photoAuthorName}
            authorUrl={photoAuthorUrl}
            sourceUrl={photoSourceUrl}
            className="mt-1 justify-center"
          />
        )}

      </CardContent>
    </Card>
  );
}

export const PlayerCard = memo(PlayerCardImpl);
