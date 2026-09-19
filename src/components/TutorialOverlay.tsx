"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Coins,
  Compass,
  GraduationCap,
  Radio,
  Sparkles,
  Target,
  Terminal,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { useOnboarding } from "@/components/OnboardingContext";
import { useSound } from "@/hooks/useSound";
import { Button } from "@/components/ui/button";

/**
 * Step-by-step onboarding tutorial overlay.
 *
 * - Auto-opens once per login while users.tutorial_completed = 0 AND the
 *   profession onboarding is finished (so it never stacks with the profession
 *   picker). Finishing or cancelling persists 1 / 2 via POST /api/tutorial.
 * - Spotlight-anchored steps target stable `data-tutorial="…"` hooks on the
 *   global chrome (header rows, bottom tab bar, combo pill, avatar menu) so
 *   the tutorial works from any page. If the anchor isn't in the DOM (e.g.
 *   the combo pill before mission 0 is done) the step falls back to a
 *   centered card.
 * - Geometry is applied imperatively from a single rAF loop (no per-frame
 *   React renders): the spotlight box paints the dark scrim via a giant
 *   box-shadow, and the card slides above/below the box depending on space.
 * - Controls per requirement: Previous / Skip step / Next (Finish on the
 *   last step), and an ✕ that cancels the whole tutorial. Esc cancels,
 *   ←/→ (or p/n) step through. While open, all other app hotkeys (C, /,
 *   1-6) are swallowed.
 * - Settings → "Replay tutorial" resets tutorial_completed to 0, so the
 *   overlay returns on the next login / page load.
 */

interface TutorialStep {
  id: string;
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
  /** data-tutorial attribute value to spotlight; omit for a centered card. */
  anchor?: string;
}

const STEPS: TutorialStep[] = [
  {
    id: "welcome",
    icon: Terminal,
    title: "Welcome to the Simulation",
    body: (
      <>
        Every player here is a card — including you. Hire other players to
        build your portfolio, get hired to earn credits, and grow your net
        worth. The first to <span className="text-cyan-300">root the mainframe</span> ends
        the game and takes the wall.
      </>
    ),
  },
  {
    id: "wallet",
    icon: Coins,
    title: "Your wallet",
    anchor: "wallet",
    body: (
      <>
        <span className="text-cyan-300">Credits (¢)</span> are what you hire
        cards with. <span className="text-cyan-300">Value</span> is what others
        pay for <em>you</em> — it climbs every time someone hires your card,
        plus portfolio rewards every 30 minutes.
      </>
    ),
  },
  {
    id: "tabs",
    icon: Compass,
    title: "Two tabs",
    anchor: "nav-tabs",
    body: (
      <>
        <span className="text-cyan-300">Home</span> is your empire — profile,
        owned cards, ranks and global chat.{" "}
        <span className="text-cyan-300">Avatars</span> is the open market where
        you browse, search and hire.
      </>
    ),
  },
  {
    id: "market",
    icon: Users,
    title: "Hiring cards",
    body: (
      <>
        Open the <span className="text-cyan-300">Avatars</span> tab, filter by
        profession or price, and tap a card to hire it. Your hire slots (shown
        in the header) cap how many cards you can own — earn more by completing
        missions.
      </>
    ),
  },
  {
    id: "combo",
    icon: Sparkles,
    title: "Profession combos",
    anchor: "combo-pill",
    body: (
      <>
        Every card has a profession. Own 4+ of the same kind to arm a combo:{" "}
        <span className="text-cyan-300">OVERCLOCK</span> multiplies their
        value, <span className="text-cyan-300">FIREWALL</span> shields them
        from forced sales. Build them in the combo dock — the pill in the
        bottom bar (or the bottom-right corner), or press{" "}
        <kbd className="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 font-mono text-[11px] text-gray-300">C</kbd>
      </>
    ),
  },
  {
    id: "missions",
    icon: Target,
    title: "Missions",
    anchor: "mission-bar",
    body: (
      <>
        Collect cards to complete missions. Each one pays{" "}
        <span className="text-cyan-300">+50 hire slots</span>, reward cards and
        a free NPC. Your progress is always in the header.
      </>
    ),
  },
  {
    id: "events",
    icon: Radio,
    title: "Stay wired in",
    anchor: "event-feed",
    body: (
      <>
        The ticker streams every market move in real time.{" "}
        <span className="text-cyan-300">Global Chat</span> (on Home) is where
        players coordinate — and raid each other.
      </>
    ),
  },
  {
    id: "finish",
    icon: GraduationCap,
    title: "You're set",
    anchor: "account-menu",
    body: (
      <>
        Your avatar menu opens <span className="text-cyan-300">Settings</span> —
        sound, avatar, password… and this tutorial: replay it from there any
        time. Good luck — root the mainframe.
      </>
    ),
  },
];

