"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { SellOutButton } from "@/components/SellOutButton";
import { DiscardButton } from "@/components/DiscardButton";
import { SendCreditsButton } from "@/components/SendCreditsButton";
import { BlockSellButton } from "@/components/BlockSellButton";
import {
  Clock,
  Briefcase,
  Timer,
  Coins,
  AlertTriangle,
  Crown,
  Users,
  TrendingUp,
  BadgeCheck,
  Shield,
  Swords,
  Hourglass,
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
  lastOnlineAt?: string | null;
  blockSellUntil?: string | null;
  blockSellBy?: string | null;
  estimatedDeletionAt?: string | null;
}

interface OwnershipListProps {
  items: OwnershipItem[];
  type: "owners" | "owned";
  showSellOut?: boolean;
  showDiscard?: boolean;
  showBlockSell?: boolean;
  showSendCredits?: boolean;
  myPlayerValue?: number;
}

export function OwnershipList({
  items,
  type,
  showSellOut,
  showDiscard,
  showBlockSell,
  showSendCredits,
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
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.ownershipId}
          className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/40 border border-gray-700/40 hover:bg-gray-800/60 transition-colors"
        >
          <Link href={`/players/${item.username}`} className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={item.avatarUrl || undefined} />
              <AvatarFallback className="text-xs bg-gray-700">
                {item.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white truncate">
                  {item.username}
                </span>
                {item.ownedCount !== undefined && item.ownedCount > 0 && (
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getOwnedRankColor(item.ownedCount)}`}>
                    <Swords className="h-2.5 w-2.5" />
                    {getOwnedRank(item.ownedCount).title}
                  </span>
                )}
                {item.ownerCount !== undefined && item.ownerCount > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-gray-500">
                    <Crown className="h-2.5 w-2.5 text-yellow-400" />
                    {item.ownerCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-t1-400" />
                  {item.playerValue}¢
                </span>
                {item.credits !== undefined && (
                  <span className="flex items-center gap-1">
                    <Coins className="h-3 w-3 text-yellow-400" />
                    {Number(item.credits).toFixed(0)}¢
                  </span>
                )}
                {item.lastOnlineAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatLastOnline(item.lastOnlineAt)}
                  </span>
                )}
              </div>
              {item.estimatedDeletionAt && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Deletion in {formatTimeRemaining(item.estimatedDeletionAt)}
                </div>
              )}
            </div>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
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
        </div>
      ))}
    </div>
  );
}