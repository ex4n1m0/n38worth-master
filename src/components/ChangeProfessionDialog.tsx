"use client";

import { useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Button } from "@/components/ui/button";
import { Loader2, Repeat, X, Check, Coins } from "lucide-react";
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

interface ChangeProfessionDialogProps {
  /** The profile owner's username — used to refresh their player query on success. */
  username: string;
}

/**
 * Lets a player change THEIR OWN profession. Cost per profession is shown up
 * front: (other players with that profession) × 1000 × change-number, with any
 * profession nobody else has being free. Only ever changes the signed-in user.
 */
export function ChangeProfessionDialog({ username }: ChangeProfessionDialogProps) {
  const queryClient = useQueryClient();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<ChangeProfessionData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Lock background page scroll while the modal is open so mobile scrolling
  // doesn't "jump" between the page and the modal.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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

  const closeDialog = () => {
    if (submitting) return;
    setOpen(false);
  };

  const selectedOption = data?.options.find((o) => o.name === selected) ?? null;

  const handleConfirm = async () => {
    if (!selectedOption || submitting || selectedOption.isCurrent) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/profile/change-profession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profession: selectedOption.name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to change profession");

      toast.success(
        json.charged > 0
          ? `You are now a ${selectedOption.name}! (-${formatCompact(json.charged)}¢)`
          : `You are now a ${selectedOption.name}! (Free)`
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player", username] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to change profession");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        onClick={openDialog}
        variant="outline"
        size="sm"
        className="border-amber-500/50 text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 h-7 px-2 text-xs"
      >
        <Repeat className="h-3 w-3 mr-1" />
        Change Profession
      </Button>

      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900/95 p-5 sm:p-7 shadow-2xl">
            <button
              onClick={closeDialog}
              disabled={submitting}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-50"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-300 to-yellow-400 bg-clip-text text-transparent">
                Change Your Profession
              </h2>
              <p className="text-gray-400 mt-2 text-sm">
                Cost = (other players with that profession) × {formatCompact(1000)}¢ × your change number.
                A profession nobody else has is free.
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
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {data.options.map((opt) => {
                    const isSelected = selected === opt.name;
                    const disabled = opt.isCurrent;
                    const affordable = opt.cost === 0 || data.credits >= opt.cost;
                    return (
                      <button
                        key={opt.name}
                        onClick={() => !disabled && setSelected(opt.name)}
                        disabled={disabled}
                        className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                          disabled
                            ? "border-gray-700 bg-gray-800/30 opacity-60 cursor-not-allowed"
                            : isSelected
                              ? "border-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20 scale-105"
                              : "border-gray-700 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800/80"
                        }`}
                      >
                        {isSelected && !disabled && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                            <Check className="h-3.5 w-3.5 text-gray-900" strokeWidth={3} />
                          </div>
                        )}
                        {opt.isCurrent && (
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
                        <span className="text-[10px] text-gray-500 leading-tight">
                          {formatCompact(opt.count)} other{opt.count === 1 ? "" : "s"}
                        </span>
                        {/* Cost badge — always visible */}
                        <span
                          className={`text-[11px] font-bold rounded px-2 py-0.5 ${
                            opt.cost === 0
                              ? "text-green-400 bg-green-500/10 border border-green-500/30"
                              : affordable
                                ? "text-amber-300 bg-amber-500/10 border border-amber-500/30"
                                : "text-red-400 bg-red-500/10 border border-red-500/30"
                          }`}
                        >
                          {opt.cost === 0 ? "Free" : `${formatCompact(opt.cost)}¢`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="sticky bottom-0 -mx-5 sm:-mx-7 -mb-5 sm:-mb-7 px-5 sm:px-7 pt-3 pb-5 sm:pb-7 bg-gradient-to-t from-gray-900 via-gray-900/95 to-gray-900/80 border-t border-gray-800 flex justify-center">
                  <Button
                    onClick={handleConfirm}
                    disabled={!selectedOption || submitting || (!!selectedOption && selectedOption.cost > 0 && data.credits < selectedOption.cost)}
                    className="w-full sm:w-auto px-8 py-3 rounded-lg font-bold bg-gradient-to-r from-amber-500 to-yellow-500 text-gray-900 hover:from-amber-400 hover:to-yellow-400 shadow-lg shadow-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        Changing...
                      </>
                    ) : !selectedOption ? (
                      "Select a Profession"
                    ) : selectedOption.cost === 0 ? (
                      `Change to ${selectedOption.name} (Free)`
                    ) : (
                      `Change for ${formatCompact(selectedOption.cost)}¢`
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
