"use client";

import { useEffect, useRef, useState, memo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useKnowledgePower } from "@/hooks/useKnowledgePower";
import { useMissionLevel, useFinalGoddessThreshold } from "@/hooks/useMissionLevel";
import { useNow } from "@/hooks/useNow";
import { useLanguage } from "@/components/LanguageContext";
import { useHoveredCardStore } from "@/components/ComboDock";
import { getAvatarSrc, UNHIRED_AVATAR_SRC } from "@/lib/avatar-utils";
import {
  cn,
  formatNumber,
  formatCompact,
} from "@/lib/utils";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { getProfessionImage, professionName } from "@/lib/professions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssignProfessionDialog } from "@/components/AssignProfessionDialog";
import { RenameNpcDialog } from "@/components/RenameNpcDialog";
import { PermBlockButton } from "@/components/PermBlockButton";
import { BuildingSprite } from "@/components/city/BuildingSprite";
import { buildingTier } from "@/lib/city/projection";
import { cardDisplayName } from "@/lib/display-names";
import { WarDeleteButton } from "@/components/WarDeleteButton";
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
  BadgeCheck,
  Shield,
  Eye,
  Terminal,
  User,
  Users,
  Lock,
  Check,
  TrendingUp,
} from "lucide-react";

/** Visual GET countdown on ownerless leaderboard Avatars (seconds). */
const GET_COUNTDOWN_SECONDS = 5;
/** Circumference of the action-overlay progress ring (r=34 in an 80×80 viewBox). */
const ACTION_RING_C = 2 * Math.PI * 34;

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
  /** Show the procedural art preview of the building hiring this card adds to
      the city (buildings browse grid), sized equal to the avatar. */
  showBuilding?: boolean;
  /** Bypass hidden-Avatar masking and always show the real avatar (served via
      the public, CDN-cached /api/avatar route). Used on profile showcases. */
  alwaysShowAvatar?: boolean;
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
    /** Professions already filled in the combo — drives the amber
     *  "your combo needs this profession" pulse on the card. */
    selectedProfessions?: string[];
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
  alwaysShowAvatar = false,
  showBuilding = false,
  comboSelection,
}: PlayerCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const { data: myCredits } = useCredits();
  const { ownedIds, renamedIds } = useOwnedPlayerIds();
  const { hasKnowledge, hasWar, warDeleteCooldownUntil } = useKnowledgePower();
  const missionLevel = useMissionLevel();
  const finalGoddessThreshold = useFinalGoddessThreshold();
  const isOwnProfile = session?.user?.name === username;
  // Avatar belongs to the viewer — all Avatar text takes the "MINE" yellow color.
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

  // Countdown overlay shown on ownerless Avatars while the GET (purchase)
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
  // Shared 1s clock (single interval per page instead of one per Avatar).
  const now = useNow();
  const blockRemainingMs = Math.max(0, getBlockEnd() - now);
  const isHireBlocked = blockRemainingMs > 0;
  const isFateSealed = isHireBlocked && blockRemainingMs > 30 * 24 * 60 * 60 * 1000;

  const isBonusCard = false;
  const isGoddess = GODDESS_USERNAMES.includes(username);
  const isSpecialCard = isGoddess || isBonusCard;
  const avatarFitClass = isSpecialCard ? "object-fill" : "object-cover";

  const hasOwner = (ownerCount ?? 0) > 0;
  const cardClassName = hasOwner
    ? "border-purple-700/60 bg-transparent hover:bg-purple-900/30 hover:border-purple-600 transition-all duration-200 cursor-pointer group"
    : "border-gray-800 bg-transparent hover:bg-gray-900/40 hover:border-gray-700 transition-all duration-200 cursor-pointer group";

  const effectiveProfession = isBonusCard || isGoddess ? null : profession;
  const professionImage = getProfessionImage(effectiveProfession);

  const isComboSelected = comboSelection?.isSelected(id) ?? false;
  const canCombo = !!comboSelection && !!effectiveProfession && ownedIds.has(id);
  // "Combo scent": owned card of a profession the current combo is still
  // missing → pulsing amber ring, pointing players at combo-building cards.
  const comboNeedsMe =
    canCombo &&
    !isComboSelected &&
    !!comboSelection?.selectedProfessions &&
    !!effectiveProfession &&
    !comboSelection.selectedProfessions.includes(effectiveProfession);
  const handleComboToggle = (e: React.MouseEvent) => {
    if (!canCombo || !comboSelection || !effectiveProfession) return;
    e.preventDefault();
    e.stopPropagation();
    play("toggle");
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

  const displayedAvatarSrc = alwaysShowAvatar
    ? `/api/avatar/${encodeURIComponent(username)}`
    : resolvedAvatarSrc === UNHIRED_AVATAR_SRC && professionImage
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
      if (!res.ok) throw new Error(data.error || t.purchaseFailed);
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
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      if (data.countdownStarted) {
        play("win");
        toast.success(t.countdownStartedTitle, {
          description: t.countdownStartedDesc,
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          t.youBoughtValueNow
            .replace("{name}", cardDisplayName(username, locale))
            .replace("{value}", String(data.newValue))
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["missions"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership-limit"], refetchType: "active" }),
        ]);
      }
      setCountdown(null);
    },
  });

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    if (leaderboardMode && !ownerName) setCountdown(GET_COUNTDOWN_SECONDS);
    mutation.mutate();
  };

  // Slim profile link rendered on EVERY Avatar — Avatar clicks aren't a reliable
  // way to reach the profile (ownerless market Avatars trigger GET instead),
  // so this is the one consistent navigation path.
  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("changepage");
    window.open(`/players/${encodeURIComponent(username)}`, "_blank", "noopener,noreferrer");
  };

  // ── Long-press quick-action sheet ──────────────────────────────────────
  // Press-and-hold (finger, pen, or mouse) opens the card's action sheet
  // (GET / OVERCLOCK / BREACH, combo toggle, profile) without navigating.
  // 450ms hold, 10px movement slop so scrolling never triggers it.
  const [sheetOpen, setSheetOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressFired = useRef(false);

  const clearPressTimer = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };
  useEffect(() => clearPressTimer, []);
  const handlePressStart = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      play("open");
      setSheetOpen(true);
    }, 450);
  };
  const handlePressMove = (e: React.PointerEvent) => {
    if (!pressStart.current) return;
    const dx = e.clientX - pressStart.current.x;
    const dy = e.clientY - pressStart.current.y;
    if (dx * dx + dy * dy > 100) clearPressTimer();
  };

  // Hovered-card tracking powers the 1-6 "assign to combo slot" keys.
  const setHoveredCard = useHoveredCardStore((s) => s.set);
  const handleMouseEnter = () => {
    if (!canCombo || !effectiveProfession) return;
    setHoveredCard({
      playerId: id,
      username,
      playerValue,
      avatarUrl,
      isNpc: playerType && playerType !== "human" ? 1 : 0,
      valueFloor,
      profession: effectiveProfession,
    });
  };

  const pumpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.overclockFailed);
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
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      toast.success(
        t.overclockedValueNow
          .replace("{name}", cardDisplayName(username, locale))
          .replace("{value}", `${formatNumber(data.newValue)}¢`)
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        // Overclock doubles the card's value → its building tier bumps.
        // The city query is what redraws it (Explore finding: previously no
        // ["city"] invalidation fired for the owner).
        queryClient.invalidateQueries({ queryKey: ["city"], refetchType: "active" }),
      ]);
    },
  });

  const handlePumpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("confirm");
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
      if (!res.ok) throw new Error(data.error || t.breachFailed);
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
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      triggerFlip();
      if (data.countdownStarted) {
        play("win");
        toast.success(t.countdownStartedTitle, {
          description: t.countdownStartedDesc,
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          t.breachHiredValueNow
            .replace("{name}", cardDisplayName(username, locale))
            .replace("{value}", String(data.newValue))
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["missions"], refetchType: "active" }),
          queryClient.invalidateQueries({ queryKey: ["ownership-limit"], refetchType: "active" }),
        ]);
      }
    },
  });

  const handleBreakClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isPermBlocked) {
      play("error");
      toast.error(t.unbreakablePartnership);
      return;
    }
    if ((myCredits ?? 0) < totalBreakCost) {
      play("error");
      toast.error(
        t.notEnoughCreditsBreach
          .replace("{total}", formatNumber(totalBreakCost))
          .replace("{fee}", formatNumber(breakCost))
          .replace("{hire}", formatNumber(playerValue))
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

  // Unified action overlay: GET shows a draining progress ring with a popping
  // countdown number; PUMP/BREAK (and GET without the countdown) show an
  // indeterminate spinning arc — one visual language for every action.
  const showActionOverlay = (countdown !== null && countdown > 0) || isActionPending;
  const actionOverlayColor =
    actionMode === "pump" ? "text-fuchsia-400" : actionMode === "break" ? "text-red-400" : "text-green-400";
  const actionOverlayLabel =
    countdown !== null ? t.cardOverlayHiring : actionMode === "pump" ? t.overclocking : actionMode === "break" ? t.breaching : t.cardOverlayHiring;

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
    if (isOwnProfile) return t.yourProfile;
    if (isPurchaseLocked)
      return unlockThreshold !== null
        ? t.ownAvatarsToUnlock.replace("{count}", formatCompact(unlockThreshold))
        : t.lockedLabel;
    if (isHireBlocked && isPermBlocked) return t.unbreakableTitle;
    if (!canAffordAction) return t.needAmount.replace("{amount}", formatNumber(actionCost));
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
          {t.actionView}
        </span>
      );
    }
    if (actionMode === "locked") {
      return (
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3" />
          {t.actionLocked}
        </span>
      );
    }
    const label = actionMode === "get" ? t.actionGet : actionMode === "pump" ? t.actionOverclock : t.actionBreach;
    return (
      <span className="inline-flex items-center gap-1">
        {actionMode === "break" && <Shield className="h-3 w-3" />}
        {actionMode === "break" ? `${label} ${formatCompact(actionCost)}¢` : label}
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
          title={t.comboToggleTitle}
        >
          {professionName(effectiveProfession, locale)}
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
        {professionName(effectiveProfession, locale)}
      </span>
    );
  })();

  const canAssignProfession =
    ownedIds.has(id) && !isGoddess && playerType !== "human" && !isOwnProfile;

  const showMeta = effectiveProfession || leaderboardMode;

  // Building preview (buildings browse grid): the procedural art of the
  // exact building hiring this card would add to the city — same
  // family/tier derivation as the city scene.
  const showBuildingRow = showBuilding;
  const buildingTitle = isGoddess
    ? t.cardBuildingLandmark
    : t.cardBuildingTier.replace("{tier}", String(buildingTier(playerValue, valueFloor)));

  // Status ring (identity) replaces the action ring when the card is locked
  // down: cyan = firewalled, amber = hard-locked. The action affordance
  // stays visible via the colored GET/OVERCLOCK/BREACH label.
  const statusRing = isPermBlocked ? "ring-amber-500" : isHireBlocked ? "ring-cyan-400" : null;

  return (
    <Card
      onClick={(e) => {
        // A completed long-press just opened the action sheet — swallow the
        // follow-up click so it doesn't also GET/navigate.
        if (longPressFired.current) {
          longPressFired.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Ownerless Avatars in the browse grid never open the profile page —
        // clicking anywhere on them triggers the GET action instead.
        if (leaderboardMode && !ownerName) {
          handleAvatarAction(e);
          return;
        }
        router.push(`/players/${username}`);
      }}
      onPointerDown={handlePressStart}
      onPointerUp={clearPressTimer}
      onPointerLeave={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onPointerMove={handlePressMove}
      onContextMenu={(e) => {
        if (longPressFired.current) e.preventDefault();
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHoveredCard(null)}
      className={cn(
        cardClassName,
        "relative overflow-hidden pt-0",
        isComboSelected && "ring-2 ring-amber-400 border-amber-400/60 bg-amber-950/20",
        flipping && "animate-card-flip-y"
      )}
    >
      {flipping && <div className="card-flip-back" />}
      <CardContent className="p-2 relative flex flex-col items-center">
        {/* Header above avatar: username left (taps through to the profile),
            badges right. The username IS the profile link — one consistent
            navigation path without a dedicated button row. */}
        <div className="w-full flex items-start justify-between gap-1.5 mb-1">
          <div className="min-w-0">
            <h3
              className={cn(
                "font-semibold leading-tight break-words flex items-center gap-1 flex-wrap text-left",
                isMine ? "text-yellow-300/90" : "text-white"
              )}
            >
              <button
                type="button"
                onClick={handleOpenProfile}
                title={t.openProfileHoldHint.replace("{name}", cardDisplayName(username, locale))}
                className={cn(
                  "text-left hover:underline underline-offset-2 decoration-current/60 transition-colors",
                  isMine ? "hover:text-yellow-200" : "hover:text-t1-300"
                )}
                style={{ fontSize: "0.8125rem" }}
              >
                {cardDisplayName(username, locale)}
              </button>
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
                {t.ownsCount.replace("{count}", formatCompact(ownedCount))}
              </span>
            )}
          </div>
        </div>

        <div
          className={cn(
            "relative aspect-square rounded-lg overflow-hidden ring-2 transition-all",
            // Building-preview cards shrink the avatar to match the building
            // sprite's width (both 2/3 of the card — see the preview row).
            showBuildingRow ? "w-2/3" : "w-full",
            statusRing ?? ringColor
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
                alt={cardDisplayName(username, locale)}
                className={cn("w-full h-full", avatarFitClass)}
              />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-2xl sm:text-3xl">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>

          {showActionOverlay && (
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/55 backdrop-blur-[2px] cursor-wait"
            >
              <div className={cn("relative", actionOverlayColor)}>
                {/* Breathing glow behind the ring */}
                <div className="absolute inset-0 rounded-full bg-current blur-md animate-action-glow" />
                <svg
                  viewBox="0 0 80 80"
                  className={cn("relative h-14 w-14 sm:h-16 sm:w-16", countdown === null && "animate-spin")}
                  style={countdown !== null ? { transform: "rotate(-90deg)" } : undefined}
                >
                  <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6" className="stroke-white/15" />
                  <circle
                    cx="40"
                    cy="40"
                    r="34"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={
                      countdown !== null
                        ? ACTION_RING_C
                        : `${ACTION_RING_C * 0.28} ${ACTION_RING_C * 0.72}`
                    }
                    strokeDashoffset={
                      countdown !== null ? (ACTION_RING_C * countdown) / GET_COUNTDOWN_SECONDS : 0
                    }
                    className={
                      countdown !== null ? "transition-[stroke-dashoffset] duration-1000 ease-linear" : undefined
                    }
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  {countdown !== null ? (
                    <span
                      key={countdown}
                      className="animate-action-pop text-2xl font-black text-white tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
                    >
                      {countdown}
                    </span>
                  ) : actionMode === "pump" ? (
                    <TrendingUp className="h-6 w-6 text-white animate-pulse" />
                  ) : actionMode === "break" ? (
                    <Shield className="h-6 w-6 text-white animate-pulse" />
                  ) : (
                    <Loader2 className="h-6 w-6 text-white animate-spin" />
                  )}
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/85 animate-pulse drop-shadow">
                {actionOverlayLabel}
              </span>
            </div>
          )}

          {isActive === 0 && (
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 z-20 bg-red-500/20 text-red-300 border-red-500/30 text-[10px] backdrop-blur-sm pointer-events-none"
            >
              {t.inactive}
            </Badge>
          )}

          {/* Combo scent — owned card of a profession the combo is missing. */}
          {comboNeedsMe && (
            <span
              className="absolute inset-0 z-20 rounded-lg ring-2 ring-amber-400/80 animate-pulse pointer-events-none"
              aria-hidden
            />
          )}

          {/* Bottom overlay: value and action label */}
          <div className="absolute inset-x-0 bottom-0 z-10 p-1.5 pointer-events-none">
            <div className="flex flex-wrap items-end justify-between gap-1">
              <div className="flex items-center gap-1 text-[15px] font-bold drop-shadow-sm">
                <span className={isMine ? "text-yellow-300/90" : "text-white"}>{formatCompact(playerValue)}<span className="text-[0.6em]">¢</span></span>
              </div>
              <div
                className={cn(
                  "text-[11px] font-bold drop-shadow-sm uppercase tracking-wide inline-flex items-center gap-1",
                  isMine ? "text-yellow-300/90" : actionTextColor
                )}
              >
                {actionLabel}
              </div>
            </div>
          </div>
        </div>

        {/* Per-card admin actions — ONE compact icon-chip row (each opens its
            own dialog). Profile lives on the username tap + the long-press
            sheet, so no dedicated Profile button row. */}
        {(canAssignProfession || (ownedIds.has(id) && !isGoddess && playerType !== "human") || (hasWar && ownedIds.has(id) && !isGoddess && !isOwnProfile)) && (
          <div className="w-full mt-2 flex items-center gap-1.5">
            {canAssignProfession && (
              <AssignProfessionDialog
                targetId={id}
                targetUsername={username}
                currentProfession={effectiveProfession ?? null}
                triggerClassName={cn(
                  "flex-1 justify-center rounded-md border border-purple-800 bg-transparent hover:bg-purple-900/30 font-bold h-7 px-1 text-[11px]",
                  isMine
                    ? "text-yellow-300/90 hover:text-yellow-200"
                    : "text-purple-200 hover:text-white"
                )}
              />
            )}
            {canAssignProfession && !renamedIds.has(id) && (
              <RenameNpcDialog
                targetId={id}
                targetUsername={username}
                triggerClassName={cn(
                  "flex-1 justify-center rounded-md border border-purple-800 bg-transparent hover:bg-purple-900/30 font-bold h-7 px-1 text-[11px]",
                  isMine
                    ? "text-yellow-300/90 hover:text-yellow-200"
                    : "text-purple-200 hover:text-white"
                )}
              />
            )}
            {ownedIds.has(id) && !isGoddess && playerType !== "human" && (
              <PermBlockButton
                targetId={id}
                targetUsername={username}
                permBlockUntil={permBlockUntil}
                size="sm"
                className={cn("flex-1 h-7", isMine && "text-yellow-300/90 hover:text-yellow-200")}
              />
            )}
            {/* Goddess of War power: destroy an owned Avatar. NPCs are deleted
                (2 fresh NPCs spawn); humans get their value reset to 1¢. */}
            {hasWar && ownedIds.has(id) && !isGoddess && !isOwnProfile && (
              <WarDeleteButton
                targetId={id}
                targetUsername={username}
                isNpc={!!playerType && playerType !== "human"}
                cooldownUntil={warDeleteCooldownUntil}
                className="flex-1 h-7"
              />
            )}
          </div>
        )}

        {showBuildingRow ? (
          // Preview column: the building sprite at the SAME width as the
          // avatar above (both 2/3 of the card — avatar shrunk to meet it),
          // with the profession badge / owner line stacked back below so the
          // card's total height stays roughly what it was.
          <div className="w-full mt-1.5 flex flex-col items-center gap-1.5">
            <BuildingSprite
              cardId={id}
              profession={effectiveProfession}
              playerValue={playerValue}
              valueFloor={valueFloor}
              goddessUsername={isGoddess ? username : undefined}
              title={buildingTitle}
              className="w-2/3"
            />
            {showMeta && (
              <div className="w-full text-center space-y-1">
                {professionBadge}
                {leaderboardMode && ownerName && (
                  <div className="flex items-center justify-center gap-1 min-w-0 text-[11px] font-semibold leading-tight">
                    {ownerName !== session?.user?.name && (
                      <span className="text-[9px] font-medium tracking-widest text-white/50 uppercase leading-none shrink-0">
                        {t.boss}
                      </span>
                    )}
                    <span
                      className={cn(
                        "flex items-center gap-1 justify-center max-w-full min-w-0",
                        ownerName === session?.user?.name ? "text-yellow-300/90" : "text-white"
                      )}
                    >
                      <Terminal className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {ownerName === session?.user?.name ? t.mine : ownerName}
                      </span>
                    </span>
                  </div>
                )}
                {leaderboardMode && !ownerName && (
                  <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-white leading-tight">
                    <Terminal className="h-3 w-3 shrink-0" />
                    <span className="truncate">{t.lost}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          showMeta && (
            <div className="w-full mt-2 text-center space-y-1">
              {professionBadge && (
                <div className="flex justify-center">{professionBadge}</div>
              )}
              {leaderboardMode && ownerName && (
                <div className="flex items-center justify-center gap-1 min-w-0 text-[11px] font-semibold leading-tight">
                  {ownerName !== session?.user?.name && (
                    <span className="text-[9px] font-medium tracking-widest text-white/50 uppercase leading-none shrink-0">
                      {t.boss}
                    </span>
                  )}
                  <span
                    className={cn(
                      "flex items-center gap-1 justify-center max-w-full min-w-0",
                      ownerName === session?.user?.name ? "text-yellow-300/90" : "text-white"
                    )}
                  >
                    <Terminal className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      {ownerName === session?.user?.name ? t.mine : ownerName}
                    </span>
                  </span>
                </div>
              )}
              {leaderboardMode && !ownerName && (
                <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-white leading-tight">
                  <Terminal className="h-3 w-3 shrink-0" />
                  <span className="truncate">{t.lost}</span>
                </div>
              )}
            </div>
          )
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

      {/* Long-press quick-action sheet — zero-navigation loop actions. */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="bg-gray-900 border-gray-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-white break-all leading-tight">
              {cardDisplayName(username, locale)}
            </DialogTitle>
            <DialogDescription>
              {formatNumber(playerValue)}¢
              {effectiveProfession ? ` · ${professionName(effectiveProfession, locale)}` : ""}
              {leaderboardMode && ownerName
                ? ownerName === session?.user?.name
                  ? ` · ${t.quickSheetYours}`
                  : ` · ${t.quickSheetBelongsTo.replace("{name}", ownerName)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(actionMode === "get" || actionMode === "pump" || actionMode === "break") && (
              <Button
                onClick={(e) => {
                  setSheetOpen(false);
                  if (actionMode === "get") handleBuyClick(e);
                  else if (actionMode === "pump") handlePumpClick(e);
                  else handleBreakClick(e);
                }}
                disabled={!canAffordAction || isActionPending}
                className={cn(
                  "w-full h-auto py-4 text-lg font-bold rounded-lg border-2 bg-transparent",
                  actionMode === "get"
                    ? "border-green-500 text-white hover:bg-green-500/15"
                    : actionMode === "pump"
                      ? "border-fuchsia-500 text-white hover:bg-fuchsia-500/15"
                      : "border-red-500 text-white hover:bg-red-500/15"
                )}
              >
                {isActionPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : actionMode === "get" ? (
                  t.getCostLabel.replace("{amount}", formatCompact(playerValue))
                ) : actionMode === "pump" ? (
                  t.overclockCostLabel.replace("{amount}", formatCompact(playerValue))
                ) : (
                  t.breachCostLabel.replace("{amount}", formatCompact(totalBreakCost))
                )}
              </Button>
            )}
            {canCombo && (
              <Button
                variant="outline"
                onClick={(e) => {
                  setSheetOpen(false);
                  handleComboToggle(e);
                }}
                className={cn(
                  "w-full h-auto py-3 font-bold rounded-lg",
                  isComboSelected
                    ? "border-amber-400/70 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                )}
              >
                {isComboSelected
                  ? t.removeFromCombo
                  : t.addToCombo.replace("{profession}", professionName(effectiveProfession, locale))}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={(e) => {
                setSheetOpen(false);
                handleOpenProfile(e);
              }}
              className="w-full h-auto py-3 font-bold rounded-lg border-gray-700 text-gray-300 hover:bg-gray-800"
            >
              <User className="h-4 w-4 mr-2" />
              {t.openProfile}
            </Button>
            <p className="text-[11px] text-gray-500 text-center pt-1">
              {t.holdCardHint}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export const PlayerCard = memo(PlayerCardImpl);
