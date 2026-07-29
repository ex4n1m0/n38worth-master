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
import { EmpireRankStrip } from "@/components/EmpireRankStrip";

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
      {/* overflow-clip (not just overflow-x-clip) so the parallax image can't
          slide out past the section's bottom edge, where the darkening
          overlays no longer cover it. */}
      <section className="relative min-h-[100svh] flex flex-col items-center justify-center px-6 pt-20 pb-10 text-center overflow-clip">
        {/* Parallax background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={heroImgRef}
          src="/okworld.webp"
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

        {/* Hero content — centered in the viewport */}
        <div className="relative z-10 flex flex-col items-center gap-6">
          {/* Pushed down so the logo sits around where the stats/countdown
              block used to be — leaves the hero image visible above it. */}
          <Link
            href="/register"
            className="lp-fade-up lp-gradient-text mt-32 sm:mt-44 bg-gradient-to-r from-t1-300 via-t2-300 to-t1-400 text-6xl sm:text-8xl md:text-9xl font-bold tracking-tight select-none drop-shadow-[0_0_35px_var(--t1-500)] hover:brightness-125 transition-all"
            style={{ animationDelay: "0.1s" }}
          >
            n38worth
          </Link>

          {/* Tagline — same gradient/bold style as the title, sized so its
              line is narrower than the title but wider than the stats row
              below: an inverted pyramid of text. */}
          <p
            className="lp-fade-up lp-gradient-text bg-gradient-to-r from-t1-300 via-t2-300 to-t1-400 font-bold uppercase tracking-[0.32em] md:tracking-[0.4em] text-[1.35rem] sm:text-2xl md:text-[1.8rem] select-none drop-shadow-[0_0_20px_var(--t1-500)]"
            style={{ animationDelay: "0.2s" }}
          >
            social media game
          </p>

          {/* Live stats */}
          <div className="lp-fade-up flex items-center gap-6 sm:gap-10" style={{ animationDelay: "0.3s" }}>
            <Stat label="Avatars" value={stats?.totalPlayers ?? 0} />
            <div className="h-8 w-px bg-white/15" />
            <Stat label="Economy" value={stats?.totalEconomy ?? 0} suffix="¢" compact />
            <div className="h-8 w-px bg-white/15" />
            <Stat label="Humans" value={stats?.totalHumans ?? 0} />
          </div>

          {/* Active countdown */}
          {countdown && <CountdownBanner countdown={countdown} />}

          {/* Single entry point — the How to Play walkthrough. Play Now and
              Try as Guest live at the BOTTOM of that dialog, so new players
              read the rules on their way to signing up. */}
          <div className="lp-fade-up mt-2 flex justify-center" style={{ animationDelay: "0.4s" }}>
            <button
              type="button"
              onClick={() => setGameplayOpen(true)}
              className="lp-shine relative overflow-hidden inline-flex items-center gap-2 rounded-full bg-transparent border border-t1-500/40 px-14 py-6 text-2xl sm:text-3xl font-bold text-white shadow-[0_0_40px_var(--t1-600)] hover:brightness-110 hover:scale-105 active:scale-100 transition-all"
            >
              Start Here
            </button>
          </div>

          {/* Live Activity and Ranks — Recently Online, Biggest Empire, Most
              Credits, Hall of Champions. Right below the live stats so visitors
              see real game activity immediately, without scrolling.
              Transparent background to blend with the hero. */}
          <div className="lp-fade-up w-full max-w-5xl mt-8 text-left" style={{ animationDelay: "0.5s" }}>
            <EmpireRankStrip variant="transparent" />
          </div>
        </div>
      </section>

      {/* About dialog */}
      <Dialog open={gameplayOpen} onOpenChange={setGameplayOpen}>
        <DialogContent className="!max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto bg-gray-950/60 backdrop-blur-md border-gray-800 text-gray-100">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent">
              How to Play
            </DialogTitle>
            <p className="pt-1 text-center text-sm text-gray-400">
              A social game of connection, ambition, and the hunt for the Goddesses.
            </p>
          </DialogHeader>
          <div className="space-y-3 py-4">

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">What is n38worth?</h3>
              <p className="text-sm leading-relaxed text-gray-300">
                A multiplayer avatar-trading game where every player — human or NPC — is an avatar
                with a value. Hire avatars to build your empire, grow their value, protect them
                from rivals, and climb the mission ladder to earn the six legendary Goddesses.
                Hold all six for one hour and you win: the world resets and your name is carved
                into the Hall of Champions.
              </p>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-4 text-lg font-semibold text-t1-400">Getting Started</h3>
              <ol className="space-y-3">
                {[
                  { title: "Create your avatar", body: "Register, upload your avatar and pick a profession. You start with 100¢ and 20 hire slots — everyone starts equal." },
                  { title: "Hire your first avatars", body: "Hiring costs the avatar's current value, and every hire pumps that avatar's value up. Your first 10 hires get a 24-hour unbreakable block so no one can steal them while you learn." },
                  { title: "Get 20 avatars", body: "This unlocks the full game: rankings, filters, activity feeds and the mission ladder. Each mission you complete also adds +50 hire slots." },
                  { title: "Claim your daily reward", body: "Once every 24h you can claim a login reward equal to the Goddess of Wealth's current value — transferred from the richest player, so the rich never run away with the game. If you ARE the richest, you get nothing that day." },
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

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">Earning Credits</h3>
              <p className="text-sm leading-relaxed text-gray-300 mb-3">
                Credits are the fuel for everything. Four ways to earn them:
              </p>
              <ul className="space-y-1.5 text-sm text-gray-300">
                <li>
                  <span className="font-semibold text-amber-300">Portfolio reward</span> — every
                  hour you collect 0.2% of your portfolio value (the combined value of the cards
                  you own, multiplied by how many owners you yourself have).
                </li>
                <li>
                  <span className="font-semibold text-amber-300">Getting hired</span> — when
                  someone hires or pumps your card, you get paid, and your value goes up.
                </li>
                <li>
                  <span className="font-semibold text-amber-300">Rank bonuses</span> — placing
                  top 3 in a ranking category pays out hourly.
                </li>
                <li>
                  <span className="font-semibold text-amber-300">Daily login reward</span> — the
                  Goddess of Wealth&apos;s value, once every 24 hours.
                </li>
              </ul>
              <p className="text-sm leading-relaxed text-gray-400 mt-3">
                One catch: if someone owns your card they are your boss, and they skim 10% of your
                portfolio reward. Hire slots cap how many cards you can hold at once — you start
                with 20 and gain more from missions, poaching, and the 10 Slots card.
              </p>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-4 text-lg font-semibold text-t1-400">The Buttons</h3>
              <ul className="space-y-2.5 text-sm leading-relaxed">
                {[
                  { chip: "GET", cls: "from-emerald-600 to-green-500", body: "Hire an avatar for its current value. The avatar and its previous owner both get paid, its value jumps (2× under 1,000¢, tapering to 1.1× above 1M), and it joins your team. Poaching a card from another player also earns you +1 hire slot." },
                  { chip: "PUMP", cls: "from-fuchsia-600 to-purple-500", body: "Pay 100% of your avatar's value to double it, gift the cost to the avatar, and extend its sell block by 10 minutes (12h max). Your main value-growth engine." },
                  { chip: "BLOCK", cls: "from-amber-600 to-yellow-600", body: "Block Sell protects an avatar from being hired away. Costs the avatar's value: +1 hour per press (12h max), bumps its value +10%, and pays 90% of the cost to the card." },
                  { chip: "BREAK", cls: "from-amber-600 to-red-600", body: "Break a rival's sell block by paying a fee (hours remaining × avatar value) straight to the owner, then hire the card. Fate-sealed cards cost 1000× to break, and blocks marked Unbreakable can't be broken at all." },
                  { chip: "PERM", cls: "from-amber-500 to-amber-400", body: "Your first 10 hires carry a 24-hour unbreakable Perm Block. You can move a block to a different avatar at any time, which restarts its 24 hours. Only regular NPC cards can be perm-blocked." },
                  { chip: "MASS", cls: "from-amber-600 to-yellow-500", body: "Mass Hire (unlocked at 50 avatars) bulk-hires the cheapest available avatars — 1 + 10% of your owned count per press — then goes on a 10-minute cooldown." },
                  { chip: "SLOTS", cls: "from-cyan-600 to-blue-500", body: "The 10 Slots avatar adds +10 hire slots for 10% of your current credits. 10-minute cooldown." },
                  { chip: "REVEAL", cls: "from-violet-600 to-purple-500", body: "The Reveal avatar unmasks every hidden avatar in the game for 10 minutes, for 10% of your current credits. 10-minute cooldown." },
                ].map((a) => (
                  <li key={a.chip} className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex w-14 flex-none items-center justify-center rounded-md bg-gradient-to-r ${a.cls} px-1.5 py-1 text-[10px] font-bold text-white`}>
                      {a.chip}
                    </span>
                    <span className="text-gray-300">{a.body}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">Professions: Perks &amp; Combos</h3>
              <p className="text-sm leading-relaxed text-gray-300 mb-3">
                There are 6 professions. You pick one for yourself, and you can assign one to any
                NPC you own. Owning at least one card of a profession (or being it yourself)
                activates its passive perk:
              </p>
              <ul className="space-y-1.5 text-sm text-gray-300">
                <li><span className="font-semibold text-amber-300">Rift Binder</span> — your sell blocks last 50% longer.</li>
                <li><span className="font-semibold text-amber-300">Hexblade Courier</span> — break fees you pay are 20% cheaper.</li>
                <li><span className="font-semibold text-amber-300">Scrap Alchemist</span> — pumping costs 10% less.</li>
                <li><span className="font-semibold text-amber-300">Spirit Archivist</span> — your daily login reward is 25% bigger.</li>
                <li><span className="font-semibold text-amber-300">Iron Choir Marshal</span> — +2 hire slots.</li>
                <li><span className="font-semibold text-amber-300">Plague Cartographer</span> — Mass Hire grabs +1 extra avatar.</li>
              </ul>
              <p className="text-sm leading-relaxed text-gray-300 mt-3">
                <span className="font-semibold text-amber-300">Combo:</span> collect one card of
                each profession and sell all 6 together for <span className="font-bold text-amber-300">10× their
                combined value</span>. The sold cards reset to floor value and 6 fresh NPCs spawn —
                but you also give up those perks until you rebuild. Choose wisely.
              </p>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">The Mission Ladder</h3>
              <p className="text-sm leading-relaxed text-gray-300 mb-3">
                Grow your empire to earn the legendary cards. Every completed mission also adds
                +50 hire slots:
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-gray-300">
                <li><span className="font-mono text-t1-400">20</span> — Unlock the full game</li>
                <li><span className="font-mono text-t1-400">50</span> — Mass Hire avatar</li>
                <li><span className="font-mono text-t1-400">100</span> — Goddess of Wealth</li>
                <li><span className="font-mono text-t1-400">250</span> — Goddess of Knowledge</li>
                <li><span className="font-mono text-t1-400">500</span> — Goddess of Fate</li>
                <li><span className="font-mono text-t1-400">1,000</span> — Goddess of Time</li>
                <li><span className="font-mono text-t1-400">2,000</span> — Goddess of War</li>
                <li><span className="font-mono text-t1-400">5,000+</span> — the Goddess (+1,000 per game won)</li>
              </ul>
              <p className="text-sm leading-relaxed text-gray-400 mt-3">
                Each Goddess grants a power while you hold her: Wealth doubles your rewards,
                Knowledge reveals every hidden avatar, Fate gives your whole team permanent sell
                blocks (1000× fee to break), Time halves your payout wait, War lets you break
                blocks for free — and the Goddess activates all powers at once.
              </p>
            </section>

            <section className="rounded-xl border border-t1-900 bg-gradient-to-br from-t1-900/30 to-transparent p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">Winning the World</h3>
              <p className="text-sm leading-relaxed text-gray-300">
                Hold all six Goddesses at once and a 1-hour countdown begins — visible to
                everyone. Rivals will do anything to break one card away from you before time
                runs out; if they manage it you get a 2-minute grace window to take her back
                before the countdown is cancelled. Survive the hour and the world resets: every
                player starts fresh, and your name joins the Hall of Champions forever.
              </p>
              <p className="text-sm leading-relaxed text-gray-400 mt-3">
                You&apos;re not only up against humans. Six autonomous divine players hunt cards
                around the clock — they buy, pump and poach just like you, but never speak.
              </p>
            </section>

            {/* Highest-value NPC cards — the avatar grid, moved here from the
                landing page so it sits right above the sign-up buttons. */}
            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-3 text-lg font-semibold text-t1-400">Highest-Value NPC Avatars</h3>
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-1.5">
                {(data?.topNpcs ?? []).map((npc) => (
                  <a
                    key={npc.username}
                    href={`/api/avatar/${encodeURIComponent(npc.username)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${npc.username} — ${formatCompact(npc.playerValue)}¢`}
                    className="aspect-square rounded-lg border border-white/10 overflow-hidden shadow-lg relative group block hover:border-white/40 transition-colors"
                  >
                    {npc.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={npc.avatarUrl}
                        alt={npc.username}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center text-xs text-gray-500">
                        {npc.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </a>
                ))}
              </div>
            </section>

          </div>
          {/* Sign-up actions — the only place they appear, so players reach
              them by scrolling through the rules above. */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-2">
            <Link
              href="/register"
              className="lp-shine relative overflow-hidden inline-flex items-center justify-center rounded-full bg-gradient-to-r from-t1-600 to-t2-600 px-10 py-4 text-lg font-semibold text-white shadow-[0_0_25px_var(--t1-600)] hover:brightness-110 hover:scale-105 active:scale-100 transition-all"
            >
              Play Now
            </Link>
            <button
              onClick={handleDemoPlay}
              disabled={demoLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-8 py-4 text-lg font-semibold text-green-300 hover:bg-green-500/20 hover:scale-105 active:scale-100 transition-all disabled:opacity-50"
            >
              {demoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Try as Guest"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
