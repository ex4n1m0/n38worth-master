"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { Sparkles, Loader2 } from "lucide-react";
import { useLanguage } from "./LanguageContext";

export function CreateNPCButton() {
  const queryClient = useQueryClient();
  const { data: credits } = useCredits();
  const { t } = useLanguage();
  const [isCreating, setIsCreating] = useState(false);

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

  const canCreate = (credits ?? 0) >= 100;
  const isLoading = createNPCMutation.isPending || isCreating;

  return (
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
  );
}