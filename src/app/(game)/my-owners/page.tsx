"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InlineDMChat } from "@/components/InlineDMChat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Crown, Loader2 } from "lucide-react";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";
import { ChatProvider } from "@/contexts/ChatContext";
import { ResignButton } from "@/components/ResignButton";
import { BlockSellButton } from "@/components/BlockSellButton";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";

function MyOwnersContent() {
  const { data: session } = useSession();
  const { ownedIds } = useOwnedPlayerIds();

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
  });

  const owners =
    player?.owners?.map(
      (p: {
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
      }) => ({ ...p })
    ) ?? [];

  // Only one boss expected
  const owner = owners.length > 0 ? owners[0] : null;

  return (
    <div className="space-y-6">
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-400" />
            My Boss
            {owner && (
              <span className="text-sm font-normal text-gray-400">
                — {owner.username}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
            </div>
          ) : !owner ? (
            <div className="text-center py-12 text-gray-500">
              <Crown className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg">You don't have a boss yet</p>
              <p className="text-sm text-gray-600 mt-1">
                When someone buys you, they'll appear here
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Boss Info */}
              <Link
                href={`/players/${owner.username}`}
                className="flex items-center gap-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-t1-500 transition-all group"
              >
                <Avatar className="h-14 w-14 ring-2 ring-yellow-500/30 group-hover:ring-yellow-500/60 transition-all shrink-0">
                  <AvatarImage
                    src={getAvatarSrc({
                      avatarUrl: owner.avatarUrl,
                      playerId: owner.id,
                      playerUsername: owner.username,
                      viewerUsername: session?.user?.name,
                      ownedIds,
                    })}
                    alt={owner.username}
                  />
                  <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-sm">
                    {owner.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white group-hover:text-t1-400 transition-colors text-base">
                    {owner.username}
                  </h3>
                  <p className="text-sm text-gray-400 truncate">
                    Value: {formatNumber(owner.playerValue)}¢
                  </p>
                </div>
                <Crown className="h-5 w-5 text-yellow-400 shrink-0" />
              </Link>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2 flex-wrap">
                <BlockSellButton
                  ownershipId={owner.ownershipId}
                  ownerUsername={owner.username}
                  playerValue={player?.playerValue ?? 0}
                  blockSellUntil={owner.blockSellUntil ?? null}
                />
                <ResignButton
                  ownershipId={owner.ownershipId}
                  ownerUsername={owner.username}
                  userCredits={player?.credits ?? 0}
                />
              </div>

              {/* Full-size Chat Box */}
              <div className="rounded-lg border border-gray-800 bg-gray-950/50 p-4" style={{ minHeight: "calc(100vh - 420px)" }}>
                <InlineDMChat
                  targetId={owner.id}
                  targetUsername={owner.username}
                  targetAvatarUrl={getAvatarSrc({
                    avatarUrl: owner.avatarUrl,
                    playerId: owner.id,
                    playerUsername: owner.username,
                    viewerUsername: session?.user?.name,
                    ownedIds,
                  })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyOwnersPage() {
  return (
    <ChatProvider>
      <MyOwnersContent />
    </ChatProvider>
  );
}
