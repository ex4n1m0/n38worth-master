"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, User, ShoppingCart, Loader2, Sparkles, Gem } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { formatNumber } from "@/lib/utils";

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
    Morríghan: "⚔️",
    Athena: "🦉",
    Freyja: "🐱",
    Ishtar: "⭐",
    Inanna: "👑",
  };
  return emojis[username] || "✨";
}

function getGoddessColor(username: string): string {
  // Use purple gradient for a mystical goddess theme
  return "from-purple-600 to-indigo-700";
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
  ownerValue,
  currentUserId,
}: GoddessCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { play } = useSound();

  const isOwned = ownerCount > 0;
  const canAfford = (myCredits ?? 0) >= playerValue;
  const isOwnProfile = session?.user?.name === username;

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
            "You own all 5 Goddesses! Hold them for 60 minutes to win the game!",
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
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${getGoddessColor(username)} flex items-center justify-center`}>
              <span className="text-white font-bold text-6xl">
                {username.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
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

          {/* Buy Button */}
          {session && !isOwnProfile && (
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