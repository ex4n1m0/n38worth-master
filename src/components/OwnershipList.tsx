"use client";

import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SendCreditsButton } from "@/components/SendCreditsButton";
import { BoostCardButton } from "@/components/BoostCardButton";
import { BoostValueButton } from "@/components/BoostValueButton";
import { RevealAvatarButton } from "@/components/RevealAvatarButton";
import { LetGoButton } from "@/components/LetGoButton";
import { InlineDMChat } from "@/components/InlineDMChat";
import {
  Clock,
  Briefcase,
  Coins,
  Crown,
  Users,
  TrendingUp,
  BadgeCheck,
  Swords,
  Star,
  Gem,
  User,
  CreditCard,
  ShoppingCart,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";
import {
  getOwnedRank,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOwnedRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";
import { formatNumber, getDynamicFontSize, navbarBtnStyle } from "@/lib/utils";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

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
  lastBoostAt?: string | null;
  avatarRevealUntil?: string | null;
  estimatedDeletionAt?: string | null;
  isVerified?: number;
  valueFloor?: number;
  purchaseCount?: number;
  hasUnreadDM?: boolean;
  bio?: string | null;
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
  showBoostValue?: boolean;
  showRevealAvatar?: boolean;
  showLetGo?: boolean;
  myPlayerValue?: number;
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

function OwnershipCard({
  item,
  showSellOut,
  showDiscard,
  showBlockSell,
  showSendCredits,
  showChat,
  hideHire,
  showBoost,
  showBoostValue,
  showRevealAvatar,
  showLetGo,
}: {
  item: OwnershipItem;
  showSellOut?: boolean;
  showDiscard?: boolean;
  showBlockSell?: boolean;
  showSendCredits?: boolean;
  showChat?: boolean;
  hideHire?: boolean;
  showBoost?: boolean;
  showBoostValue?: boolean;
  showRevealAvatar?: boolean;
  showLetGo?: boolean;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const { play } = useSound();

  const isOwnCard = session?.user?.name === item.username;
  const canAfford = (myCredits ?? 0) >= item.playerValue;
  const sellBlockTime = useSellBlockCountdown(item.blockSellUntil);
  const revealTime = useRevealCountdown(item.avatarRevealUntil);
  const cardAvatarSrc = getAvatarSrc({
    avatarUrl: item.avatarUrl,
    playerId: item.id,
    playerUsername: item.username,
    viewerUsername: session?.user?.name,
    ownedIds,
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
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      if (data.countdownStarted) {
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

  return (
    <Card className="border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 group">
      <CardContent className="p-2 relative">
        <Link href={`/players/${item.username}`} className="block">
          {/* TOP: Full-width avatar with overlayed square Hire button */}
          <div className="relative mb-2">
            <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
              <AvatarImage src={cardAvatarSrc} alt={item.username} className="object-cover" />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-2xl sm:text-3xl">
                {item.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!isOwnCard && !hideHire && (
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
                      {formatNumber(item.playerValue)}¢
                    </span>
                  </>
                )}
              </Button>
            )}
          </div>

          <div>

            {/* Username + badges */}
            <div className="w-full mb-12">
              <h3
                className="font-bold text-white group-hover:text-t1-400 transition-colors leading-tight break-words text-left flex items-center justify-start gap-1.5 flex-wrap"
                style={{ fontSize: "clamp(1.1rem, 3.5vw, 1.875rem)" }}
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
            </div>

            {/* Player type + Rank badges */}
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {item.playerType === "human" ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
                  <User className="h-2.5 w-2.5" />
                  Human
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-cyan-300 bg-cyan-500/15 border-cyan-500/30">
                  <CreditCard className="h-2.5 w-2.5" />
                  Card
                </span>
              )}
              {item.playerType === "human" && (
                <>
                  {item.ownedCount !== undefined && (
                    <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getOwnedRankColor(item.ownedCount)}`}>
                      <Swords className="h-2.5 w-2.5" />
                      {getOwnedRank(item.ownedCount).title}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getCreditsRankColor(item.credits ?? 0)}`}>
                    <Coins className="h-2.5 w-2.5" />
                    {getCreditsRank(item.credits ?? 0).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getValueRankColor(item.playerValue)}`}>
                    <TrendingUp className="h-2.5 w-2.5" />
                    {getValueRank(item.playerValue).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getPortfolioRankColor(item.portfolioValue ?? 0)}`}>
                    <Briefcase className="h-2.5 w-2.5" />
                    {getPortfolioRank(item.portfolioValue ?? 0).title}
                  </span>
                </>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-2 flex-wrap text-[10px] sm:text-xs text-gray-400 mt-1">
              {item.ownerCount !== undefined && (
                <span className="flex items-center gap-1">
                  <Crown className="h-3 w-3 text-yellow-400 shrink-0" />
                  {item.ownerCount}
                </span>
              )}
              {item.ownedCount !== undefined && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-t2-400 shrink-0" />
                  {item.ownedCount}
                </span>
              )}
              <span className="flex items-center gap-1 text-orange-400">
                <ShoppingCart className="h-3 w-3 shrink-0" />
                {item.purchaseCount ?? 0}x
              </span>
              {item.portfolioValue !== undefined && (
                <span className={`flex items-center gap-1 ${getDynamicFontSize(Math.round(item.portfolioValue))}`}>
                  <Briefcase className="h-3 w-3 text-purple-400 shrink-0" />
                  {formatNumber(Math.round(item.portfolioValue))}¢
                </span>
              )}
              {item.credits !== undefined && (
                <span className={`flex items-center gap-1 text-t1-400 ${getDynamicFontSize(parseFloat((item.credits).toFixed(2)))}`}>
                  <Coins className="h-3 w-3 shrink-0" />
                  {formatNumber(parseFloat((item.credits).toFixed(2)))}¢
                </span>
              )}
            </div>

            {/* Bio */}
            {item.bio && (
              <p className="mt-1.5 text-[11px] text-gray-400 italic line-clamp-2 leading-snug">
                &ldquo;{item.bio}&rdquo;
              </p>
            )}

            {/* Footer: last online */}
            <div className="flex items-center gap-3 mt-1.5 text-[11px]">
              <span className="flex items-center gap-1 text-gray-500">
                <Clock className="h-3 w-3" />
                {formatLastOnline(item.lastOnlineAt)}
              </span>
            </div>
          </div>
        </Link>

        {/* Action buttons */}

        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-gray-800/60">
          {showSendCredits && (
            <SendCreditsButton
              targetId={item.id}
              targetUsername={item.username}
              className="w-full"
            />
          )}
          {showBoost && !isOwnCard && (
            <BoostCardButton
              targetId={item.id}
              targetUsername={item.username}
              playerValue={item.playerValue}
              countdown={sellBlockTime}
              className="w-full"
            />
          )}
          {showBoostValue && !GODDESS_USERNAMES.includes(item.username) && (
            <BoostValueButton
              targetId={item.id}
              targetUsername={item.username}
              playerValue={item.playerValue}
              className="w-full"
            />
          )}
          {showRevealAvatar && !isOwnCard && !GODDESS_USERNAMES.includes(item.username) && (
            <RevealAvatarButton
              targetId={item.id}
              targetUsername={item.username}
              playerValue={item.playerValue}
              countdown={revealTime}
              className="w-full"
            />
          )}
          {showLetGo && (
            <LetGoButton
              targetId={item.id}
              targetUsername={item.username}
              playerValue={item.playerValue}
              className="w-full"
            />
          )}
        </div>

        {/* Inline Chat */}
        {showChat && (
          <div className="mt-4 pt-4 border-t border-gray-800/60">
            <InlineDMChat
              targetId={item.id}
              targetUsername={item.username}
              targetAvatarUrl={cardAvatarSrc}
            />
          </div>
        )}
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
  showBoostValue,
  showRevealAvatar,
  showLetGo,
  myPlayerValue,
}: OwnershipListProps) {
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {type === "owners" ? "No bosses yet" : "No players owned yet"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      {items.map((item) => (
        <OwnershipCard
          key={item.ownershipId}
          item={item}
          showSellOut={showSellOut}
          showDiscard={showDiscard}
          showBlockSell={showBlockSell}
          showSendCredits={showSendCredits}
          showChat={showChat}
          hideHire={hideHire}
          showBoost={showBoost}
          showBoostValue={showBoostValue}
          showRevealAvatar={showRevealAvatar}
          showLetGo={showLetGo}
        />
      ))}
    </div>
  );
}
