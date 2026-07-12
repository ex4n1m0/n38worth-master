"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase, X, Check, Coins } from "lucide-react";
import { formatCompact } from "@/lib/utils";
import { PROFESSIONS } from "@/lib/professions";

interface AssignProfessionDialogProps {
  /** The NPC card's user ID */
  targetId: number;
  /** The NPC card's username (for display) */
  targetUsername: string;
  /** The NPC's current profession (if any) */
  currentProfession: string | null;
}

/**
 * Lets a player assign a profession to an NPC card they own.
 * Cost uses the same logic as change-profession.
 * The NPC's value is reset to its floor value on assignment.
 */
export function AssignProfessionDialog({
  targetId,
  targetUsername,
  currentProfession,
}: AssignProfessionDialogProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

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

  const handleConfirm = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/game/assign-profession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, profession: selected }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to assign profession");

      toast.success(
        json.charged > 0
          ? `${targetUsername} is now a ${selected}! (-${formatCompact(json.charged)}¢, value reset to ${formatCompact(json.newValue)}¢)`
          : `${targetUsername} is now a ${selected}! (Free, value reset to ${formatCompact(json.newValue)}¢)`
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
      ]);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign profession");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => { setSelected(null); setOpen(true); }}
        variant="outline"
        size="sm"
        className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 text-[8px] sm:text-[9px] h-6 px-1.5 leading-none"
        title={currentProfession ? "Change NPC profession" : "Add profession to NPC"}
      >
        <Briefcase className="h-3 w-3" />
        {currentProfession ? "Change" : "+ Prof"}
      </Button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900/95 p-5 sm:p-7 shadow-2xl">
            <button
              onClick={() => !submitting && setOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">
                {currentProfession ? "Change Profession" : "Assign Profession"}
              </h2>
              <p className="text-gray-400 mt-2 text-sm">
                {currentProfession ? `${targetUsername} is currently a ${currentProfession}.` : `${targetUsername} has no profession yet.`}
              </p>
              <p className="text-amber-300/70 mt-1 text-xs">
                The card&apos;s value will reset to its floor value. Cost = (others with that profession) × 1,000¢ × your change #. A profession nobody else has is free.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {PROFESSIONS.map((opt) => {
                const isSelected = selected === opt.name;
                const isCurrent = currentProfession === opt.name;
                return (
                  <button
                    key={opt.name}
                    onClick={() => !isCurrent && setSelected(opt.name)}
                    disabled={isCurrent}
                    className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                      isCurrent
                        ? "border-gray-700 bg-gray-800/30 opacity-60 cursor-not-allowed"
                        : isSelected
                          ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20 scale-105"
                          : "border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800/80"
                    }`}
                  >
                    {isSelected && !isCurrent && (
                      <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-gray-900" strokeWidth={3} />
                      </div>
                    )}
                    {isCurrent && (
                      <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wide text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 rounded px-1.5 py-0.5">
                        Current
                      </span>
                    )}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-gray-950/50 border border-gray-700/50 flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={opt.imagePath} alt={opt.name} className="w-full h-full object-contain p-1" />
                    </div>
                    <span className={`text-xs font-semibold text-center leading-tight ${isSelected ? "text-amber-300" : "text-gray-300"}`}>
                      {opt.name}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={() => setOpen(false)}
                disabled={submitting}
                variant="outline"
                className="border-gray-600 text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!selected || submitting}
                className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-gray-900 font-bold"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Assigning...</>
                ) : (
                  <><Check className="h-4 w-4 mr-1" /> Confirm</>
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
