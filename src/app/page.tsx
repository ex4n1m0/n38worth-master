"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Volume2, VolumeX, Crown } from "lucide-react";

/* ─── Types ─── */
type Stats = { totalPlayers: number; totalEconomy: number; totalNpcs: number; totalHumans: number; onlineHumans: number };
type Countdown = { active: boolean; username: string | null; remainingSeconds: number };
type TopNpc = { username: string; avatarUrl: string | null; playerValue: number };
type LandingData = {
  stats: Stats;
  countdown: Countdown;
  topNpcs: TopNpc[];
};

/* ─── Count-up hook ─── */
function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) { setValue(0); return; }
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


/* ─── Format helpers ─── */
function formatCompact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/* ─── Stat component ─── */
function Stat({ label, value, suffix, compact }: { label: string; value: number; suffix?: string; compact?: boolean }) {
  const n = useCountUp(value);
  const text = compact ? formatCompact(n) : n.toLocaleString();
  return (
    <div className="flex flex-col items-center">
      <span className="text-2xl sm:text-3xl font-bold text-white tabular-nums">{text}{suffix}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-400">{label}</span>
    </div>
  );
}


/* ─── Countdown Display ─── */
function CountdownBanner({ countdown }: { countdown: Countdown }) {
  if (!countdown?.active || !countdown.username) return null;
  const mins = Math.floor((countdown.remainingSeconds ?? 0) / 60);
  const secs = (countdown.remainingSeconds ?? 0) % 60;
  return (
    <div className="lp-fade-up flex items-center gap-3 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-6 py-2.5" style={{ animationDelay: "0.5s" }}>
      <Crown className="h-5 w-5 text-yellow-400 animate-pulse" />
      <span className="text-sm sm:text-base font-bold text-yellow-200">
        {countdown.username} is <span className="text-yellow-400 tabular-nums">{mins}:{String(secs).padStart(2, "0")}</span> away from winning the world
      </span>
    </div>
  );
}

