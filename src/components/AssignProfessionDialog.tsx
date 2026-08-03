"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Button } from "@/components/ui/button";
import { Loader2, Briefcase, X, Check, Coins } from "lucide-react";
import { formatCompact } from "@/lib/utils";

interface ProfessionOption {
  name: string;
  imagePath: string;
  count: number;
  cost: number;
  isCurrent: boolean;
}

interface ChangeProfessionData {
  current: string | null;
  credits: number;
  paidChanges: number;
  multiplier: number;
  options: ProfessionOption[];
}

interface AssignProfessionDialogProps {
  /** The NPC Avatar's user ID */
  targetId: number;
  /** The NPC Avatar's username (for display) */
  targetUsername: string;
  /** The NPC's current profession (if any) */
  currentProfession: string | null;
  /** Optional override for the trigger button styling (e.g. pill look on Avatars). */
  triggerClassName?: string;
  /** Forced mode: no trigger button, parent-controlled open state, and the
      dialog cannot be dismissed — used for the mandatory first profession
      right after hiring a professionless NPC. */
  forced?: boolean;
  /** Controls visibility in forced mode. */
  forcedOpen?: boolean;
  /** Called after a successful assignment in forced mode. */
  onForcedAssigned?: () => void;
}

/**
 * Lets a player assign a profession to an NPC Avatar they own.
 * Cost uses the same logic as change-profession.
 * The NPC's value is reset to its floor value on assignment.
 */
export function AssignProfessionDialog({
  targetId,
  targetUsername,
  currentProfession,
  triggerClassName,
  forced = false,
  forcedOpen = false,
  onForcedAssigned,
}: AssignProfessionDialogProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [internalOpen, setInternalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ChangeProfessionData | null>(null);

  // In forced mode the parent controls visibility; otherwise local state does.
  const open = forced ? forcedOpen : internalOpen;
  const setOpen = forced ? () => {} : setInternalOpen;

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

  // Fetch profession cost data (same endpoint as change-profession — the cost
  // logic is identical: based on how many others have each profession and the
  // caller's paid change count).
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/profile/change-profession");
      if (!res.ok) throw new Error("Failed to load profession options");
      const json: ChangeProfessionData = await res.json();
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load profession options");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const openDialog = () => {
    setSelected(null);
    setOpen(true);
    void load();
  };

  // Forced mode: load the options as soon as the parent opens the dialog,
  // and reset whenever the queue advances to a different NPC (targetId).
  useEffect(() => {
    if (forced && forcedOpen) {
      setSelected(null);
      void load();
    }
  }, [forced, forcedOpen, targetId, load]);

  // First assignment (the NPC has no profession yet — the forced choice when
  // it was hired): the cheapest profession(s) are free. The assign-profession
  // API enforces the same rule server-side; this only mirrors it for display.
  const isFirstAssignment = !currentProfession;
  const minCost = data ? Math.min(...data.options.map((o) => o.cost)) : 0;
  const freeOnFirst = (cost: number) => isFirstAssignment && cost === minCost;

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
      if (forced) {
        onForcedAssigned?.();
      } else {
        setOpen(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign profession");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {!forced && (
        <Button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); openDialog(); }}
          variant="outline"
          size="sm"
          className={triggerClassName ?? "border border-purple-800 text-purple-200 bg-transparent hover:bg-purple-900/30 hover:text-white font-bold h-7 px-2 text-xs"}
        >
          <Briefcase className="h-3 w-3 mr-1" />
          {currentProfession ? "Change Profession" : "Assign Profession"}
        </Button>
      )}

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900/95 p-5 sm:p-7 shadow-2xl">
            {!forced && (
              <button
                onClick={() => !submitting && setOpen(false)}
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">
                {forced ? "Profession Required" : currentProfession ? "Change Profession" : "Assign Profession"}
              </h2>
              <p className="text-gray-400 mt-2 text-sm">
                {forced
                  ? `You hired ${targetUsername} — pick a profession to continue.`
                  : currentProfession
                    ? `${targetUsername} is currently a ${currentProfession}.`
                    : `${targetUsername} has no profession yet.`}
              </p>
              <p className="text-amber-300/70 mt-1 text-xs">
                The Avatar&apos;s value will reset to its floor value. Cost = (others with that profession) × {formatCompact(1000)}¢ × your change #. A profession nobody else has is free.
                {isFirstAssignment && " First assignment: the cheapest profession(s) are free — later changes pay the normal cost."}
              </p>
              {data && (
                <div className="mt-3 flex items-center justify-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <Coins className="h-3.5 w-3.5" />
                    {formatCompact(Math.floor(data.credits))}¢
                  </span>
                  <span className="text-gray-500">
                    Change #{data.multiplier} (×{data.multiplier} multiplier)
                  </span>
                </div>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              </div>
            ) : !data ? (
              <p className="text-center text-gray-400 py-8 text-sm">Could not load professions.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                {data.options.map((opt) => {
                  const isSelected = selected === opt.name;
                  const isCurrent = currentProfession === opt.name;
                  const effectiveCost = freeOnFirst(opt.cost) ? 0 : opt.cost;
                  const affordable = effectiveCost === 0 || data.credits >= effectiveCost;
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
                      <span className={`text-[10px] font-bold tabular-nums ${effectiveCost === 0 ? "text-green-400" : affordable ? "text-amber-400" : "text-red-400"}`}>
                        {effectiveCost === 0
                          ? freeOnFirst(opt.cost) && opt.cost > 0
                            ? "Free (1st)"
                            : "Free"
                          : `${formatCompact(effectiveCost)}¢`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              {!forced && (
                <Button
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  variant="outline"
                  className="border-gray-600 text-gray-300 hover:bg-gray-800"
                >
                  Cancel
                </Button>
              )}
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
