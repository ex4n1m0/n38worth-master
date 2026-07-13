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
import { Loader2, Volume2, VolumeX, ShoppingCart, Rocket, Crown, Zap, Shield, Eye, Clock, Swords, Sparkles, Trophy } from "lucide-react";

/* ─── Types ─── */
type Stats = { totalPlayers: number; totalEconomy: number; totalNpcs: number; totalHumans: number; onlineHumans: number };
type ActivityItem = { id: number; text: string; type: string; createdAt: string };
type Winner = { username: string; wonAt: string };
type Countdown = { active: boolean; username: string | null; remainingSeconds: number };
type TopPlayer = { username: string; playerValue: number; avatarUrl: string | null; profession: string | null; ownedCount: number } | null;
type Goddess = { username: string; value: number; avatarUrl: string | null };
type LandingData = {
  stats: Stats;
  activity: ActivityItem[];
  winners: Winner[];
  countdown: Countdown;
  topPlayer: TopPlayer;
  goddesses: Goddess[];
};

const GODDESS_POWERS: Record<string, { short: string; icon: typeof Crown }> = {
  "Goddess of Wealth": { short: "Double rewards", icon: Sparkles },
  "Goddess of Knowledge": { short: "See all avatars", icon: Eye },
  "Goddess of Fate": { short: "Permanent sell blocks", icon: Shield },
  "Goddess of Time": { short: "2× faster payouts", icon: Clock },
  "Goddess of War": { short: "Free breaks", icon: Swords },
  "Goddess": { short: "All powers combined", icon: Crown },
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

/* ─── Scroll reveal hook ─── */
function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

/* ─── Format helpers ─── */
function formatCompact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
function formatTime(date: string) {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

/* ─── Activity Ticker ─── */
function ActivityTicker({ items }: { items: ActivityItem[] }) {
  if (!items || items.length === 0) return null;
  // Duplicate for seamless loop
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden h-9 border-t border-white/5 bg-black/60 backdrop-blur-sm">
      <div className="lp-ticker-track flex items-center gap-8 h-full whitespace-nowrap">
        {doubled.map((item, i) => (
          <span key={`${item.id}-${i}`} className="text-xs text-gray-400 flex items-center gap-1.5">
            {item.type === "game_won" ? <Crown className="h-3 w-3 text-yellow-400" /> :
             item.type === "sell_combo" ? <Zap className="h-3 w-3 text-cyan-400" /> :
             item.type === "mission_reward" ? <Trophy className="h-3 w-3 text-purple-400" /> :
             item.type === "pump" ? <Rocket className="h-3 w-3 text-fuchsia-400" /> :
             <ShoppingCart className="h-3 w-3 text-green-400" />}
            <span className="text-gray-300 font-medium">{item.text}</span>
          </span>
        ))}
      </div>
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

/* ─── Story Section ─── */
function StorySection({ step, title, body, children }: { step: number; title: string; body: string; children?: React.ReactNode }) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={`relative flex flex-col items-center text-center py-20 px-6 transition-all duration-1000 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
      }`}
    >
      <div className="flex items-center gap-3 mb-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-t1-600 to-t2-600 text-lg font-bold text-white shadow-lg">
          {step}
        </span>
        <h2 className="text-2xl sm:text-4xl font-black text-white">{title}</h2>
      </div>
      <p className="text-base sm:text-lg text-gray-400 max-w-xl leading-relaxed mb-8">{body}</p>
      {children}
    </div>
  );
}

/* ─── Goddess Flip Card ─── */
function GoddessFlipCard({ goddess, index }: { goddess: Goddess; index: number }) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>();
  const power = GODDESS_POWERS[goddess.username];
  const Icon = power?.icon ?? Crown;
  const isUltimate = goddess.username === "Goddess";

  return (
    <div
      ref={ref}
      className={`relative h-64 w-48 cursor-pointer transition-all duration-700 ${
        visible ? "opacity-100 rotate-y-0" : "opacity-30 rotate-y-180"
      }`}
      style={{ transitionDelay: `${index * 150}ms` }}
    >
      <div className={`relative h-full w-full rounded-2xl border-2 overflow-hidden ${
        isUltimate ? "border-yellow-500/60 shadow-[0_0_30px_rgba(250,204,21,0.3)]" : "border-t1-500/40 shadow-[0_0_20px_rgba(34,211,238,0.15)]"
      }`}>
        {/* Goddess image */}
        {goddess.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={goddess.avatarUrl} alt={goddess.username} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${
            isUltimate ? "from-yellow-900 to-amber-950" : "from-t1-900 to-t2-900"
          }`}>
            <Icon className={`h-16 w-16 ${isUltimate ? "text-yellow-400" : "text-t1-400"}`} />
          </div>
        )}
        {/* Dark gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        {/* Info */}
        <div className="absolute bottom-0 left-0 right-0 p-3 text-center">
          <p className={`text-sm font-bold ${isUltimate ? "text-yellow-300" : "text-t1-200"}`}>
            {goddess.username}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{power?.short ?? "Unknown power"}</p>
          <p className="text-[10px] font-mono text-gray-500 mt-1">{goddess.value.toLocaleString()}¢</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Hall of Champions ─── */
function HallOfChampions({ winners }: { winners: Winner[] }) {
  if (!winners || winners.length === 0) return null;
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-yellow-400" />
        <h2 className="text-2xl sm:text-3xl font-black text-white">Hall of Champions</h2>
      </div>
      <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
        {winners.map((w, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-2">
            <span className="text-xs font-bold text-yellow-400">{w.username}</span>
            <span className="text-[10px] text-gray-500">{formatTime(w.wonAt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Profile Teaser ─── */
function ProfileTeaser({ player }: { player: TopPlayer }) {
  if (!player) return null;
  return (
    <div className="relative w-72 rounded-2xl border border-white/10 bg-gray-900/60 backdrop-blur-sm overflow-hidden">
      {/* Avatar area */}
      <div className="relative h-48 bg-gradient-to-br from-t1-900/40 to-t2-900/40">
        {player.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.avatarUrl} alt={player.username} className="h-full w-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-4xl font-black text-t1-400">{player.username.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
      </div>
      {/* Info */}
      <div className="p-4 space-y-2">
        <h3 className="text-lg font-bold text-white">{player.username}</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border text-cyan-300 bg-cyan-500/10 border-cyan-500/30">
            <Zap className="h-3 w-3" /> {formatCompact(player.playerValue)}¢
          </span>
          {player.profession && (
            <span className="text-xs text-gray-400">{player.profession}</span>
          )}
          <span className="text-xs text-gray-500">{player.ownedCount} cards</span>
        </div>
      </div>
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
          src="/endgame.png"
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

        {/* Scroll hint */}
        <div className="relative z-10 pb-2">
          <div className="lp-bounce text-t1-400 text-xs tracking-widest uppercase">Scroll to explore</div>
        </div>

        {/* Activity ticker — bottom of hero */}
        <div className="relative z-10 w-full">
          <ActivityTicker items={data?.activity ?? []} />
        </div>
      </section>

      {/* ═══ Scroll Story Sections ═══ */}
      <section className="relative bg-gradient-to-b from-black via-gray-950 to-black">
        {/* 1. Start small */}
        <StorySection step={1} title="Start with 100¢" body="Everyone begins equal — just 100 credits and a profile. Upload your avatar, pick a profession, and your journey begins. Your first 20 cards unlock the full game.">
          <div className="flex items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-t1-600 to-t2-600 text-2xl font-black text-white shadow-[0_0_25px_var(--t1-600)] animate-pulse">100¢</div>
          </div>
        </StorySection>

        {/* 2. Build your circle */}
        <StorySection step={2} title="Hire Cards. Build Your Empire." body="Spend credits to hire NPC cards and other players. Each hire increases their value. Steal cards from rivals by hiring them away. Protect your best cards with sell blocks.">
          <div className="flex gap-3 flex-wrap justify-center max-w-md">
            {["Card 1", "Card 2", "Card 3", "Card 4"].map((c, i) => (
              <div key={c} className="h-28 w-20 rounded-xl border border-white/10 bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center text-xs text-gray-500 shadow-lg">
                {c}
              </div>
            ))}
          </div>
        </StorySection>

        {/* 3. Steal from rivals */}
        <StorySection step={3} title="Steal from Rivals" body="Someone owns a card you want? Hire it from them — they get paid the card's value, you get the card. Break sell blocks for a fee. With the Goddess of War, breaks are free.">
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2">
              <span className="text-red-400 font-bold">Player A</span>
            </div>
            <ShoppingCart className="h-5 w-5 text-t1-400 animate-bounce" />
            <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2">
              <span className="text-green-400 font-bold">You</span>
            </div>
          </div>
        </StorySection>

        {/* 4. Goddesses */}
        <StorySection step={4} title="Collect 6 Goddesses" body="Six legendary cards, each with a unique power. Earn them through missions — not by buying. Collect all 6 and hold them for one hour to win the game and reset the world.">
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl">
            {(data?.goddesses ?? []).map((g, i) => (
              <GoddessFlipCard key={g.username} goddess={g} index={i} />
            ))}
          </div>
        </StorySection>

        {/* 5. Win */}
        <StorySection step={5} title="Hold for 1 Hour. Win. Reset." body="Keep all 6 Goddesses for one full hour. The world reboots. Your name is carved into the Hall of Champions forever. Everyone starts fresh. A new world begins.">
          <div className="relative w-full max-w-sm">
            <div className="rounded-2xl border border-t1-500/40 bg-black/80 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/WORLD_RESET.png" alt="World Reset" className="w-full h-40 object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-black text-white tracking-widest uppercase">The World is Rebooting</span>
              </div>
            </div>
          </div>
        </StorySection>
      </section>

      {/* ═══ Footer ═══ */}
      <footer className="relative py-8 px-8 bg-black border-t border-white/5 flex justify-between items-center">
        <button
          type="button"
          onClick={() => setGameplayOpen(true)}
          className="text-t1-400 text-sm font-medium hover:brightness-125 transition-all bg-transparent border-0 p-0 cursor-pointer"
        >
          About
        </button>
        <a href="https://n38worth.com/chat" target="_blank" rel="noopener noreferrer" className="text-t1-400 text-sm font-medium hover:brightness-125 transition-all">
          Support
        </a>
      </footer>

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
