"use client";

import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
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
import { signOutCompat as signOut } from "@/lib/session-compat";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";
import { useLanguage } from "@/components/LanguageContext";

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
  const { t } = useLanguage();

  const refundPerOwner = Math.floor(playerValue / 2);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.deleteAccountFailed);
      return data;
    },
    onSuccess: async () => {
      toast.success(t.accountDeleted);
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
          {t.deleteAccount}
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-800">
        <DialogHeader>
          <DialogTitle className="text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            {t.deleteAccountPermanently}
          </DialogTitle>
          <DialogDescription className="text-gray-400 space-y-3">
            <p>
              {t.deleteActionPrefix} <span className="text-red-400 font-semibold">{t.deletePermanentSpan}</span>.
            </p>
            <div className="bg-gray-800/80 rounded-lg p-3 space-y-2 text-sm">
              {ownerCount > 0 && (
                <p>
                  {t.deleteOwnersPrefix}{" "}
                  <span className="text-white font-semibold">{ownerCount} {ownerCount !== 1 ? t.xOwners : t.xOwner}</span>{" "}
                  {t.deleteRefundMiddle}{" "}
                  <span className="text-t1-400 font-semibold">{formatCompact(refundPerOwner)}¢</span>{" "}
                  <span className="text-gray-500">{t.deleteHalfValue}</span>
                </p>
              )}
              {ownedCount > 0 && (
                <p>
                  {t.deleteOwnedPrefix}{" "}
                  <span className="text-white font-semibold">{ownedCount} {ownedCount !== 1 ? t.xOwnedPlayers : t.xOwnedPlayer}</span>{" "}
                  {t.deleteOwnedSuffix}
                </p>
              )}
              <p>
                {t.deleteDataNote}
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
            {t.cancel}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-red-600 hover:bg-red-500 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                {t.deleting}
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                {t.deleteAccount}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
