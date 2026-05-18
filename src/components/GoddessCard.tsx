"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, User, ShoppingCart, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { formatNumber } from "@/lib/utils";
import { GODDESS_POWERS } from "@/lib/goddesses";

interface GoddessCardProps {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  originalValue: number;
  ownerCount: number;
  ownedCount: number;
  ownerName?: string | null;
  ownerValue?: number | null;
  currentUserId: number | null;
}

function getGoddessEmoji(username: string): string {
  const emojis: Record<string, string> = {
    "Goddess of Wealth": "💰",
    "Goddess of Knowledge": "📚",
    "Goddess of Fate": "🎯",
    "Goddess of Time": "⏳",
    "Goddess of War": "⚔️",
    "Goddess": "👑",
  };
  return emojis[username] || "✨";
}


export function GoddessCard({
  id,
  username,
  avatarUrl,
  playerValue,
  originalValue,
  ownerCount,
  ownedCount,
  ownerName,
}: GoddessCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const { play } = useSound();

  const isOwned = ownerCount > 0;
  const canAfford = (myCredits ?? 0) >= playerValue;
  const isOwnProfile = session?.user?.name === username;
  const goddessAvatarSrc = getAvatarSrc({
    avatarUrl,
    playerId: id,
    playerUsername: username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isGoddess: true, // Goddesses always show real avatars
  });

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
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          `You bought ${username}! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["goddesses"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
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

  return (
    <Card className={`border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 transition-all duration-200 group overflow-hidden`}>
      <CardContent className="p-0">
        {/* Clean Avatar Section - No overlay */}
        <div className="aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={goddessAvatarSrc}
            alt={username}
            className="w-full h-full object-cover"
          />
        </div>
        
        {/* Info Section Below Avatar */}
        <div className="p-4 space-y-3">
          {/* Goddess Name with Emoji */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{getGoddessEmoji(username)}</span>
            <h3 className="font-bold text-white text-lg truncate">
              {username}
            </h3>
          </div>
          
          {/* Value Badge */}
          <Badge className="bg-white/20 text-white border-white/30 font-mono text-sm">
            {formatNumber(playerValue)}¢
          </Badge>
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800/50 rounded-lg p-2">
              <p className="text-gray-400 text-xs">Original</p>
              <p className="text-white font-semibold text-sm truncate">{formatNumber(originalValue)}¢</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-2">
              <p className="text-gray-400 text-xs">Owner</p>
              {isOwned ? (
                <Link 
                  href={`/players/${ownerName}`}
                  className="text-yellow-400 font-semibold text-sm truncate hover:text-yellow-300 transition-colors block"
                >
                  {ownerName}
                </Link>
              ) : (
                <p className="text-green-400 font-semibold text-sm">Available</p>
              )}
            </div>
          </div>

          {/* Power description */}
          {GODDESS_POWERS[username] && (
            <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-2.5">
              <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider mb-1">Power</p>
              <p className="text-gray-300 text-xs leading-snug">{GODDESS_POWERS[username]}</p>
            </div>
          )}

          {/* Buy Button - hidden when user already owns this goddess */}
          {session && !isOwnProfile && !ownedIds.has(id) && (
            <Button
              onClick={handleBuyClick}
              disabled={!canAfford || mutation.isPending}
              className={`w-full font-bold py-2 text-sm whitespace-nowrap ${
                canAfford
                  ? "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white shadow-lg"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Hire for {formatNumber(playerValue)}¢
                </>
              )}
            </Button>
          )}

          {/* Info footer */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3" />
              {ownerCount} owner{ownerCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Owns {ownedCount}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}