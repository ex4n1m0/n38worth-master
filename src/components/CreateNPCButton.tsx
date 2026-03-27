"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCredits } from "@/hooks/useCredits";
import { Sparkles, Loader2 } from "lucide-react";

export function CreateNPCButton() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const [isCreating, setIsCreating] = useState(false);

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
      const res = await fetch("/api/game/create-npc", {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create NPC");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleCreateNPC = () => {
    if ((credits ?? 0) < 100) {
      toast.error("You need at least 100¢ to create an NPC");
      return;
    }
    createNPCMutation.mutate();
  };

  // Only show if player has purchased at least 55 players
  if (ownedCount < 55) return null;

  const canCreate = (credits ?? 0) >= 100;
  const isLoading = createNPCMutation.isPending || isCreating;

  return (
    <Card className="border-purple-500/30 bg-gradient-to-r from-purple-900/20 to-pink-900/20">
      <CardContent className="p-4">
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
          Unlocked at 55 owned players • Costs 100¢
        </p>
      </CardContent>
    </Card>
  );
}
