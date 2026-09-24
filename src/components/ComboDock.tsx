"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { Sparkles, X } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { ProfessionComboBar, formatFirewallWait } from "@/components/ProfessionComboBar";
import { useOnboarding } from "@/components/OnboardingContext";
import {
  useProfessionComboSelection,
  useComboStore,
  useComboFirewallMsLeft,
  ORDERED_PROFESSIONS,
  type ComboPlayer,
} from "@/hooks/useProfessionComboSelection";
import { useMissionLevel } from "@/hooks/useMissionLevel";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";
import { professionName } from "@/lib/professions";
import { useLanguage } from "./LanguageContext";

/** Expansion state of the combo dock — shared so the navbar pill, the corner
 *  widget, and the keyboard layer (C / Esc) all control the same panel. */
interface DockState {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}
export const useComboDock = create<DockState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  setOpen: (open) => set({ open }),
}));

/** Card currently under the pointer in the market grid — powers the 1-6
 *  "assign to combo slot" keys. Only set for combo-eligible (owned,
 *  profession-carrying) cards. */
export interface HoveredComboCard extends ComboPlayer {
  profession: string;
}
interface HoveredState {
  card: HoveredComboCard | null;
  set: (card: HoveredComboCard | null) => void;
}
export const useHoveredCardStore = create<HoveredState>((set) => ({
  card: null,
  set: (card) => set({ card }),
}));

/**
 * Collapsed combo pill — progress pips + state at a glance:
 *   "4/6"            building
 *   "2.1M¢" (amber)  complete, one tap from selling
 *   "🔒 12:44" (cyan) complete but firewalled — live countdown
 * Rendered in the mobile bottom tab bar (center slot) and as the desktop
 * corner widget.
 */
export function ComboDockPill({ className = "" }: { className?: string }) {
  const combo = useProfessionComboSelection();
  const firewallMsLeft = useComboFirewallMsLeft();
  const { play } = useSound();
  const { t } = useLanguage();
  const setOpen = useComboDock((s) => s.setOpen);

  const complete = combo.isComplete;
  const locked = complete && firewallMsLeft > 0;

  return (
    <button
      type="button"
      data-tutorial="combo-pill"
      onClick={() => {
        play("open");
        setOpen(true);
      }}
      aria-label={t.comboPillAria.replace("{count}", String(combo.selectedCount))}
      className={`relative flex flex-col items-center justify-center gap-1 min-h-[44px] px-3.5 rounded-full border shadow-xl backdrop-blur-sm transition-all select-none ${
        locked
          ? "border-cyan-400/70 bg-gray-950/95 text-cyan-300"
          : complete
            ? "border-amber-400/80 bg-amber-950/90 text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.4)] animate-pulse"
            : "border-white/15 bg-gray-950/95 text-gray-200 hover:border-white/30 hover:text-white"
      } ${className}`}
    >
      <span className="flex items-center gap-1.5 font-bold text-[13px] leading-none">
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="tabular-nums">
          {locked
            ? formatFirewallWait(firewallMsLeft)
            : complete
              ? `${formatCompact(combo.reward)}¢`
              : `${combo.selectedCount}/6`}
        </span>
      </span>
      {/* 6 profession pips — lit amber when the slot is filled */}
      <span className="flex items-center gap-1" aria-hidden>
        {combo.slots.map((s) => (
          <span
            key={s.profession}
            className={`h-1 w-3 rounded-full transition-colors ${
              s.player ? "bg-amber-400" : "bg-gray-700"
            }`}
          />
        ))}
      </span>
    </button>
  );
}

/**
 * The persistent combo dock: collapsed pill (desktop corner / mobile navbar
 * center) expanding into the full combo workbench. Mounted once in the game
 * layout; hidden until the game is unlocked (mission 0, 20 avatars). Also
 * owns the global keyboard layer: C toggles the dock, Esc closes it, "/"
 * focuses the market search, and 1-6 assign the hovered market card to that
 * profession slot.
 */
export function ComboDock() {
  const { state: onboarding } = useOnboarding();
  const missionLevel = useMissionLevel();
  const gameUnlocked = missionLevel >= 1;
  const combo = useProfessionComboSelection();
  const { open, setOpen, toggle } = useComboDock();
  const { play } = useSound();
  const { t, locale } = useLanguage();

  // Global keyboard layer (desktop / keyboard-on-tablet power users).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target?.closest?.(
        "input, textarea, select, [contenteditable=true]"
      );

      if (e.key === "Escape") {
        if (useComboDock.getState().open) setOpen(false);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        play("toggle");
        toggle();
        return;
      }
      if (e.key === "/") {
        const input = document.querySelector<HTMLInputElement>(
          'input[placeholder="Search players..."]'
        );
        if (input) {
          e.preventDefault();
          input.focus();
        }
        return;
      }
      // 1-6: assign the hovered market card to that profession slot.
      if (e.key >= "1" && e.key <= "6") {
        const hovered = useHoveredCardStore.getState().card;
        if (!hovered) return;
        const slotProfession = ORDERED_PROFESSIONS[Number(e.key) - 1];
        if (hovered.profession !== slotProfession) {
          toast.info(
            t.comboKeyMismatch
              .replace("{username}", hovered.username)
              .replace("{profession}", professionName(hovered.profession, locale))
              .replace("{key}", e.key)
              .replace("{slotProfession}", professionName(slotProfession, locale))
          );
          return;
        }
        play("toggle");
        useComboStore.getState().toggle(hovered, slotProfession);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpen, toggle, play, t, locale]);

  if (!onboarding.onboardingComplete || !gameUnlocked) return null;

  return (
    <>
      {/* Desktop corner widget (mobile reaches the pill via the bottom tab bar). */}
      {!open && (
        <div className="hidden md:block fixed bottom-4 right-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <ComboDockPill />
        </div>
      )}

      {/* Expanded workbench — bottom sheet on mobile, corner panel on desktop. */}
      {open && (
        <>
          {/* Mobile backdrop (desktop panel is non-modal). */}
          <div
            className="md:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]"
            onClick={() => {
              play("close");
              setOpen(false);
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label={t.comboDockAria}
            className="fixed z-[70] inset-x-0 bottom-0 rounded-t-2xl border-t md:rounded-2xl border md:border border-gray-700 bg-gray-950/[0.98] backdrop-blur-xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3 shadow-2xl md:inset-auto md:bottom-4 md:right-4 md:w-[min(780px,calc(100vw-2.5rem))] animate-in fade-in slide-in-from-bottom-3 duration-200"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-[0.2em]">
                <Sparkles className="h-4 w-4 text-amber-300" />
                {t.comboWorkbenchTitle}
                <span className="text-gray-500 normal-case tracking-normal font-medium">
                  {t.comboFollowsYou}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  play("close");
                  setOpen(false);
                }}
                aria-label={t.comboCloseAria}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ProfessionComboBar combo={combo} />
          </div>
        </>
      )}
    </>
  );
}
