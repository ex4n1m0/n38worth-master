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
import { Loader2, Volume2, VolumeX, Terminal } from "lucide-react";
import { MatrixRain } from "@/components/MatrixRain";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useLanguage } from "@/components/LanguageContext";
import { PROFESSIONS, professionName, professionPerk } from "@/lib/professions";
import { cardDisplayName } from "@/lib/display-names";
import { buildStampLabel } from "@/lib/build-info";
import { captureUtmCookies, sendVisitBeacon } from "@/lib/utm";

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
  const { t } = useLanguage();
  if (!countdown?.active || !countdown.username) return null;
  const mins = Math.floor((countdown.remainingSeconds ?? 0) / 60);
  const secs = (countdown.remainingSeconds ?? 0) % 60;
  return (
    <div className="lp-fade-up flex items-center gap-3 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-6 py-2.5" style={{ animationDelay: "0.5s" }}>
      <Terminal className="h-5 w-5 text-yellow-400 animate-pulse" />
      <span className="text-sm sm:text-base font-bold text-yellow-200">
        {t.landingCountdownPrefix.replace("{name}", cardDisplayName(countdown.username))}{" "}
        <span className="text-yellow-400 tabular-nums">{mins}:{String(secs).padStart(2, "0")}</span>{" "}
        {t.landingCountdownSuffix}
      </span>
    </div>
  );
}

/* ─── Sibling-projects strip ─── */
/* Same "From the same maker" bar as on deepflux.space and
    onlyhumans.deepflux.space — cross-links the three projects.
    Sits above the hero in normal flow so it scrolls away, and
    drops the taglines on mobile to stay one slim line. */
function KinStrip() {
  const { t } = useLanguage();
  return (
    <div className="relative z-30 border-b border-white/10 bg-black">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center justify-center gap-x-3.5 gap-y-1 px-6 py-2 text-xs">
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-gray-500">
          {t.kinLabel}
        </span>
        <a
          href="https://deepflux.space/"
          target="_blank"
          rel="noopener noreferrer"
          className="group whitespace-nowrap text-gray-500 transition-colors hover:text-gray-200"
        >
          <b className="font-semibold text-gray-300 group-hover:text-white">DeepFlux</b>{" "}
          <span className="hidden sm:inline">{t.kinDeepfluxDesc}</span>
        </a>
        <span aria-hidden="true" className="h-[3px] w-[3px] flex-none rounded-full bg-white/25" />
        <a
          href="https://onlyhumans.deepflux.space/"
          target="_blank"
          rel="noopener noreferrer"
          className="group whitespace-nowrap text-gray-500 transition-colors hover:text-gray-200"
        >
          <b className="font-semibold text-gray-300 group-hover:text-white">OnlyHumans</b>{" "}
          <span className="hidden sm:inline">{t.kinOnlyhumansDesc}</span>
        </a>
      </div>
    </div>
  );
}


