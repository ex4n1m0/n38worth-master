"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, X } from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { useLanguage } from "@/components/LanguageContext";

interface RenameNpcDialogProps {
  /** The NPC card's user ID */
  targetId: number;
  /** The NPC card's current username (for display) */
  targetUsername: string;
  /** Optional override for the trigger button styling. */
  triggerClassName?: string;
}

/**
 * Lets the owner of an NPC card rename it. Each owner gets ONE rename per
 * ownership stint — the allowance resets when a new owner hires the card.
 */
export function RenameNpcDialog({
  targetId,
  targetUsername,
  triggerClassName,
}: RenameNpcDialogProps) {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => setMounted(true), []);

  // Lock background page scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const trimmed = name.trim();
  const valid = /^[a-zA-Z0-9_]{3,30}$/.test(trimmed);

  const openDialog = () => {
    setName("");
    setOpen(true);
  };

  const handleConfirm = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/game/rename-npc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, newUsername: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t.renameFailed);

      play("reward");
      toast.success(
        t.renameSuccess.replace("{oldName}", json.oldUsername).replace("{newName}", json.newUsername)
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
      ]);
      setOpen(false);
    } catch (e) {
      play("error");
      toast.error(e instanceof Error ? e.message : t.renameFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDialog(); }}
        variant="outline"
        size="sm"
        className={triggerClassName ?? "border border-purple-800 text-purple-200 bg-transparent hover:bg-purple-900/30 hover:text-white font-bold h-7 px-2 text-xs"}
      >
        <Pencil className="h-3 w-3 mr-1" />
        {t.rename}
      </Button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900/95 p-5 sm:p-7 shadow-2xl">
            <button
              onClick={() => !submitting && setOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50"
              aria-label={t.close}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">
                {t.renameTitle.replace("{name}", targetUsername)}
              </h2>
              <p className="text-amber-300/70 mt-2 text-xs">
                {t.renamePerkHint}
              </p>
            </div>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
              placeholder={t.renamePlaceholder}
              maxLength={30}
              autoFocus
              className="w-full rounded-lg border border-gray-700 bg-gray-800/80 px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400 mb-2"
            />
            <p className="text-xs text-gray-500 mb-5">
              {t.renameRules}
            </p>

            <Button
              onClick={handleConfirm}
              disabled={!valid || submitting}
              className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t.renameOneTime
              )}
            </Button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
