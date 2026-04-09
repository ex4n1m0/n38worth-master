"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCredits } from "@/hooks/useCredits";
import { Sparkles, Loader2 } from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { formatNumber } from "@/lib/utils";

export function CreateNPCButton() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const [customQuery, setCustomQuery] = useState("");

  // Fetch current player data to check owned count
  const { data: player } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 10 * 1000,
  });

  const ownedCount = player?.ownedPlayers?.length ?? 0;

  const createNPCMutation = useMutation({
    mutationFn: async () => {
      const body = customQuery.trim() ? { customQuery: customQuery.trim() } : {};
      const res = await fetch("/api/game/create-npc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create NPC");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      setCustomQuery("");
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const { play } = useSound();

  const handleCreateNPC = () => {
    if ((credits ?? 0) < 100) {
      toast.error(`You need at least ${formatNumber(100)}¢ to create an NPC`);
      return;
    }
    play("buttons");
    createNPCMutation.mutate();
  };

  // Only show if player has purchased at least 55 players
  if (ownedCount < 55) return null;

  const canCreate = (credits ?? 0) >= 100;
  const isLoading = createNPCMutation.isPending;

  return (
    <Card className="border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20">
      <CardContent className="p-4">
        <input
          type="text"
          value={customQuery}
          onChange={(e) => setCustomQuery(e.target.value)}
          placeholder="Enter Unsplash search term (optional)"
          maxLength={100}
          disabled={isLoading}
          className="w-full mb-3 px-3 py-2 bg-gray-900/50 border border-purple-500/30 rounded-lg text-white placeholder-gray-400 text-sm focus:outline-none focus:border-purple-400 disabled:opacity-50"
        />
        <Button
          onClick={handleCreateNPC}
          disabled={!canCreate || isLoading}
          className="w-full h-12 text-base font-bold bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Creating NPC...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 mr-2" />
              Create Random NPC (100¢)
            </>
          )}
        </Button>
        <p className="text-xs text-gray-500 mt-2 text-center">
          Unlocked at 55 owned players • Costs 100¢ • Leave blank for random
        </p>
      </CardContent>
    </Card>
  );
}
