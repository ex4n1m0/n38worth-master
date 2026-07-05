"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


type Stats = {
  totalPlayers: number;
  totalEconomy: number;
  totalNpcs: number;
  totalHumans: number;
};

/** Eased count-up from 0 to `target` whenever the target changes. */
function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) {
      setValue(0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.floor(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Stat({
  label,
  value,
  suffix,
  compact,
}: {
  label: string;
  value: number;
  suffix?: string;
  compact?: boolean;
}) {
  const n = useCountUp(value);
  const text = compact
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n)
    : n.toLocaleString();
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums">
        {text}
        {suffix}
      </span>
      <span className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-400">{label}</span>
    </div>
  );
}

export default function Home() {
  const [gameplayOpen, setGameplayOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/game/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d) setStats(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-gray-100 overflow-x-hidden">
      {/* ===== Hero ===== */}
      <section className="relative min-h-[140vh] sm:min-h-screen flex flex-col items-center justify-center px-6 text-center overflow-hidden">
        {/* Background image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/endgame.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />

        {/* Drifting aurora blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="lp-aurora absolute -top-1/4 -left-1/4 h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,var(--t1-600),transparent_60%)] opacity-30 blur-3xl" />
          <div
            className="lp-aurora absolute -bottom-1/3 -right-1/4 h-[55vmax] w-[55vmax] rounded-full bg-[radial-gradient(circle,var(--t2-600),transparent_60%)] opacity-25 blur-3xl"
            style={{ animationDelay: "-6s" }}
          />
          <div
            className="lp-aurora absolute top-1/3 left-1/2 h-[40vmax] w-[40vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--t1-500),transparent_60%)] opacity-20 blur-3xl"
            style={{ animationDelay: "-12s" }}
          />
        </div>

        {/* Overlays for depth + readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,black_85%)]" />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center gap-6 translate-y-[100px] sm:translate-y-[200px]">

          <Link
            href="/register"
            className="lp-fade-up lp-gradient-text bg-gradient-to-r from-t1-300 via-t2-300 to-t1-400 text-6xl sm:text-8xl md:text-9xl font-bold tracking-tight select-none drop-shadow-[0_0_35px_var(--t1-500)] hover:brightness-125 transition-all"
            style={{ animationDelay: "0.1s" }}
          >
            n38worth
          </Link>

          <p className="lp-fade-up max-w-xl text-base sm:text-lg text-gray-300" style={{ animationDelay: "0.2s" }}>
            A massive multiplayer game of connection and ambition. Gather people
            around you, grow your worth, and hunt the six legendary Goddesses
            before time runs out.
          </p>

          <div className="lp-fade-up flex flex-col sm:flex-row items-center gap-3" style={{ animationDelay: "0.3s" }}>
            <Link
              href="/register"
              className="lp-shine relative overflow-hidden inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-t1-600 to-t2-600 px-10 py-4 text-lg font-semibold text-white shadow-[0_0_30px_var(--t1-600)] hover:brightness-110 hover:scale-105 active:scale-100 transition-all"
            >
              Play Now
            </Link>
            <button
              type="button"
              onClick={() => setGameplayOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-lg font-semibold text-gray-100 backdrop-blur-sm hover:bg-white/10 hover:scale-105 active:scale-100 transition-all"
            >
              How to Play
            </button>
          </div>

          {/* Live stats */}
          <div className="lp-fade-up mt-6 flex items-center gap-6 sm:gap-10" style={{ animationDelay: "0.4s" }}>
            <Stat label="Cards" value={stats?.totalPlayers ?? 0} />
            <div className="h-8 w-px bg-white/15" />
            <Stat label="Economy" value={stats?.totalEconomy ?? 0} suffix="¢" compact />
            <div className="h-8 w-px bg-white/15" />
            <Stat label="Players" value={stats?.totalHumans ?? 0} />
          </div>
        </div>


        {/* Bottom links (kept: About + Support) */}
        <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-between px-8">
          <button
            type="button"
            onClick={() => setGameplayOpen(true)}
            className="text-t1-400 text-sm font-medium hover:brightness-125 transition-all bg-transparent border-0 p-0 cursor-pointer"
          >
            About
          </button>
          <a
            href="https://n38worth.com/chat"
            target="_blank"
            rel="noopener noreferrer"
            className="text-t1-400 text-sm font-medium hover:brightness-125 transition-all"
          >
            Support
          </a>
        </div>
      </section>



      {/* About dialog */}
      <Dialog open={gameplayOpen} onOpenChange={setGameplayOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-gray-950 border-gray-800 text-gray-100">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent">
              How to Play
            </DialogTitle>
            <p className="pt-1 text-center text-sm text-gray-400">
              A social game of connection, ambition, and the hunt for the Goddesses.
            </p>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {/* What is n38worth? */}
            <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">What is n38worth?</h3>
              <p className="text-sm leading-relaxed text-gray-300">
                It&apos;s a social game of connection and ambition, where you gather people
                around you and grow something that feels like your own little world. Every
                player carries a spark of value, and together, those sparks can become
                something extraordinary.
              </p>
            </section>

            {/* The journey - numbered steps */}
            <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h3 className="mb-4 text-lg font-semibold text-t1-400">Your Journey</h3>
              <ol className="space-y-4">
                {[
                  {
                    title: "Start small",
                    body: "You begin with just a handful of credits—humble, but full of possibility. Everyone starts equal. As you shape your presence and reveal who you are, your worth begins to rise.",
                  },
                  {
                    title: "Build your circle",
                    body: "Invite others into your circle. As bonds grow, so does their value—and yours. Some connections flourish quickly, others slowly, but each one changes the shape of your journey.",
                  },
                  {
                    title: "Let go when needed",
                    body: "If a path no longer feels right, you can let someone go, watching them return to their beginnings.",
                  },
                  {
                    title: "Grow your network",
                    body: "When others choose you, you gain from their belief in you. Over time, your network becomes something alive—quietly growing, rewarding your attention and care.",
                  },
                ].map((step, i) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-t1-600 to-t2-600 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <div>
                      <p className="font-medium text-gray-100">{step.title}</p>
                      <p className="text-sm leading-relaxed text-gray-400">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* The goal */}
            <section className="rounded-xl border border-t1-900 bg-gradient-to-br from-t1-900/30 to-transparent p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">The Ultimate Goal</h3>
              <p className="text-sm leading-relaxed text-gray-300">
                Hidden within the game are six legendary figures—Goddesses of power and
                mystery. To find them, to gather them, and to keep them close until time
                runs out… that is the ultimate pursuit. Those who succeed leave their mark,
                remembered among the greats.
              </p>
            </section>
          </div>

          <div className="flex justify-center pb-2">
            <Link
              href="/register"
              className="inline-flex items-center rounded-full bg-gradient-to-r from-t1-600 to-t2-600 px-8 py-3 text-base font-semibold text-white shadow-[0_0_25px_var(--t1-600)] hover:brightness-110 transition-all"
            >
              Play Now
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
