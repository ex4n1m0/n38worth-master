"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
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
import { useLanguage } from "./LanguageContext";

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
  const { t } = useLanguage();

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
          const error = new Error(data.error || t.hardLockLimitReached) as Error & {
            activeBlocks: ActiveBlock[];
          };
          error.activeBlocks = data.activeBlocks;
          throw error;
        }
        throw new Error(data.error || t.hardLockUpdateFailed);
      }
      return data;
    },
    onSuccess: (data) => {
      setDialogOpen(false);
      setActiveBlocks([]);
      if (data.permBlockUntil) {
        toast.success(t.hardLockProtectedToast.replace("{name}", targetUsername));
      } else {
        toast.success(t.hardLockRemovedToast.replace("{name}", targetUsername));
      }
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] });
    },
    onError: (err: Error & { activeBlocks?: ActiveBlock[] }) => {
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
    if (isActive) {
      const ok = window.confirm(t.hardLockRemoveConfirm.replace("{name}", targetUsername));
      if (!ok) return;
    }
    // Expired blocks (assigned but no longer active) fall through here and
    // get a FRESH block assigned — the server treats expired as unassigned.
    mutation.mutate({});
  };

  const handleMove = (sourceId: number) => {
    mutation.mutate({ sourceId });
  };

  const sizeClasses =
    size === "sm"
      ? "text-xs py-1 px-2 h-auto"
      : "text-xs py-2 px-3 h-auto";

  return (
    <>
      <Button
        onClick={handleClick}
        disabled={mutation.isPending}
        className={`rounded-md flex items-center justify-center gap-1.5 font-bold ${sizeClasses} ${
          isActive
            ? "border border-purple-500 text-white bg-purple-800/60 hover:bg-purple-700/60"
            : "border border-purple-800 text-purple-200 bg-transparent hover:bg-purple-900/30 hover:text-white"
        } ${className}`}
      >
        {mutation.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Shield className={`h-3.5 w-3.5 ${isActive ? "fill-purple-300/60 text-purple-200" : "text-purple-300"}`} />
        )}
        {isActive ? t.hardLockRemove : t.hardLockAssign}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.hardLockMoveTitle}</DialogTitle>
            <DialogDescription>
              {t.hardLockMoveDesc}
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
