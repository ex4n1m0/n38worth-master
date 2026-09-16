"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  X,
  Check,
  Circle,
  Camera,
  UserPlus,
  Sparkles,
  Users,
  Terminal,
  Gift,
  Trophy,
} from "lucide-react";
import { useOnboarding } from "@/components/OnboardingContext";
import { useSound } from "@/hooks/useSound";
import { UNLOCK_GAME_THRESHOLD } from "@/lib/missions-data";
import { formatCompact } from "@/lib/utils";

const STORAGE_KEY = "n38worth_new_player_guide_dismissed";

interface MissionData {
  missionLevel: number;
  ownedCount: number;
  allComplete: boolean;
}

/**
 * Live "Getting Started" checklist for first-time players. Each step ticks
 * itself off from real game state (onboarding context, missions, profile,
 * daily-reward status), so a new player always has a visible answer to
 * "what do I do next?". Auto-hides once every step is complete; dismissible
 * for 24 hours. The last row is the long-term win-condition teaser.
 */
export function NewPlayerGuide() {
  const { data: session } = useSession();
  const username = session?.user?.name;
  const { state: onboarding, loading: onboardingLoading } = useOnboarding();
  const { play } = useSound();

  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (!dismissed) return true;
    const expiry = parseInt(dismissed, 10);
    if (Date.now() <= expiry) return false;
    localStorage.removeItem(STORAGE_KEY);
    return true;
  });
  const [isClosing, setIsClosing] = useState(false);

  const { data: missions } = useQuery<MissionData>({
    queryKey: ["missions"],
    queryFn: async () => {
      const res = await fetch("/api/missions");
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
  });

  const { data: player } = useQuery({
    queryKey: ["player", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!username,
  });

  const { data: rewardStatus } = useQuery<{ canClaim: boolean }>({
    queryKey: ["login-reward-status"],
    queryFn: async () => {
      const res = await fetch("/api/game/login-reward");
      if (!res.ok) throw new Error("Failed to fetch reward status");
      return res.json();
    },
  });

  const handleDismiss = () => {
    play("close");
    setIsClosing(true);
    // Store in localStorage for 24 hours
    const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    localStorage.setItem(STORAGE_KEY, expiry.toString());

    setTimeout(() => {
      setIsVisible(false);
    }, 300);
  };

  if (onboardingLoading) return null;

  const ownedCount = missions?.ownedCount ?? 0;
  const missionLevel = missions?.missionLevel ?? 0;

  const steps = [
    {
      icon: Camera,
      title: "Upload your avatar",
      hint: "Your avatar needs a face before anyone can hire you.",
      done: onboarding.avatarCompleted,
      progress: null as string | null,
    },
    {
      icon: UserPlus,
      title: "Hire your first 3 avatars",
      hint: "Owned avatars earn you credits every time someone hires them from you.",
      done: ownedCount >= 3,
      progress: ownedCount >= 3 ? null : `${Math.min(ownedCount, 3)}/3`,
    },
    {
      icon: Sparkles,
      title: "Pick your profession",
      hint: "Claim one on your profile page — each profession has a unique perk.",
      done: !!player?.profession || onboarding.professionSelected,
      progress: null,
    },
    {
      icon: Users,
      title: `Own ${UNLOCK_GAME_THRESHOLD} avatars to unlock the Game`,
      hint: "Unlocks ranks, professions & combos. Hire cheap ownerless avatars first!",
      done: missionLevel >= 1,
      progress:
        missionLevel >= 1
          ? null
          : `${formatCompact(Math.min(ownedCount, UNLOCK_GAME_THRESHOLD))}/${formatCompact(UNLOCK_GAME_THRESHOLD)}`,
    },
    {
      icon: Terminal,
      title: "Get hired by another player",
      hint: "Every hire raises your value — and your revenue share.",
      done: (player?.ownerCount ?? 0) > 0,
      progress: null,
    },
    {
      icon: Gift,
      title: "Claim your daily reward",
      hint: "Free credits every day — it auto-claims on your profile page.",
      done: rewardStatus ? !rewardStatus.canClaim : false,
      progress: null,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (!isVisible || allDone) return null;

  return (
    <div className={`transition-all duration-300 ${isClosing ? "opacity-0 -translate-y-4" : "opacity-100"}`}>
      <div className="bg-gradient-to-r from-t1-900/40 via-gray-900/80 to-t2-900/40 rounded-xl border border-t1-500/20 overflow-hidden mb-6">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/50">
          <div>
            <h2 className="text-lg font-bold text-white">Getting Started 🎮</h2>
            <p className="text-xs text-t1-300">
              {doneCount}/{steps.length} done — complete these to learn the ropes
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            aria-label="Dismiss guide"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Steps */}
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex items-start gap-2.5 rounded-lg p-3 border transition-all ${
                  step.done
                    ? "bg-green-950/20 border-green-500/20"
                    : "bg-gray-900/60 border-gray-800"
                }`}
              >
                <div
                  className={`p-1.5 rounded-md shrink-0 ${
                    step.done ? "bg-green-500/15" : "bg-t1-500/10"
                  }`}
                >
                  {step.done ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <step.icon className="h-3.5 w-3.5 text-t1-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3
                    className={`font-semibold text-xs flex items-center gap-1.5 ${
                      step.done ? "text-green-300" : "text-white"
                    }`}
                  >
                    {step.title}
                    {step.progress && (
                      <span className="text-[10px] font-bold text-t1-300 tabular-nums">
                        {step.progress}
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                    {step.hint}
                  </p>
                </div>
                {!step.done && (
                  <Circle className="h-3 w-3 text-gray-700 shrink-0 mt-1" />
                )}
              </div>
            ))}
          </div>

          {/* Win-condition teaser — the long-term goal, visible from day one. */}
          <div className="mt-3 flex items-center gap-2.5 rounded-lg p-3 border border-amber-500/25 bg-amber-950/20">
            <div className="p-1.5 rounded-md bg-amber-500/15 shrink-0">
              <Trophy className="h-3.5 w-3.5 text-amber-400" />
            </div>
            <p className="text-xs text-amber-200/90 leading-tight">
              <span className="font-semibold text-amber-300">The big goal:</span>{" "}
              climb the mission ladder to unlock all 6 Goddesses — hold them all
              for 60 minutes and you <span className="font-semibold">win the game</span>.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-2 bg-gray-900/30 border-t border-gray-800/50 flex items-center justify-between">
          <p className="text-[10px] text-gray-500">
            This guide hides itself once you complete every step (or dismiss it for 24h)
          </p>
        </div>
      </div>
    </div>
  );
}
