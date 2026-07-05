"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Check, Clock, Loader2, ShoppingCart, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useSound } from "@/hooks/useSound";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { formatCompact } from "@/lib/utils";

interface StarterNpc {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  credits?: number;
}

interface StarterNpcsSectionProps {
  npcIds: number[];
  ownedCount: number;
  onPurchase: () => void;
}

/**
 * The starter-NPC onboarding step. Renders the blue progress banner plus a
 * grid of 3 hireable NPCs. Used on the player's own profile during onboarding
 * (after avatar upload, before the 3rd NPC purchase).
 */
export function StarterNpcsSection({
  npcIds,
  ownedCount,
  onPurchase,
}: StarterNpcsSectionProps) {
  const queryClient = useQueryClient();
  const { ownedIds } = useOwnedPlayerIds();

  const { data: npcs, isLoading } = useQuery({
    queryKey: ["starter-npcs", npcIds],
    queryFn: async () => {
      const results = await Promise.all(
        npcIds.map(async (id) => {
          const res = await fetch(`/api/players/id/${id}`);
          if (!res.ok) return null;
          return res.json();
        })
      );
      return results.filter(Boolean) as StarterNpc[];
    },
    staleTime: 30 * 1000,
  });

  // ── Auto-hire orchestration ──────────────────────────────────────────
  //
  // After the player manually hires their first NPC, we auto-hire the
  // remaining unowned starter NPCs one-by-one with a 3-second interval so
  // the onboarding flow is frictionless and players don't drop off.
  //
  // State machine:
  //   autoHireQueue : NPC IDs waiting to be hired
  //   autoHiringId  : the NPC currently being hired (for visual feedback)
  //   autoHireTimer : seconds remaining until the next auto-hire fires
  const [autoHireQueue, setAutoHireQueue] = useState<number[]>([]);
  const [autoHiringId, setAutoHiringId] = useState<number | null>(null);
  const [autoHireTimer, setAutoHireTimer] = useState<number | null>(null);
  const prevOwnedCountRef = useRef(ownedCount);
  const queueRef = useRef<number[]>([]); // keep mutable ref for the effect closure

  // Kick off auto-hire when ownedCount goes 0→1 (first manual purchase).
  // Also handles the edge case where the player already owns 1 NPC when the
  // component mounts (e.g. after a page refresh mid-onboarding).
  useEffect(() => {
    const prev = prevOwnedCountRef.current;
    prevOwnedCountRef.current = ownedCount;

    // Only trigger auto-hire on a real 0→1 transition (not on mount).
    const justMadeFirstPurchase = ownedCount === 1 && prev === 0;

    if (!justMadeFirstPurchase) return;
    if (!npcs || npcIds.length < 3) return;

    // Build queue: unowned NPC IDs (those not in the owned set)
    const unowned = npcIds.filter((id) => !ownedIds.has(id));
    if (unowned.length === 0) return;

    setAutoHireQueue(unowned);
    queueRef.current = unowned;
    setAutoHireTimer(3);
  }, [ownedCount, npcIds, ownedIds, npcs]);

  // Process the auto-hire queue: one hire every 3 seconds.
  useEffect(() => {
    if (autoHireQueue.length === 0) return;
    if (autoHiringId !== null) return; // already hiring

    // Small delay before starting so the confetti / toast from the manual
    // purchase has time to settle.
    const startDelay = setTimeout(async () => {
      setAutoHireTimer(null); // hide timer while hiring

      const nextId = autoHireQueue[0];
      if (!nextId) return;

      setAutoHiringId(nextId);

      try {
        const res = await fetch("/api/game/purchase", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetId: nextId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Auto-hire failed");

        toast.success(`Auto-hired! 🎉`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["starter-npcs"] }),
          queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
          queryClient.invalidateQueries({ queryKey: ["player"] }),
          queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
        ]);
        onPurchase();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Auto-hire failed");
      } finally {
        // Remove the hired NPC from queue; schedule next if any remain.
        const remaining = queueRef.current.filter((id) => id !== nextId);
        queueRef.current = remaining;
        setAutoHireQueue(remaining);
        setAutoHiringId(null);

        if (remaining.length > 0) {
          setAutoHireTimer(3);
        }
      }
    }, 800); // small delay for confetti to play

    return () => clearTimeout(startDelay);
  }, [autoHireQueue, autoHiringId, queryClient, onPurchase]);

  // Countdown tick for the auto-hire timer.
  useEffect(() => {
    if (autoHireTimer === null || autoHireTimer <= 0) return;
    const id = setTimeout(() => setAutoHireTimer((t) => (t ?? 1) - 1), 1000);
    return () => clearTimeout(id);
  }, [autoHireTimer]);

  // ── End auto-hire orchestration ─────────────────────────────────────

  const banner = getBannerStyle(ownedCount);

  return (
    <div className="space-y-4">
      {/* Progress banner */}
      <div
        className={`relative overflow-hidden rounded-lg border p-4 text-center transition-colors duration-500 ${banner.wrapper}`}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <Target className={`h-5 w-5 ${banner.icon}`} />
          <p className={`text-lg font-bold ${banner.headline}`}>
            {banner.title}
          </p>
        </div>
        <p className={`text-sm ${banner.sub}`}>{banner.subtitle}</p>

        {/* Auto-hire countdown (visible while queue is active) */}
        {autoHireTimer !== null && autoHireQueue.length > 0 && (
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <Clock className="h-4 w-4 text-amber-300 animate-pulse" />
            <span className="text-sm font-semibold text-amber-200">
              Auto-hiring next NPC in {autoHireTimer}s…
            </span>
          </div>
        )}

        {/* 3-segment progress bar */}
        <div className="mt-3 flex gap-1.5 px-2 sm:px-8">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-all duration-500 ${
                i < ownedCount
                  ? ownedCount >= 3
                    ? "bg-gradient-to-r from-emerald-400 to-green-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]"
                    : "bg-gradient-to-r from-orange-400 to-amber-400 shadow-[0_0_10px_rgba(251,146,60,0.6)]"
                  : "bg-gray-700/60"
              }`}
            />
          ))}
        </div>
      </div>

      {/* NPC grid — cards now carry the color, no extra glass panel needed */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-t1-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {npcs?.map((npc, idx) => {
            // Resolve auto-hire status for this NPC
            const isCurrentlyHiring = autoHiringId === npc.id;
            const isQueued = autoHireQueue.includes(npc.id) && !isCurrentlyHiring;
            return (
              <StarterNpcCard
                key={npc.id}
                npc={npc}
                positionIndex={idx + 1}
                onPurchase={onPurchase}
                autoHireStatus={isCurrentlyHiring ? "hiring" : isQueued ? "queued" : "idle"}
                autoHireTimer={isQueued ? autoHireTimer ?? 0 : 0}
              />
            );
          })}
        </div>
      )}

      {npcIds.length < 3 && (
        <p className="text-yellow-400 text-sm text-center">
          ⚠️ Only {npcIds.length} NPCs available under $20. Check back later!
        </p>
      )}
    </div>
  );
}

/* ----------------------------- Banner palette ----------------------------- */

interface BannerStyle {
  wrapper: string;
  icon: string;
  headline: string;
  sub: string;
  title: string;
  subtitle: string;
}

function getBannerStyle(ownedCount: number): BannerStyle {
  if (ownedCount >= 3) {
    return {
      wrapper:
        "bg-gradient-to-r from-emerald-700/50 via-green-600/45 to-emerald-700/50 border-emerald-400/70 shadow-[0_0_24px_rgba(74,222,128,0.35)]",
      icon: "text-emerald-300",
      headline: "text-emerald-100",
      sub: "text-emerald-200",
      title: "🎉 Onboarding complete!",
      subtitle: "Welcome to the full game — the market is unlocked.",
    };
  }
  if (ownedCount === 2) {
    return {
      wrapper:
        "bg-gradient-to-r from-orange-700/50 via-amber-600/45 to-orange-700/50 border-orange-400/70 shadow-[0_0_24px_rgba(251,146,60,0.35)]",
      icon: "text-orange-300",
      headline: "text-orange-100",
      sub: "text-orange-200",
      title: "🎉 Almost there — 1 more to go!",
      subtitle: "Progress: 2/3 acquired",
    };
  }
  if (ownedCount === 1) {
    return {
      wrapper:
        "bg-gradient-to-r from-amber-800/45 via-amber-700/40 to-amber-800/45 border-amber-400/60 shadow-[0_0_18px_rgba(251,191,36,0.3)]",
      icon: "text-amber-300",
      headline: "text-amber-100",
      sub: "text-amber-200",
      title: "🎉 Great start — 2 more to unlock!",
      subtitle: "Progress: 1/3 acquired",
    };
  }
  return {
    wrapper:
      "bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-blue-500/40",
    icon: "text-blue-400",
    headline: "text-blue-200",
    sub: "text-blue-300",
    title: "Press the Orange Button to Continue",
    subtitle: "Progress: 0/3 acquired",
  };
}

type AutoHireStatus = "idle" | "queued" | "hiring";

function StarterNpcCard({
  npc,
  positionIndex,
  onPurchase,
  autoHireStatus = "idle",
  autoHireTimer = 0,
}: {
  npc: StarterNpc;
  positionIndex: number;
  onPurchase: () => void;
  autoHireStatus?: AutoHireStatus;
  autoHireTimer?: number;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const [isPending, setIsPending] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [justAcquired, setJustAcquired] = useState(false);
  const { data: credits } = useCredits();

  const { ownedIds } = useOwnedPlayerIds();
  const isOwned = ownedIds.has(npc.id);
  const canAfford = (credits ?? 0) >= npc.playerValue;

  // Detect the false→true flip on isOwned and fire the celebratory animation
  // exactly once per acquisition. Without the ref guard, refetches that
  // happen to land while the card is still mounted would re-fire the burst.
  const prevIsOwnedRef = useRef(isOwned);
  useEffect(() => {
    if (!prevIsOwnedRef.current && isOwned) {
      setShowConfetti(true);
      setJustAcquired(true);
      const t1 = setTimeout(() => setShowConfetti(false), 850);
      const t2 = setTimeout(() => setJustAcquired(false), 700);
      prevIsOwnedRef.current = isOwned;
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    prevIsOwnedRef.current = isOwned;
  }, [isOwned]);

  const npcAvatarSrc = getAvatarSrc({
    avatarUrl: npc.avatarUrl,
    playerId: npc.id,
    playerUsername: npc.username,
    viewerUsername: session?.user?.name,
    ownedIds,
  });

  const handleHire = async () => {
    if (!canAfford || isPending || isOwned) return;
    play("hire");
    setIsPending(true);
    try {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: npc.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");

      toast.success(`You bought ${npc.username}! 🎉`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["starter-npcs"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["owned-player-ids"] }),
      ]);
      onPurchase();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setIsPending(false);
    }
  };

  // Resolve which of 5 visual states this card is in. Checked in priority order:
  //   acquired > auto-hiring > queued > pending > next-up (afford) > locked (can't afford).
  const cardState: "acquired" | "auto-hiring" | "queued" | "pending" | "next-up" | "locked" = isOwned
    ? "acquired"
    : autoHireStatus === "hiring"
      ? "auto-hiring"
      : autoHireStatus === "queued"
        ? "queued"
        : isPending
          ? "pending"
          : canAfford
            ? "next-up"
            : "locked";

  const cardClass: Record<typeof cardState, string> = {
    acquired:
      "border-orange-400/70 bg-gradient-to-br from-orange-500/30 via-amber-500/25 to-orange-500/30 ring-2 ring-orange-400/60 shadow-[0_0_22px_rgba(251,146,60,0.5)]",
    "auto-hiring":
      "border-purple-400/70 bg-gray-900/80 ring-2 ring-purple-400/60 shadow-[0_0_18px_rgba(168,85,247,0.4)]",
    queued:
      "border-cyan-400/50 bg-gray-900/80 ring-1 ring-cyan-300/30",
    pending:
      "border-orange-400/80 bg-gray-900/80 animate-pulse",
    "next-up":
      "border-amber-400/70 bg-gray-900/80 ring-1 ring-amber-300/40 animate-pulse",
    locked: "border-cyan-500/30 bg-gray-900/80",
  };

  const positionBadgeClass: Record<typeof cardState, string> = {
    acquired:
      "bg-gradient-to-br from-orange-400 to-amber-500 text-orange-950 shadow-[0_0_8px_rgba(251,146,60,0.7)]",
    "auto-hiring":
      "bg-gradient-to-br from-purple-400 to-violet-500 text-purple-950 shadow-[0_0_8px_rgba(168,85,247,0.7)] animate-pulse",
    queued:
      "bg-cyan-600 text-white",
    pending: "bg-orange-500/80 text-white",
    "next-up":
      "bg-gradient-to-br from-amber-300 to-amber-500 text-amber-950 shadow-[0_0_6px_rgba(251,191,36,0.6)]",
    locked: "bg-gray-700 text-gray-300",
  };

  // Card-level glow class for auto-hiring/queued visual feedback
  const glowClass = autoHireStatus === "hiring"
    ? "ring-2 ring-purple-400/60 shadow-[0_0_22px_rgba(168,85,247,0.5)]"
    : autoHireStatus === "queued"
      ? "ring-1 ring-cyan-400/40"
      : "";

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 ${cardClass[cardState]} ${glowClass} ${
        justAcquired ? "scale-[1.04]" : "scale-100"
      }`}
    >
      {/* Position badge (1/2/3) so the user mentally tracks where they are */}
      <div
        className={`absolute top-1.5 left-1.5 z-10 h-5 w-5 rounded-full flex items-center justify-center text-[11px] font-black ${positionBadgeClass[cardState]}`}
        aria-label={`Starter ${positionIndex} of 3`}
      >
        {positionIndex}
      </div>

      {/* Confetti burst — only mounted briefly after acquisition */}
      {showConfetti && <ConfettiBurst />}

      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Avatar
            className={`h-14 w-14 shrink-0 transition-shadow ${
              cardState === "acquired"
                ? "ring-2 ring-orange-300/80 shadow-[0_0_12px_rgba(251,146,60,0.6)]"
                : ""
            }`}
          >
            <AvatarImage src={npcAvatarSrc} />
            <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-sm font-bold">
              {npc.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p
              className={`font-medium text-sm truncate ${
                cardState === "acquired" ? "text-orange-50" : "text-white"
              }`}
            >
              {npc.username}
            </p>
            <p
              className={`text-xs ${
                cardState === "acquired" ? "text-orange-200/90" : "text-gray-400"
              }`}
            >
              {formatCompact(npc.playerValue)}¢
            </p>
          </div>

          {/* Right-side action: badge or button depending on state */}
          {cardState === "acquired" ? (
            <div className="shrink-0 flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-orange-950 font-black text-xs px-2.5 py-1.5 shadow-[0_0_10px_rgba(251,146,60,0.6)]">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              Acquired
            </div>
          ) : cardState === "auto-hiring" ? (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-500 to-violet-500 text-white font-bold text-xs px-2.5 py-1.5 shadow-[0_0_10px_rgba(168,85,247,0.6)] animate-pulse">
              <Loader2 className="h-3 w-3 animate-spin" />
              Hiring…
            </div>
          ) : cardState === "queued" ? (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full bg-cyan-600/80 text-white font-semibold text-xs px-2.5 py-1.5">
              <Clock className="h-3 w-3" />
              {autoHireTimer > 0 ? `${autoHireTimer}s` : "..."}
            </div>
          ) : (
            <Button
              onClick={handleHire}
              disabled={!canAfford || isPending}
              className={`shrink-0 h-32 w-32 p-0 flex flex-col items-center justify-center gap-2 rounded-2xl text-sm font-bold ${
                cardState === "next-up"
                  ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-amber-950 shadow-[0_0_14px_rgba(251,146,60,0.55)]"
                  : canAfford
                    ? "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="h-14 w-14" />
                  <span className="text-base font-black">{formatCompact(npc.playerValue)}¢</span>
                </>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ ConfettiBurst ----------------------------- */

/**
 * Tiny self-contained confetti effect — no external library, no canvas. Renders
 * ~14 colored dots that fly outwards on radial vectors, fading out over ~800 ms.
 * Uses a single `requestAnimationFrame` loop and unmounts itself once the parent
 * clears the `showConfetti` flag, so there's nothing left running between
 * acquisitions.
 */
function ConfettiBurst() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<number | null>(null);

  // Pre-compute particle definitions once per mount. We use `useState` with a
  // lazy initializer (rather than `useRef`/`useMemo`) so the impure
  // `Math.random` calls run exactly once during state init, not during render
  // — keeping the component pure between renders.
  const [particles] = useState(() =>
    Array.from({ length: 14 }, (_, i) => {
      const angle = (i / 14) * Math.PI * 2 + Math.random() * 0.5;
      const distance = 50 + Math.random() * 50; // px
      return {
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        rot: Math.random() * 720 - 360,
        color: [
          "#fb923c", // orange-400
          "#fbbf24", // amber-400
          "#f472b6", // pink-400
          "#facc15", // yellow-400
          "#fde68a", // amber-200
        ][i % 5],
        size: 5 + Math.random() * 4,
      };
    })
  );

  useEffect(() => {
    let raf = 0;
    const duration = 800;

    const tick = (t: number) => {
      if (startRef.current === null) startRef.current = t;
      const elapsed = t - startRef.current;
      const p = Math.min(1, elapsed / duration);
      // Ease-out cubic for a snappy initial burst
      const eased = 1 - Math.pow(1 - p, 3);
      const opacity = 1 - p;
      const container = containerRef.current;
      if (container) {
        const dots = container.children;
        for (let i = 0; i < dots.length; i++) {
          const dot = dots[i] as HTMLDivElement;
          const part = particles[i];
          dot.style.transform = `translate(-50%, -50%) translate(${part.dx * eased}px, ${part.dy * eased}px) rotate(${part.rot * eased}deg)`;
          dot.style.opacity = String(opacity);
        }
      }
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [particles]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-20"
      aria-hidden="true"
    >
      {particles.map((p, i) => (
        <div
          key={i}
          className="absolute top-1/2 left-1/2 rounded-sm"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            transform: "translate(-50%, -50%)",
          }}
        />
      ))}
    </div>
  );
}
