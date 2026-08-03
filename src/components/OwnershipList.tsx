"use client";

import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SendCreditsButton } from "@/components/SendCreditsButton";
import { BoostCardButton } from "@/components/BoostCardButton";
import { RevealAvatarButton } from "@/components/RevealAvatarButton";
import { LetGoButton } from "@/components/LetGoButton";
import { InlineDMChat } from "@/components/InlineDMChat";
import { CardProfileMeta } from "@/components/CardProfileMeta";
import { PhotoAttribution } from "@/components/PhotoAttribution";
import {
  Coins,
  BadgeCheck,
  Star,
  Gem,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useKnowledgePower } from "@/hooks/useKnowledgePower";
import { useForcedProfessionStore } from "@/hooks/useForcedProfession";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { getProfessionImage } from "@/lib/professions";
import { formatCompact, getDynamicFontSize, navbarBtnStyle } from "@/lib/utils";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { Shield, MessageSquare } from "lucide-react";
import { BlockSellButton } from "@/components/BlockSellButton";
import { PermBlockButton } from "@/components/PermBlockButton";

function formatTimeRemaining(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

interface OwnershipItem {
  ownershipId: number;
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  purchasePrice: number;
  credits?: number;
  portfolioValue?: number;
  ownerCount?: number;
  ownedCount?: number;
  playerType?: string;
  createdAt?: string | null;
  lastOnlineAt?: string | null;
  blockSellUntil?: string | null;
  blockSellBy?: string | null;
  permBlockUntil?: string | null;
  lastBoostAt?: string | null;
  avatarRevealUntil?: string | null;
  estimatedDeletionAt?: string | null;
  isVerified?: number;
  valueFloor?: number;
  purchaseCount?: number;
  hasUnreadDM?: boolean;
  bio?: string | null;
  profession?: string | null;
  photoAuthorName?: string | null;
  photoAuthorUrl?: string | null;
  photoSourceUrl?: string | null;
}

interface OwnershipListProps {
  items: OwnershipItem[];
  type: "owners" | "owned";
  showSellOut?: boolean;
  showDiscard?: boolean;
  showBlockSell?: boolean;
  showSendCredits?: boolean;
  showChat?: boolean;
  hideHire?: boolean;
  showBoost?: boolean;
  showRevealAvatar?: boolean;
  showLetGo?: boolean;
  myPlayerValue?: number;
  ownedMode?: boolean;
  comboSelection?: {
    isSelected: (playerId: number) => boolean;
    onToggle: (player: {
      playerId: number;
      username: string;
      playerValue: number;
      avatarUrl: string | null;
      isNpc: number;
      valueFloor: number;
    }, profession: string) => boolean;
  };
}

function useSellBlockCountdown(blockSellUntil?: string | null): string | null {
  const [timeLeft, setTimeLeft] = useState<string | null>(() => formatTimeRemaining(blockSellUntil));

  useEffect(() => {
    if (!blockSellUntil) { setTimeLeft(null); return; }
    const update = () => setTimeLeft(formatTimeRemaining(blockSellUntil));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [blockSellUntil]);

  return timeLeft;
}

function useRevealCountdown(avatarRevealUntil?: string | null): string | null {
  const [timeLeft, setTimeLeft] = useState<string | null>(() => formatTimeRemaining(avatarRevealUntil));

  useEffect(() => {
    if (!avatarRevealUntil) { setTimeLeft(null); return; }
    const update = () => setTimeLeft(formatTimeRemaining(avatarRevealUntil));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [avatarRevealUntil]);

  return timeLeft;
}

function usePumpBlockCountdown(blockSellUntil?: string | null, permBlockUntil?: string | null): string | null {
  const getEnd = () => {
    const blockEnd = blockSellUntil ? new Date(blockSellUntil).getTime() : 0;
    const permEnd = permBlockUntil ? new Date(permBlockUntil).getTime() : 0;
    return Math.max(blockEnd, permEnd);
  };

  const [timeLeft, setTimeLeft] = useState<string | null>(() => {
    const end = getEnd();
    if (!end) return null;
    const seconds = Math.floor((end - Date.now()) / 1000);
    if (seconds <= 0) return null;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  });

  useEffect(() => {
    const update = () => {
      const end = getEnd();
      if (!end) { setTimeLeft(null); return; }
      const seconds = Math.floor((end - Date.now()) / 1000);
      if (seconds <= 0) { setTimeLeft(null); return; }
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) { setTimeLeft(`${minutes}m`); return; }
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      setTimeLeft(remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`);
    };
    update();
    const id = setInterval(update, 10000);
    return () => clearInterval(id);
  }, [blockSellUntil, permBlockUntil]);

  return timeLeft;
}

function OwnershipCard({
  item,
  showSellOut,
  showDiscard,
  showBlockSell,
  showSendCredits,
  showChat,
  hideHire,
  showBoost,
  showRevealAvatar,
  showLetGo,
  alwaysReveal,
  ownedMode,
  comboSelection,
}: {
  item: OwnershipItem;
  showSellOut?: boolean;
  showDiscard?: boolean;
  showBlockSell?: boolean;
  showSendCredits?: boolean;
  showChat?: boolean;
  hideHire?: boolean;
  showBoost?: boolean;
  showRevealAvatar?: boolean;
  showLetGo?: boolean;
  alwaysReveal?: boolean;
  ownedMode?: boolean;
  comboSelection?: OwnershipListProps["comboSelection"];
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const { hasKnowledge } = useKnowledgePower();
  const { play } = useSound();

  const isOwnCard = session?.user?.name === item.username;
  const isBonus = false; // Bonus Avatars removed from the game.
  const isGoddess = GODDESS_USERNAMES.includes(item.username);
  const isSpecialCard = isGoddess || isBonus;
  const avatarFitClass = isSpecialCard ? "object-fill" : "object-cover";
  const canAfford = (myCredits ?? 0) >= item.playerValue;
  const sellBlockTime = useSellBlockCountdown(item.blockSellUntil);
  const revealTime = useRevealCountdown(item.avatarRevealUntil);
  // Goddess and bonus Avatars never have a profession
  const effectiveProfession = isBonus || isGoddess ? null : item.profession;
  const professionImage = getProfessionImage(effectiveProfession);
  const [chatOpen, setChatOpen] = useState(false);

  const cardAvatarSrc = getAvatarSrc({
    avatarUrl: item.avatarUrl,
    playerId: item.id,
    playerUsername: item.username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isBonus,
    isAvatarRevealed: alwaysReveal,
    viewerHasKnowledge: hasKnowledge,
  });

  const buyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - item.playerValue : undefined
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
      // Hired an NPC with no profession → forced assignment pops up instantly.
      if (data.needsProfession) {
        useForcedProfessionStore.getState().require({
          targetId: data.targetId,
          targetUsername: data.targetUsername,
        });
      }
      if (data.countdownStarted) {
        play("win");
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description: "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          `You bought ${item.username}! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["player"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
          queryClient.invalidateQueries({ queryKey: ["missions"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
        ]);
      }
    },
  });

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    buyMutation.mutate();
  };

  const pumpBlockCountdown = usePumpBlockCountdown(item.blockSellUntil, item.permBlockUntil);
  const pumpCost = item.playerValue;
  const canAffordPump = (myCredits ?? 0) >= pumpCost;

  const pumpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownershipId: item.ownershipId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Pump failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - pumpCost : undefined
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
      toast.success(`🚀 PUMPED ${item.username}! Value now ${formatCompact(data.newValue)}¢ (+${formatCompact(data.cost)}¢ to player)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
  });

  const handlePumpClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("confirm");
    pumpMutation.mutate();
  };

  const isComboSelected = comboSelection?.isSelected(item.id) ?? false;
  const hasProfession = !!item.profession;

  const handleComboToggle = (e: React.MouseEvent) => {
    if (!comboSelection || !hasProfession || !item.profession) return;
    e.preventDefault();
    e.stopPropagation();
    play("toggle");
    comboSelection.onToggle(
      {
        playerId: item.id,
        username: item.username,
        playerValue: item.playerValue,
        avatarUrl: item.avatarUrl,
        isNpc: item.playerType === "card" ? 1 : 0,
        valueFloor: item.valueFloor ?? 1,
      },
      item.profession
    );
  };

  if (ownedMode) {
    const isComboSelected = comboSelection?.isSelected(item.id) ?? false;
    const hasProfession = !!item.profession;

    const handleComboToggle = (e: React.MouseEvent) => {
      if (!comboSelection || !hasProfession || !item.profession) return;
      e.preventDefault();
      e.stopPropagation();
      play("toggle");
      comboSelection.onToggle(
        {
          playerId: item.id,
          username: item.username,
          playerValue: item.playerValue,
          avatarUrl: item.avatarUrl,
          isNpc: item.playerType === "card" ? 1 : 0,
          valueFloor: item.valueFloor ?? 1,
        },
        item.profession
      );
    };

    return (
      <Card
        className={`border-gray-800 bg-gray-900/60 transition-all duration-200 group relative ${
          isComboSelected
            ? "ring-2 ring-amber-400 border-amber-400/60 bg-amber-950/20"
            : "hover:bg-gray-900/90 hover:border-gray-700"
        }`}
        onClick={comboSelection && hasProfession ? handleComboToggle : undefined}
        style={comboSelection && hasProfession ? { cursor: "pointer" } : undefined}
      >
        {isComboSelected && (
          <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
        <CardContent className="p-2 flex flex-col items-center gap-1.5">
          <Link href={`/players/${item.username}`} className="block w-full" onClick={comboSelection ? (e) => e.preventDefault() : undefined}>
            <div className="relative w-full">
              <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
                <AvatarImage src={cardAvatarSrc} alt={item.username} className={avatarFitClass} />
                <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-2xl sm:text-3xl">
                  {item.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="text-center mt-1.5">
              <h3
                className="font-bold text-white group-hover:text-t1-400 transition-colors leading-tight break-words flex items-center justify-center gap-1.5 flex-wrap"
                style={{ fontSize: "clamp(0.75rem, 1.4vw, 1.1rem)" }}
              >
                {item.username}
                {item.isVerified === 1 && (<BadgeCheck className="h-5 w-5 text-blue-400 shrink-0" />)}
                {(item.valueFloor ?? 0) >= 100 && (<Gem className="h-5 w-5 text-purple-400 shrink-0" />)}
                {(item.valueFloor ?? 0) >= 10 && (item.valueFloor ?? 0) < 100 && (<Star className="h-5 w-5 text-yellow-400 shrink-0" />)}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {item.profession || "Hidden"}
              </p>
              <div className={`flex items-center justify-center gap-1 mt-0.5 ${getDynamicFontSize(item.playerValue)}`}>
                <Coins className="h-3 w-3 text-t1-400 shrink-0" />
                <span className="text-t1-400 font-bold">{formatCompact(item.playerValue)}¢</span>
              </div>
              {pumpBlockCountdown && (
                <div className="flex items-center justify-center gap-1 mt-1 text-amber-400 text-xs font-semibold">
                  <Shield className="h-3 w-3" />
                  <span className="tabular-nums">{pumpBlockCountdown}</span>
                </div>
              )}
            </div>
          </Link>

          <CardProfileMeta username={item.username} ownedCount={item.ownedCount} className="w-[80%]" />

          <Button
            onClick={(e) => {
              e.stopPropagation();
              handlePumpClick(e);
            }}
            disabled={!canAffordPump || pumpMutation.isPending}
            className={`w-[80%] aspect-square h-auto rounded-md flex flex-col items-center justify-center gap-0.5 font-bold ${
              canAffordPump
                ? "text-white bg-transparent border-2 border-fuchsia-500 hover:bg-fuchsia-500/15 shadow-lg shadow-purple-900/30"
                : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
            }`}
          >
            {pumpMutation.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <span className="text-sm sm:text-lg leading-none">PUMP</span>
                <span style={{ fontSize: "clamp(0.6rem, 1.2vw, 0.8rem)" }}>
                  {formatCompact(pumpCost)}¢
                </span>
              </>
            )}
          </Button>

          {/* Perm blocks only apply to regular NPC Avatars — not Goddesses
              or human players. */}
          {item.playerType === "card" && !isGoddess && (
            <PermBlockButton
              targetId={item.id}
              targetUsername={item.username}
              permBlockUntil={item.permBlockUntil}
              size="sm"
              className="w-[80%]"
            />
          )}

          {/* Unsplash photo credit — at the very bottom of the Avatar. */}
          <PhotoAttribution
            authorName={item.photoAuthorName}
            authorUrl={item.photoAuthorUrl}
            sourceUrl={item.photoSourceUrl}
            className="w-[80%]"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`border-gray-800 bg-gray-900/60 transition-all duration-200 group relative ${
        isComboSelected
          ? "ring-2 ring-amber-400 border-amber-400/60 bg-amber-950/20"
          : "hover:bg-gray-900/90 hover:border-gray-700"
      }`}
      onClick={comboSelection && hasProfession ? handleComboToggle : undefined}
      style={comboSelection && hasProfession ? { cursor: "pointer" } : undefined}
    >
      {isComboSelected && (
        <div className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
      <CardContent className="p-2 relative">
        <Link href={`/players/${item.username}`} className="block" onClick={comboSelection ? (e) => e.preventDefault() : undefined}>
          {/* TOP: Full-width avatar with overlayed square Hire button */}
          <div className="relative mb-2">
            <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
              <AvatarImage src={cardAvatarSrc} alt={item.username} className={avatarFitClass} />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-2xl sm:text-3xl">
                {item.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!isOwnCard && !hideHire && !ownedMode && (
              <Button
                onClick={handleBuyClick}
                disabled={!canAfford || buyMutation.isPending}
                className={`absolute bottom-1 right-1 h-12 w-12 sm:h-14 sm:w-14 p-0 rounded-md flex flex-col items-center justify-center gap-0.5 font-bold whitespace-nowrap z-10 ${
                  canAfford
                    ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                }`}
                style={canAfford ? navbarBtnStyle : undefined}
              >
                {buyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="text-[9px] sm:text-[10px] leading-none">Hire</span>
                    <span className={`leading-none ${getDynamicFontSize(item.playerValue)}`}>
                      {formatCompact(item.playerValue)}¢
                    </span>
                  </>
                )}
              </Button>
            )}
          </div>

          <div>
            {/* Username — capped smaller to prevent overflow on wide Avatars */}
            <h3
              className="font-bold text-white group-hover:text-t1-400 transition-colors leading-tight break-words text-left flex items-center justify-start gap-1.5 flex-wrap"
              style={{ fontSize: "clamp(0.75rem, 1.4vw, 1.1rem)" }}
            >
              {item.username}
              {item.isVerified === 1 && (
                <BadgeCheck className="h-5 w-5 text-blue-400 shrink-0" />
              )}
              {(item.valueFloor ?? 0) >= 100 && (
                <Gem className="h-5 w-5 text-purple-400 shrink-0" />
              )}
              {(item.valueFloor ?? 0) >= 10 && (item.valueFloor ?? 0) < 100 && (
                <Star className="h-5 w-5 text-yellow-400 shrink-0" />
              )}
            </h3>

            <div className="flex items-center gap-1.5 mt-1">
              {effectiveProfession && professionImage && (
                <span className="h-5 w-5 rounded overflow-hidden ring-1 ring-amber-500/40 ring-inset bg-black/50 shrink-0">
                  <img src={professionImage} alt={effectiveProfession} className="w-full h-full object-contain p-px" />
                </span>
              )}
              <span className={`text-sm font-semibold truncate ${effectiveProfession ? 'text-amber-400/80' : 'text-gray-400'}`}>
                {effectiveProfession || "Hidden"}
              </span>
            </div>

            <div className={`flex items-center gap-1 mt-1 ${getDynamicFontSize(item.playerValue)}`}>
              <Coins className="h-3 w-3 text-t1-400 shrink-0" />
              <span className="text-t1-400 font-bold">{formatCompact(item.playerValue)}¢</span>
            </div>

            <CardProfileMeta username={item.username} ownedCount={item.ownedCount} className="mt-1.5" />
          </div>
        </Link>

        {/* Action buttons */}
        {!ownedMode && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-800/60">
            {showSendCredits && (<SendCreditsButton targetId={item.id} targetUsername={item.username} square />)}
            {showBoost && !isOwnCard && (<BoostCardButton targetId={item.id} targetUsername={item.username} playerValue={item.playerValue} countdown={sellBlockTime} square />)}
            {showRevealAvatar && !isOwnCard && !GODDESS_USERNAMES.includes(item.username) && !hasKnowledge && (<RevealAvatarButton targetId={item.id} targetUsername={item.username} playerValue={item.playerValue} countdown={revealTime} square />)}
            {showBlockSell && (<BlockSellButton ownershipId={item.ownershipId} ownedUsername={item.username} playerValue={item.playerValue} blockSellUntil={item.blockSellUntil ?? null} square />)}
            {showLetGo && (<LetGoButton targetId={item.id} targetUsername={item.username} playerValue={item.playerValue} square />)}
            {showChat && (
              <button
                onClick={() => setChatOpen((v) => !v)}
                title={`Message ${item.username}`}
                className={`h-12 w-12 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold drop-shadow-lg border transition-colors ${
                  chatOpen
                    ? "border-t1-500/60 text-t1-300 bg-t1-500/10"
                    : "border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
                } ${item.hasUnreadDM ? "ring-2 ring-t1-400/60" : ""}`}
              >
                <MessageSquare className="h-4 w-4" />
                <span className="text-[7px] leading-none mt-0.5">Chat</span>
              </button>
            )}
          </div>
        )}

        {!ownedMode && showChat && !isBonus && chatOpen && (
          <div className="mt-3 pt-3 border-t border-gray-800/60"><InlineDMChat targetId={item.id} targetUsername={item.username} targetAvatarUrl={cardAvatarSrc} /></div>
        )}

        {/* Unsplash photo credit — at the very bottom of the Avatar. */}
        <PhotoAttribution
          authorName={item.photoAuthorName}
          authorUrl={item.photoAuthorUrl}
          sourceUrl={item.photoSourceUrl}
          className="mt-2"
        />
      </CardContent>
    </Card>
  );
}

export function OwnershipList({
  items,
  type,
  showSellOut,
  showDiscard,
  showBlockSell,
  showSendCredits,
  showChat,
  hideHire,
  showBoost,
  showRevealAvatar,
  showLetGo,
  myPlayerValue,
  ownedMode,
  comboSelection,
}: OwnershipListProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {type === "owners" ? "No bosses yet" : "No players owned yet"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
      {items.map((item) => (
        <OwnershipCard key={item.ownershipId} item={item} showSellOut={showSellOut} showDiscard={showDiscard} showBlockSell={showBlockSell} showSendCredits={showSendCredits} showChat={showChat} hideHire={hideHire} showBoost={showBoost} showRevealAvatar={showRevealAvatar} showLetGo={showLetGo} alwaysReveal={type === "owned"} ownedMode={ownedMode} comboSelection={comboSelection} />
      ))}
    </div>
  );
}