const clamp = (v: number, min: number, max: number) =>
  Math.min(Math.max(v, min), max);

export function TutorialOverlay() {
  const { state, loading, refresh } = useOnboarding();
  const { play } = useSound();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const scrimRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const anchorElRef = useRef<Element | null>(null);
  const autoShownRef = useRef(false);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  useEffect(() => setMounted(true), []);

  // Auto-open once per mount (= per login / hard page load) while the tutorial
  // is unfinished. Gated on onboardingComplete so it never stacks with the
  // profession picker; the short delay lets the page settle first.
  useEffect(() => {
    if (loading || autoShownRef.current) return;
    if (!state.onboardingComplete) return;
    if (state.tutorialCompleted !== 0) return;
    autoShownRef.current = true;
    const timer = setTimeout(() => {
      setStepIndex(0);
      setOpen(true);
      play("open");
    }, 900);
    return () => clearTimeout(timer);
  }, [loading, state.onboardingComplete, state.tutorialCompleted, play]);

  const postTutorialState = useCallback(
    (action: "complete" | "cancel") => {
      fetch("/api/tutorial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
        .then(() => refresh())
        .catch((err) => console.error("Failed to persist tutorial state:", err));
    },
    [refresh]
  );

  const finishTutorial = useCallback(() => {
    setOpen(false);
    play("confirm");
    postTutorialState("complete");
  }, [play, postTutorialState]);

  const cancelTutorial = useCallback(() => {
    setOpen(false);
    play("close");
    postTutorialState("cancel");
  }, [play, postTutorialState]);

  const advance = useCallback(() => {
    if (isLast) {
      finishTutorial();
      return;
    }
    play("toggle");
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }, [isLast, finishTutorial, play]);

  const goBack = useCallback(() => {
    play("toggle");
    setStepIndex((i) => Math.max(0, i - 1));
  }, [play]);

  // Reset the resolved anchor when the step changes.
  useEffect(() => {
    anchorElRef.current = null;
    cardRef.current?.focus({ preventScroll: true });
  }, [stepIndex]);

  // Imperative geometry loop: resolves the step's anchor, positions the
  // spotlight + card, and paints/clears the scrim. Runs per frame but never
  // re-renders React, so it stays cheap even on card-heavy pages.
  useEffect(() => {
    if (!open) return;
    let raf = 0;

    const frame = () => {
      const card = cardRef.current;
      const scrim = scrimRef.current;
      const highlight = highlightRef.current;
      if (!card || !scrim || !highlight) {
        raf = requestAnimationFrame(frame);
        return;
      }

      // Resolve the anchor: keep the cached element while it stays attached
      // and visible; otherwise pick the first visible match (anchors render
      // twice — desktop + mobile chrome — but only one has a nonzero rect).
      let el = anchorElRef.current;
      if (
        !step.anchor ||
        !el ||
        !document.contains(el) ||
        el.getBoundingClientRect().width === 0
      ) {
        el = step.anchor
          ? Array.from(
              document.querySelectorAll<HTMLElement>(
                `[data-tutorial="${step.anchor}"]`
              )
            ).find((candidate) => {
              const r = candidate.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }) ?? null
          : null;
        anchorElRef.current = el;
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;

      if (el) {
        const r = el.getBoundingClientRect();
        const pad = 8;
        const margin = 12;
        const left = clamp(r.left - pad, 0, vw);
        const top = clamp(r.top - pad, 0, vh);
        const w = Math.min(r.width + pad * 2, vw - left);
        const h = Math.min(r.height + pad * 2, vh - top);

        scrim.style.background = "transparent";
        highlight.style.display = "block";
        highlight.style.transform = `translate(${left}px, ${top}px)`;
        highlight.style.width = `${w}px`;
        highlight.style.height = `${h}px`;

        // Prefer below the spotlight, then above, then centered.
        let y = top + h + margin;
        if (y + ch > vh - margin) {
          y = top - margin - ch;
          if (y < margin) y = clamp((vh - ch) / 2, margin, Math.max(margin, vh - ch - margin));
        }
        const x = clamp(left + w / 2 - cw / 2, margin, Math.max(margin, vw - cw - margin));
        card.style.transform = `translate(${x}px, ${y}px)`;
      } else {
        // Centered card: no spotlight hole, painted scrim instead.
        scrim.style.background = "rgba(0,0,0,0.85)";
        highlight.style.display = "none";
        card.style.transform = `translate(${(vw - cw) / 2}px, ${(vh - ch) / 2}px)`;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open, stepIndex, step.anchor]);

  // Keyboard layer while open: ←/→ (or p/n) step, Esc cancels. Everything
  // else single-key is swallowed (capture phase) so the app's own hotkeys —
  // C, /, 1-6 — can't fire behind the backdrop.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancelTutorial();
      } else if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        e.stopPropagation();
        advance();
      } else if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        e.preventDefault();
        e.stopPropagation();
        if (stepIndex > 0) goBack();
      } else {
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, stepIndex, advance, goBack, cancelTutorial]);

  // Freeze the page behind the overlay (all anchors live in the always-
  // visible chrome, so nothing needs scrolling into view).
  useEffect(() => {
    if (!open) return;
    const prevent = (e: Event) => e.preventDefault();
    document.addEventListener("wheel", prevent, { passive: false });
    document.addEventListener("touchmove", prevent, { passive: false });
    const origOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("wheel", prevent);
      document.removeEventListener("touchmove", prevent);
      document.documentElement.style.overflow = origOverflow;
    };
  }, [open]);

  if (!mounted || !open) return null;

  const Icon = step.icon;

  return createPortal(
    <div
      ref={scrimRef}
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
      className="fixed inset-0 z-[90]"
      style={{ background: "rgba(0,0,0,0.85)" }}
    >
      {/* Spotlight box — the huge box-shadow IS the scrim around the hole. */}
      <div
        ref={highlightRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 rounded-xl border-2 border-cyan-400/80 shadow-[0_0_0_200vmax_rgba(0,0,0,0.85)] transition-[transform,width,height] duration-200 will-change-transform"
        style={{ display: "none" }}
      />

      {/* Step card */}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute left-0 top-0 w-[min(92vw,26rem)] rounded-2xl border border-cyan-500/30 bg-gray-900/95 p-5 shadow-2xl outline-none backdrop-blur-xl transition-transform duration-200 will-change-transform"
      >
        <button
          type="button"
          onClick={cancelTutorial}
          aria-label="Exit tutorial"
          title="Exit tutorial"
          className="absolute right-3 top-3 rounded-md p-1 text-gray-500 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/10">
            <Icon className="h-5 w-5 text-cyan-300" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-400/80">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h3 className="mt-0.5 text-lg font-bold leading-tight text-white">
              {step.title}
            </h3>
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-gray-300">{step.body}</p>

        <div className="mt-5 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={stepIndex === 0}
            className="text-gray-300 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          {!isLast && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={advance}
              className="text-gray-400 hover:text-white"
            >
              Skip
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={advance}
            className="ml-auto bg-t1-600 px-4 text-white hover:bg-t1-500"
          >
            {isLast ? "Finish" : "Next"}
            {isLast ? (
              <GraduationCap className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
