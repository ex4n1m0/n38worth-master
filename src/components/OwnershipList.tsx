"use client";

import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SellOutButton } from "@/components/SellOutButton";
import { DiscardButton } from "@/components/DiscardButton";
import { SendCreditsButton } from "@/components/SendCreditsButton";
import { BlockSellButton } from "@/components/BlockSellButton";
import { InlineDMChat } from "@/components/InlineDMChat";
import {
  Clock,
  Briefcase,
  Coins,
  AlertTriangle,
  Crown,
  Users,
  TrendingUp,
  BadgeCheck,
  Shield,
  Swords,
  Hourglass,
  Star,
  Gem,
  User,
  CreditCard,
} from "lucide-react";
import Link from "next/link";
import {
  getOwnedRank,
  getAgeRank,
  getAgeDays,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOwnedRankColor,
  getAgeRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";

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
  if (seconds <= 0) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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
  estimatedDeletionAt?: string | null;
  isVerified?: number;
  valueFloor?: number;
}

interface OwnershipListProps {
  items: OwnershipItem[];
  type: "owners" | "owned";
  showSellOut?: boolean;
  showDiscard?: boolean;
  showBlockSell?: boolean;
  showSendCredits?: boolean;
  showChat?: boolean;
  myPlayerValue?: number;
}

export function OwnershipList({
  items,
  type,
  showSellOut,
  showDiscard,
  showBlockSell,
  showSendCredits,
  showChat,
  myPlayerValue,
}: OwnershipListProps) {
  const { data: session } = useSession();

  if (!items || items.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {type === "owners" ? "No owners yet" : "No players owned yet"}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map((item) => (
        <Card
          key={item.ownershipId}
          className="border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 group"
        >
          <CardContent className="p-4">
            <Link href={`/players/${item.username}`} className="block">
              {/* TOP: Avatar + Value badge */}
              <div className="flex items-start gap-3 mb-3">
                <Avatar className="h-20 w-20 sm:h-24 sm:w-24 ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all shrink-0">
                  <AvatarImage src={item.avatarUrl || undefined} alt={item.username} />
                  <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-base">
                    {item.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  {/* Username + badges */}
                  <h3 className="font-semibold text-sm sm:text-base text-white group-hover:text-t1-400 transition-colors flex items-center gap-1.5 flex-wrap">
                    {item.username}
                    {item.isVerified === 1 && (
                      <BadgeCheck className="h-4 w-4 text-blue-400 shrink-0" />
                    )}
                    {(item.valueFloor ?? 0) >= 100 && (
                      <Gem className="h-4 w-4 text-purple-400 shrink-0" />
                    )}
                    {(item.valueFloor ?? 0) >= 10 && (item.valueFloor ?? 0) < 100 && (
                      <Star className="h-4 w-4 text-yellow-400 shrink-0" />
                    )}
                  </h3>

                  {/* Player type + Rank badges */}
                  <div className="flex items-center gap-1 flex-wrap mt-1.5">
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
                    {item.ownedCount !== undefined && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getOwnedRankColor(item.ownedCount)}`}>
                        <Swords className="h-2.5 w-2.5" />
                        {getOwnedRank(item.ownedCount).title}
                      </span>
                    )}
                    {item.createdAt && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getAgeRankColor(getAgeDays(item.createdAt))}`}>
                        <Hourglass className="h-2.5 w-2.5" />
                        {getAgeRank(getAgeDays(item.createdAt)).title}
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
                  </div>

                  {/* Value badge */}
                  <div className="mt-2">
                    <Badge
                      variant="secondary"
                      className="bg-t1-500/10 text-t1-400 border-t1-500/20 font-mono text-xs"
                    >
                      {item.playerValue}¢
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 flex-wrap text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-t1-400" />
                  {item.playerValue}¢
                </span>
                {item.ownerCount !== undefined && (
                  <span className="flex items-center gap-1">
                    <Crown className="h-3 w-3 text-yellow-400" />
                    {item.ownerCount}
                  </span>
                )}
                {item.ownedCount !== undefined && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-t2-400" />
                    {item.ownedCount}
                  </span>
                )}
                {item.portfolioValue !== undefined && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3 text-purple-400" />
                    {Math.round(item.portfolioValue)}¢
                  </span>
                )}
                {item.credits !== undefined && (
                  <span className="flex items-center gap-1 text-t1-400">
                    <Coins className="h-3 w-3" />
                    {Number(item.credits).toFixed(2)}¢
                  </span>
                )}
              </div>

              {/* Footer: last online + deletion */}
              <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                <span className="flex items-center gap-1 text-gray-500">
                  <Clock className="h-3 w-3" />
                  {formatLastOnline(item.lastOnlineAt)}
                </span>
                {item.estimatedDeletionAt && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <AlertTriangle className="h-3 w-3" />
                    Deletion in {formatTimeRemaining(item.estimatedDeletionAt)}
                  </span>
                )}
              </div>
            </Link>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800/60 flex-wrap">
              {showBlockSell && item.blockSellUntil && (
                <div className="text-[10px] text-amber-400 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  Blocked
                </div>
              )}
              {showBlockSell && !item.blockSellUntil && (
                <BlockSellButton
                  ownershipId={item.ownershipId}
                  ownerUsername={item.username}
                  playerValue={item.playerValue}
                  blockSellUntil={item.blockSellUntil ?? null}
                />
              )}
              {showSendCredits && (
                <SendCreditsButton
                  targetId={item.id}
                  targetUsername={item.username}
                />
              )}
              {showDiscard && (
                <DiscardButton
                  otherId={item.id}
                  otherUsername={item.username}
                  cost={item.purchasePrice}
                  blockSellUntil={item.blockSellUntil}
                  blockSellBy={item.blockSellBy}
                />
              )}
              {showSellOut && (
                <SellOutButton
                  ownershipId={item.ownershipId}
                  ownerUsername={item.username}
                  playerValue={item.playerValue}
                />
              )}
            </div>

            {/* Inline Chat */}
            {showChat && (
              <div className="mt-3 pt-3 border-t border-gray-800/60">
                <InlineDMChat
                  targetId={item.id}
                  targetUsername={item.username}
                  targetAvatarUrl={item.avatarUrl}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
