"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface ActiveBlock {
  ownershipId: number;
  playerId: number;
  username: string;
  avatarUrl: string | null;
  permBlockUntil: string;
}

interface PermBlockButtonProps {
  targetId: number;
  targetUsername: string;
  permBlockUntil?: string | Date | null;
  size?: "sm" | "md";
  className?: string;
}

export function PermBlockButton({
  targetId,
  targetUsername,
  permBlockUntil,
  size = "md",
  className = "",
}: PermBlockButtonProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeBlocks, setActiveBlocks] = useState<ActiveBlock[]>([]);

  const isAssigned = !!permBlockUntil;
  const isActive = isAssigned && new Date(permBlockUntil) > new Date();

  const mutation = useMutation({
    mutationFn: async ({ sourceId }: { sourceId?: number }) => {
      const res = await fetch("/api/game/perm-block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, sourceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.activeBlocks) {
          const error = new Error(data.error || "Permanent block limit reached") as Error & {
            activeBlocks: ActiveBlock[];
          };
          error.activeBlocks = data.activeBlocks;
          throw error;
        }
        throw new Error(data.error || "Failed to update permanent block");
      }
      return data;
    },
    onSuccess: (data) => {
      setDialogOpen(false);
      setActiveBlocks([]);
      if (data.permBlockUntil) {
        toast.success(`${targetUsername} is protected by a permanent block.`);
      } else {
        toast.success(`Permanent block removed from ${targetUsername}.`);
      }
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] });
    },
    onError: (err: any) => {
      if (err.activeBlocks) {
        setActiveBlocks(err.activeBlocks);
        setDialogOpen(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAssigned) {
      const ok = window.confirm(`Remove permanent block from ${targetUsername}?`);
      if (!ok) return;
    }
    mutation.mutate({});
  };

  const handleMove = (sourceId: number) => {
    mutation.mutate({ sourceId });
  };

  const sizeClasses =
    size === "sm"
      ? "text-[10px] py-1 px-2 h-auto"
      : "text-xs py-2 px-3 h-auto";

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={mutation.isPending}
        className={`rounded-md flex items-center justify-center gap-1.5 font-bold ${sizeClasses} ${className} ${
          isActive
            ? "border border-amber-500/50 text-amber-300 bg-amber-950/20 hover:bg-amber-950/30"
            : isAssigned
              ? "border border-amber-600/40 text-amber-300/80 bg-amber-950/10 hover:bg-amber-950/20"
              : "border border-gray-700 text-gray-300 bg-gray-900/50 hover:bg-gray-800"
        }`}
      >
        {mutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Shield className={`h-3.5 w-3.5 ${isActive ? "fill-amber-400 text-amber-400" : isAssigned ? "text-amber-400/70" : ""}`} />
        )}
        {isAssigned ? "Remove Perm Block" : "Assign Perm Block"}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Permanent Block</DialogTitle>
            <DialogDescription>
              All 10 permanent blocks are in use. Choose a player to move the block from.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-80 overflow-auto">
            {activeBlocks.map((block) => (
              <button
                key={block.playerId}
                onClick={() => handleMove(block.playerId)}
                disabled={mutation.isPending}
                className="flex items-center gap-3 p-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-left disabled:opacity-50"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={block.avatarUrl || undefined} alt={block.username} />
                  <AvatarFallback className="text-xs">
                    {block.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-semibold text-white">{block.username}</span>
                {mutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin ml-auto" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
