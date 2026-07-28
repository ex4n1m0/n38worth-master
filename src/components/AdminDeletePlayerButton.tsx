"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "@/lib/event-feed";
import { Trash2, Loader2, AlertTriangle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";
import { isAdminUser } from "@/lib/admins";

interface AdminDeletePlayerButtonProps {
  targetId: number;
  targetUsername: string;
  targetValue: number;
  ownerCount: number;
  ownedCount: number;
}

/**
 * Admin-only "delete this player" action. Self-renders nothing for non-admins
 * — the server route also enforces the allowlist, this is just defense in
 * depth so a non-admin viewer never even sees the button DOM.
 */
export function AdminDeletePlayerButton({
  targetId,
  targetUsername,
  targetValue,
  ownerCount,
  ownedCount,
}: AdminDeletePlayerButtonProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const { play } = useSound();
  const router = useRouter();
  const queryClient = useQueryClient();

  const refundPerOwner = Math.floor(targetValue / 2);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/delete-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Admin delete failed");
      return data as { success: true; deletedUsername: string };
    },
    onSuccess: async (data) => {
      toast.success(`Deleted "${data.deletedUsername}".`);
      setOpen(false);
      // Invalidate every list that may have rendered this player. The current
      // /players/<username> page will 404 on its next fetch, so push the
      // viewer back to the leaderboard before that flash happens.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
      ]);
      router.replace("/leaderboard");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  if (!isAdminUser(session?.user?.name)) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          onClick={() => play("buttons")}
          className="border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200 font-semibold"
        >
          <Shield className="h-4 w-4 mr-1.5" />
          <Trash2 className="h-4 w-4 mr-1.5" />
          Admin Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Admin Delete: {targetUsername}
          </DialogTitle>
          <DialogDescription className="text-gray-400 space-y-3">
            <p>
              You are about to permanently delete{" "}
              <span className="text-white font-semibold">{targetUsername}</span>.
              This action is{" "}
              <span className="text-red-400 font-semibold">irreversible</span>.
            </p>
            <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 text-sm">
              {ownerCount > 0 && (
                <p>
                  👤 Their <span className="text-white font-semibold">{ownerCount} owner{ownerCount !== 1 ? "s" : ""}</span>{" "}
                  will each receive a refund of{" "}
                  <span className="text-t1-400 font-semibold">{formatCompact(refundPerOwner)}¢</span>{" "}
                  <span className="text-gray-500">(half their current value)</span>
                </p>
              )}
              {ownedCount > 0 && (
                <p>
                  📦 Their <span className="text-white font-semibold">{ownedCount} owned player{ownedCount !== 1 ? "s" : ""}</span>{" "}
                  will be released and their values reset
                </p>
              )}
              <p>
                🗑️ All their data (transactions, messages, history) will be deleted
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="border-gray-700 text-gray-300"
          >
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Player
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