/* ─── Main Component ─── */
export default function Home() {
  const [gameplayOpen, setGameplayOpen] = useState(false);
  const [data, setData] = useState<LandingData | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);

  // Fetch landing data
  useEffect(() => {
    let active = true;
    fetch("/api/landing-data")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active && d) setData(d); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Parallax on hero image
  useEffect(() => {
    const handleScroll = () => {
      if (heroImgRef.current) {
        const scrolled = window.scrollY;
        heroImgRef.current.style.transform = `translateY(${scrolled * 0.4}px) scale(1.1)`;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Demo play handler
  const handleDemoPlay = useCallback(async () => {
    setDemoLoading(true);
    try {
      const res = await fetch("/api/demo-register", { method: "POST" });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      await signIn("credentials", {
        username: d.username,
        password: d.password,
        redirect: false,
      });
      window.location.href = "/my-profile";
    } catch {
      setDemoLoading(false);
    }
  }, []);

  // Sound toggle
  const toggleSound = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio("/ambient.mp3");
      audioRef.current.loop = true;
      audioRef.current.volume = 0.15;
    }
    if (soundOn) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setSoundOn(!soundOn);
  };

  const stats = data?.stats;
  const countdown = data?.countdown;

  return (
    <div className="min-h-screen bg-black text-gray-100 overflow-x-hidden">
      {/* ═══ Hero ═══ */}
      <section className="relative min-h-screen flex flex-col items-center justify-start px-6 pt-20 pb-0 text-center overflow-x-clip">
        {/* Parallax background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={heroImgRef}
          src="/okworld.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top will-change-transform"
          style={{ transform: "scale(1.1)" }}
        />

        {/* Aurora blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="lp-aurora absolute -top-1/4 -left-1/4 h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,var(--t1-600),transparent_60%)] opacity-30 blur-3xl" />
          <div className="lp-aurora absolute -bottom-1/3 -right-1/4 h-[55vmax] w-[55vmax] rounded-full bg-[radial-gradient(circle,var(--t2-600),transparent_60%)] opacity-25 blur-3xl" style={{ animationDelay: "-6s" }} />
          <div className="lp-aurora absolute top-1/3 left-1/2 h-[40vmax] w-[40vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--t1-500),transparent_60%)] opacity-20 blur-3xl" style={{ animationDelay: "-12s" }} />
        </div>

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,black_85%)]" />

        {/* Sound toggle */}
        <button
          onClick={toggleSound}
          className="absolute top-6 right-6 z-20 rounded-full border border-white/10 bg-white/5 p-2.5 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
          aria-label="Toggle sound"
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center gap-6 flex-1 justify-center">
          <Link
            href="/register"
            className="lp-fade-up lp-gradient-text bg-gradient-to-r from-t1-300 via-t2-300 to-t1-400 text-6xl sm:text-8xl md:text-9xl font-bold tracking-tight select-none drop-shadow-[0_0_35px_var(--t1-500)] hover:brightness-125 transition-all"
            style={{ animationDelay: "0.1s" }}
          >
            n38worth
          </Link>

          <p className="lp-fade-up text-lg sm:text-xl text-gray-400 max-w-md" style={{ animationDelay: "0.2s" }}>
            A social game of ambition. Build your empire. Collect the Goddesses. Reset the world.
          </p>

          {/* Buttons */}
          <div className="lp-fade-up flex flex-col sm:flex-row items-center gap-3" style={{ animationDelay: "0.3s" }}>
            <Link
              href="/register"
              className="lp-shine relative overflow-hidden inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-t1-600 to-t2-600 px-10 py-4 text-lg font-semibold text-white shadow-[0_0_30px_var(--t1-600)] hover:brightness-110 hover:scale-105 active:scale-100 transition-all"
            >
              Play Now
            </Link>
            <button
              onClick={handleDemoPlay}
              disabled={demoLoading}
              className="inline-flex items-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-8 py-4 text-lg font-semibold text-green-300 hover:bg-green-500/20 hover:scale-105 active:scale-100 transition-all disabled:opacity-50"
            >
              {demoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Try as Guest"}
            </button>
            <button
              type="button"
              onClick={() => setGameplayOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-8 py-4 text-lg font-semibold text-gray-100 backdrop-blur-sm hover:bg-white/10 hover:scale-105 active:scale-100 transition-all"
            >
              How to Play
            </button>
          </div>

          {/* Active countdown */}
          {countdown && <CountdownBanner countdown={countdown} />}

          {/* Live stats */}
          <div className="lp-fade-up mt-6 flex items-center gap-6 sm:gap-10" style={{ animationDelay: "0.4s" }}>
            <Stat label="Cards" value={stats?.totalPlayers ?? 0} />
            <div className="h-8 w-px bg-white/15" />
            <Stat label="Economy" value={stats?.totalEconomy ?? 0} suffix="¢" compact />
            <div className="h-8 w-px bg-white/15" />
            <Stat label="Players" value={stats?.totalHumans ?? 0} />
          </div>
        </div>

        {/* Avatar grid */}
        <div className="relative z-10 w-full max-w-7xl px-4 pb-8">
          <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-1.5">
            {(data?.topNpcs ?? []).map((npc) => (
              <div key={npc.username} className="aspect-square rounded-lg border border-white/10 overflow-hidden shadow-lg relative group">
                {npc.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={npc.avatarUrl} alt={npc.username} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center text-xs text-gray-500">
                    {npc.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>
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
            <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">What is n38worth?</h3>
              <p className="text-sm leading-relaxed text-gray-300">
                It&apos;s a social game of connection and ambition, where you gather people
                around you and grow something that feels like your own little world. Every
                player carries a spark of value, and together, those sparks can become
                something extraordinary.
              </p>
            </section>
            <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
              <h3 className="mb-4 text-lg font-semibold text-t1-400">Your Journey</h3>
              <ol className="space-y-4">
                {[
                  { title: "Start small", body: "You begin with just 100 credits. Everyone starts equal. Hire your first 20 cards to unlock the full game." },
                  { title: "Build your circle", body: "Hire NPC cards and other players. Each hire increases their value. Steal cards from rivals by hiring them away." },
                  { title: "Grow your network", body: "When others hire you, you earn credits. Your portfolio generates passive income. Climb the leaderboard." },
                  { title: "Collect the Goddesses", body: "Six legendary cards, each with a unique power. Earn them through missions. Collect all 6 and hold for 1 hour to win." },
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
            <section className="rounded-xl border border-t1-900 bg-gradient-to-br from-t1-900/30 to-transparent p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">The Ultimate Goal</h3>
              <p className="text-sm leading-relaxed text-gray-300">
                Hidden within the game are six legendary figures — Goddesses of power and
                mystery. To find them, to gather them, and to keep them close until time
                runs out… that is the ultimate pursuit. Those who succeed leave their mark,
                remembered among the greats.
              </p>
            </section>
          </div>
          <div className="flex justify-center pb-2">
            <Link href="/register" className="inline-flex items-center rounded-full bg-gradient-to-r from-t1-600 to-t2-600 px-8 py-3 text-base font-semibold text-white shadow-[0_0_25px_var(--t1-600)] hover:brightness-110 transition-all">
              Play Now
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