/* ─── Main Component ─── */
export default function Home() {
  const { t, locale } = useLanguage();
  const [gameplayOpen, setGameplayOpen] = useState(false);
  const [data, setData] = useState<LandingData | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);

  // Capture UTM params + fire the anonymous visit beacon (self-hosted
  // analytics — see src/lib/utm.ts). Session-deduped, never blocks render.
  useEffect(() => {
    captureUtmCookies();
    sendVisitBeacon("/");
  }, []);

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
      {/* Sibling-projects reference strip — above the hero, scrolls away */}
      <KinStrip />

      {/* ═══ Hero ═══ */}
      {/* overflow-clip (not just overflow-x-clip) so the parallax image can't
          slide out past the section's bottom edge, where the darkening
          overlays no longer cover it. */}
      <section className="relative min-h-[100svh] flex flex-col items-center justify-center px-6 pt-20 pb-10 text-center overflow-clip">
        {/* Parallax background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={heroImgRef}
          src="/simulation.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top will-change-transform"
          style={{ transform: "scale(1.1)" }}
        />

        {/* Code rain over the backdrop */}
        <MatrixRain opacity={0.22} />

        {/* CRT scanlines */}
        <div className="scanlines pointer-events-none absolute inset-0" />

        {/* Aurora blobs */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="lp-aurora absolute -top-1/4 -left-1/4 h-[60vmax] w-[60vmax] rounded-full bg-[radial-gradient(circle,var(--t1-600),transparent_60%)] opacity-30 blur-3xl" />
          <div className="lp-aurora absolute -bottom-1/3 -right-1/4 h-[55vmax] w-[55vmax] rounded-full bg-[radial-gradient(circle,var(--t2-600),transparent_60%)] opacity-25 blur-3xl" style={{ animationDelay: "-6s" }} />
          <div className="lp-aurora absolute top-1/3 left-1/2 h-[40vmax] w-[40vmax] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--t1-500),transparent_60%)] opacity-20 blur-3xl" style={{ animationDelay: "-12s" }} />
        </div>

        {/* Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,black_85%)]" />

        {/* Sound toggle + language switcher */}
        <div className="absolute top-6 right-6 z-20 flex items-center gap-2">
          <LanguageSwitcher variant="pill" />
          <button
            onClick={toggleSound}
            className="rounded-full border border-white/10 bg-white/5 p-2.5 text-gray-400 hover:text-white hover:bg-white/10 transition-all"
            aria-label={t.landingToggleSound}
          >
            {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
        </div>

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
            {t.landingTagline}
          </p>

          {/* Live stats */}
          <div className="lp-fade-up flex items-center gap-6 sm:gap-10" style={{ animationDelay: "0.3s" }}>
            <Stat label={t.totalPlayers} value={stats?.totalPlayers ?? 0} />
            <div className="h-8 w-px bg-white/15" />
            <Stat label={t.totalEconomy} value={stats?.totalEconomy ?? 0} suffix="¢" compact />
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
              {t.landingStartHere}
            </button>
          </div>
        </div>

        {/* Build stamp — commit + deployment time of this build; bumps
            automatically on every commit and deploy (next.config.ts). */}
        <p className="absolute bottom-3 left-0 right-0 z-10 text-center text-[10px] uppercase tracking-[0.25em] text-gray-500 select-none">
          {buildStampLabel()}
        </p>
      </section>

      {/* About dialog */}
      <Dialog open={gameplayOpen} onOpenChange={setGameplayOpen}>
        <DialogContent className="!max-w-[90vw] w-[90vw] max-h-[85vh] overflow-y-auto bg-gray-950/60 backdrop-blur-md border-gray-800 text-gray-100">
          <DialogHeader className="sr-only">
            <DialogTitle>{t.howToPlay}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-4">

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-4 text-lg font-semibold text-t1-400">{t.gettingStarted}</h3>
              <ol className="space-y-3">
                {[
                  { title: t.landStep1Title, body: t.landStep1Body },
                  { title: t.landStep2Title, body: t.landStep2Body },
                  { title: t.landStep3Title, body: t.landStep3Body },
                  { title: t.landStep4Title, body: t.landStep4Body },
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
              <h3 className="mb-2 text-lg font-semibold text-t1-400">{t.earningCredits}</h3>
              <p className="text-sm leading-relaxed text-gray-300 mb-3">
                {t.fourWaysToEarn}
              </p>
              <ul className="space-y-1.5 text-sm text-gray-300">
                <li>
                  <span className="font-semibold text-amber-300">{t.earn1Label}</span> {t.earn1Body}
                </li>
                <li>
                  <span className="font-semibold text-amber-300">{t.earn2Label}</span> {t.earn2Body}
                </li>
                <li>
                  <span className="font-semibold text-amber-300">{t.earn3Label}</span> {t.earn3Body}
                </li>
                <li>
                  <span className="font-semibold text-amber-300">{t.earn4Label}</span> {t.earn4Body}
                </li>
              </ul>
              <p className="text-sm leading-relaxed text-gray-400 mt-3">
                {t.landSkimNote}
              </p>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-4 text-lg font-semibold text-t1-400">{t.theButtons}</h3>
              {/* Core action buttons — available on every Avatar. */}
              <ul className="space-y-2.5 text-sm leading-relaxed">
                {[
                  { chip: t.landChipGet, cls: "from-emerald-600 to-green-500", body: t.landGetBody },
                  { chip: t.landChipOverclock, cls: "from-fuchsia-600 to-purple-500", body: t.landOverclockBody },
                  { chip: t.landChipFirewall, cls: "from-amber-600 to-yellow-600", body: t.landFirewallBody },
                  { chip: t.landChipBreach, cls: "from-amber-600 to-red-600", body: t.landBreachBody },
                  { chip: t.landChipHardLock, cls: "from-amber-500 to-amber-400", body: t.landHardLockBody },
                ].map((a) => (
                  <li key={a.chip} className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex w-14 flex-none items-center justify-center rounded-md bg-gradient-to-r ${a.cls} px-1.5 py-1 text-[10px] font-bold text-white`}>
                      {a.chip}
                    </span>
                    <span className="text-gray-300">{a.body}</span>
                  </li>
                ))}
              </ul>

              {/* Bonus Avatars — special avatars with their own buttons. */}
              <div className="mt-5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  {t.bonusAvatars}
                </p>
                <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm leading-relaxed">
                  {[
                    { chip: t.landChipBotnet, cls: "from-amber-600 to-yellow-500", img: "/botnet.webp", body: t.landBotnetBody },
                    { chip: t.landChipSlots, cls: "from-cyan-600 to-blue-500", img: "/10slots.webp", body: t.landSlotsBody },
                    { chip: t.landChipScan, cls: "from-violet-600 to-purple-500", img: "/scan.webp", body: t.landScanBody },
                  ].map((a) => (
                    <li key={a.img} className="text-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.img}
                        alt={t.landAvatarAlt.replace("{chip}", a.chip)}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full rounded-lg border border-white/15 object-cover shadow-lg"
                      />
                      <span className={`mt-2 inline-flex w-14 items-center justify-center rounded-md bg-gradient-to-r ${a.cls} px-1.5 py-1 text-[10px] font-bold text-white`}>
                        {a.chip}
                      </span>
                      <p className="mt-1.5 text-left text-gray-300">{a.body}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">{t.professionsSection}</h3>
              <p className="text-sm leading-relaxed text-gray-300 mb-3">
                {t.professionsIntro1}{" "}
                <span className="font-semibold text-amber-300">{t.professionsIntro2}</span>
                {t.professionsIntro3}
              </p>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PROFESSIONS.map((p) => (
                  <li key={p.name} className="rounded-lg border border-gray-800 bg-black/40 p-2.5 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imagePath}
                      alt={professionName(p.name, locale)}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-md border border-white/10 object-cover shadow-lg"
                    />
                    <p className="mt-2 text-xs font-semibold text-amber-300">{professionName(p.name, locale)}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-gray-400">
                      {professionPerk(p.name, locale)?.description}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-sm leading-relaxed text-gray-300 mt-3">
                <span className="font-semibold text-amber-300">{t.comboLabel}</span> {t.comboBody}{" "}
                <span className="font-bold text-amber-300">{t.comboHighlight}</span>
                {t.comboTail}
              </p>
            </section>

            <section className="rounded-xl border border-gray-800 p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">{t.missionLadderTitle}</h3>
              <p className="text-sm leading-relaxed text-gray-300 mb-3">
                {t.missionLadderIntro}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm text-gray-300">
                <li><span className="font-mono text-t1-400">20</span> — {t.landLadder1}</li>
                <li><span className="font-mono text-t1-400">50</span> — {t.landLadder2}</li>
                <li><span className="font-mono text-t1-400">100</span> — {t.landLadder3}</li>
                <li><span className="font-mono text-t1-400">250</span> — {t.landLadder4}</li>
                <li><span className="font-mono text-t1-400">500</span> — {t.landLadder5}</li>
                <li><span className="font-mono text-t1-400">1,000</span> — {t.landLadder6}</li>
                <li><span className="font-mono text-t1-400">2,000</span> — {t.landLadder7}</li>
                <li><span className="font-mono text-t1-400">5,000+</span> — {t.landLadder8}</li>
              </ul>
              <p className="text-sm leading-relaxed text-gray-400 mt-3">
                {t.landPowersNote}
              </p>
            </section>

            <section className="rounded-xl border border-t1-900 bg-gradient-to-br from-t1-900/30 to-transparent p-5">
              <h3 className="mb-2 text-lg font-semibold text-t1-400">{t.rootingTitle}</h3>
              <div className="mb-3 grid grid-cols-3 gap-3">
                {[
                  { src: "/TheBanker.webp", card: "Goddess of Wealth" },
                  { src: "/TheOracle.webp", card: "Goddess of Knowledge" },
                  { src: "/TheLocksmith.webp", card: "Goddess of Fate" },
                  { src: "/TheClockkeeper.webp", card: "Goddess of Time" },
                  { src: "/NullPointer.webp", card: "Goddess of War" },
                  { src: "/TheArchitect.webp", card: "Goddess" },
                ].map((g) => (
                  <div key={g.src} className="text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.src}
                      alt={cardDisplayName(g.card, locale)}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded-lg border border-t1-500/30 object-cover shadow-[0_0_15px_var(--t1-900)]"
                    />
                    <p className="mt-1.5 text-xs font-semibold text-amber-300">{cardDisplayName(g.card, locale)}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm leading-relaxed text-gray-300">
                {t.rootIntro}
              </p>
              <p className="text-sm leading-relaxed text-gray-400 mt-3">
                {t.rootOutro}
              </p>
            </section>

          </div>
          {/* Sign-up actions — the only place they appear, so players reach
              them by scrolling through the rules above. */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pb-2">
            <Link
              href="/register"
              className="lp-shine relative overflow-hidden inline-flex items-center justify-center rounded-full bg-gradient-to-r from-t1-600 to-t2-600 px-10 py-4 text-lg font-semibold text-white shadow-[0_0_25px_var(--t1-600)] hover:brightness-110 hover:scale-105 active:scale-100 transition-all"
            >
              {t.playNow}
            </Link>
            <button
              onClick={handleDemoPlay}
              disabled={demoLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-green-500/40 bg-green-500/10 px-8 py-4 text-lg font-semibold text-green-300 hover:bg-green-500/20 hover:scale-105 active:scale-100 transition-all disabled:opacity-50"
            >
              {demoLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : t.tryAsGuest}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
