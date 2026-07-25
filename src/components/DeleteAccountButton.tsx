"use client";

import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";

interface DeleteAccountButtonProps {
  playerValue: number;
  ownerCount: number;
  ownedCount: number;
}

export function DeleteAccountButton({
  playerValue,
  ownerCount,
  ownedCount,
}: DeleteAccountButtonProps) {
  const [open, setOpen] = useState(false);
  const { play } = useSound();

  const refundPerOwner = Math.floor(playerValue / 2);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Account deletion failed");
      return data;
    },
    onSuccess: async () => {
      toast.success("Your account has been permanently deleted.");
      setOpen(false);
      // Sign out and redirect to login
      await signOut({ callbackUrl: "/login" });
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          onClick={() => play("open")}
          className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-semibold"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Delete Account Permanently
          </DialogTitle>
          <DialogDescription className="text-gray-400 space-y-3">
            <p>
              This action is <span className="text-red-400 font-semibold">permanent and cannot be undone</span>.
            </p>
            <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 text-sm">
              {ownerCount > 0 && (
                <p>
                  👤 Your <span className="text-white font-semibold">{ownerCount} owner{ownerCount !== 1 ? "s" : ""}</span> will
                  each receive a refund of{" "}
                  <span className="text-t1-400 font-semibold">{formatCompact(refundPerOwner)}¢</span>{" "}
                  <span className="text-gray-500">(half your current value)</span>
                </p>
              )}
              {ownedCount > 0 && (
                <p>
                  📦 Your <span className="text-white font-semibold">{ownedCount} owned player{ownedCount !== 1 ? "s" : ""}</span> will
                  be released and their values reset
                </p>
              )}
              <p>
                🗑️ All your data (transactions, messages, history) will be deleted
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
                Delete Account
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
