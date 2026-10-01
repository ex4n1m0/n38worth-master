"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Flame, RefreshCw, Skull, Target, Timer } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useNow } from "@/hooks/useNow";
import { formatCompact } from "@/lib/utils";
import { toast } from "@/lib/event-feed";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { WorldVaultBar } from "@/components/raid/WorldVaultBar";
import { BlueprintsTab } from "@/components/raid/BlueprintsTab";
import { Button } from "@/components/ui/button";

/**
 * /raid — the heist layer's home (GAME_INTEGRATION_STUDY §5A/§5B).
 *
 * Two tabs: VAULT RAIDS (case a target → drill 3 locks → loot reveal) and
 * the BOUNTY BOARD (escrowed contracts on other players' buildings). All
 * economy math is server-side; this component only renders results.
 */

interface RaidTarget {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  isNpc: number;
}

interface RaidHistoryEntry {
  id: number;
  direction: "out" | "in";
  other: { id: number; username: string; avatarUrl: string | null } | null;
  locksCracked: number;
  lootCredits: number;
  victimCredits: number;
  createdAt: string;
}

interface RaidStateData {
  charges: number;
  cap: number;
  nextChargeAt: number;
  history: RaidHistoryEntry[];
}

interface RaidResult {
  target: { id: number; username: string; avatarUrl: string | null };
  locks: boolean[];
  locksCracked: number;
  multiplier: number;
  loot: number;
  poolCredits: number;
  victimCredits: number;
  chargesLeft: number;
}

interface BoardBounty {
  id: number;
  type: "foreclose" | "deliver";
  targetUsername: string;
  targetAvatarUrl: string | null;
  targetValue: number;
  ownerUsername: string | null;
  rewardCredits: number;
  creatorUsername: string;
  expiresAt: string;
}

interface MyBounty {
  id: number;
  type: "foreclose" | "deliver";
  targetUsername: string;
  rewardCredits: number;
  feeCredits: number;
  status: string;
  takerUsername: string | null;
  expiresAt: string;
  createdAt: string;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.ceil(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MiniAvatar({ username, avatarUrl, className }: { username: string; avatarUrl: string | null; className?: string }) {
  return (
    <Avatar className={className ?? "h-9 w-9"}>
      <AvatarImage src={avatarUrl || undefined} alt={username} />
      <AvatarFallback className="bg-gray-800 text-gray-300 text-xs font-bold">
        {username.slice(0, 2).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** Sequential lock-reveal — the raid's suspense moment. Server has already
 *  resolved the numbers; this only animates the outcome. */
function RaidRevealModal({ result, onClose }: { result: RaidResult; onClose: () => void }) {
  const { t } = useLanguage();
  const { play } = useSound();
  const [revealed, setRevealed] = useState(0);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(result.locks.length);
      play(result.locksCracked >= 2 ? "reward" : "error");
      return;
    }
    setRevealed(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    result.locks.forEach((cracked, i) => {
      timers.push(
        setTimeout(() => {
          setRevealed(i + 1);
          play(cracked ? "reward" : "error");
        }, 650 * (i + 1))
      );
    });
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const done = revealed >= result.locks.length;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.raidRevealTitle}
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-gray-950 p-6 shadow-[0_0_60px_rgba(245,158,11,0.15)]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-black tracking-[0.25em] text-amber-400">
            {t.raidRevealTitle}
          </span>
          <Timer className="h-4 w-4 text-amber-400/70" />
        </div>
        <p className="text-sm text-gray-400 mb-5">
          {t.raidRevealTarget.replace("{name}", result.target.username)}
        </p>

        <div className="space-y-2 mb-5">
          {result.locks.map((cracked, i) => {
            const isRevealed = i < revealed;
            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all duration-300 ${
                  !isRevealed
                    ? "border-gray-800 bg-gray-900/60 text-gray-500"
                    : cracked
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/50 bg-red-500/10 text-red-300"
                }`}
              >
                <span className="text-xs font-mono tracking-widest">
                  {`LOCK ${String.fromCharCode(65 + i)}`}
                </span>
                {!isRevealed ? (
                  <span className="text-xs font-semibold animate-pulse">{t.raidRevealDrilling}</span>
                ) : (
                  <span className="text-xs font-black tracking-wider">
                    {cracked ? t.raidLockCracked : t.raidLockHeld}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {done && (
          <div className="border-t border-gray-800 pt-4 space-y-2 animate-in fade-in duration-300">
            {result.locksCracked === 0 && (
              <p className="text-xs text-red-400 text-center">{t.raidTripped}</p>
            )}
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-[11px] font-black tracking-[0.25em] text-gray-500">
                {t.raidLootTotal}
              </span>
              <span className="font-mono text-3xl font-black text-amber-300 tabular-nums">
                {formatCompact(result.loot)}¢
              </span>
            </div>
            <p className="text-center text-xs text-gray-500">
              {t.raidBreakdown
                .replace("{pool}", formatCompact(result.poolCredits))
                .replace("{vault}", formatCompact(result.victimCredits))}
              {" · "}
              {t.raidMultiplier.replace("{mult}", String(result.multiplier))}
            </p>
            <Button
              onClick={onClose}
              className="w-full mt-2 bg-amber-500 hover:bg-amber-400 text-black font-bold"
            >
              {t.raidClose}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function RaidTab() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const now = useNow();
  const [revealResult, setRevealResult] = useState<RaidResult | null>(null);

  const stateQuery = useQuery<RaidStateData>({
    queryKey: ["raid-state"],
    queryFn: async () => {
      const res = await fetch("/api/game/raid");
      if (!res.ok) throw new Error("Failed to load raid state");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 120 * 1000,
  });

  const targetsQuery = useQuery<{ targets: RaidTarget[] }>({
    queryKey: ["raid-targets"],
    queryFn: async () => {
      const res = await fetch("/api/game/raid/targets");
      if (!res.ok) throw new Error("Failed to load targets");
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 300 * 1000,
  });

  const raidMutation = useMutation({
    mutationFn: async (targetId: number) => {
      const res = await fetch("/api/game/raid/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Raid failed");
      return data as RaidResult;
    },
    onSuccess: (data) => {
      setRevealResult(data);
      play("hire");
      queryClient.invalidateQueries({ queryKey: ["raid-state"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (error: Error) => {
      play("error");
      toast.error(error.message);
    },
  });

  const charges = stateQuery.data?.charges ?? 0;
  const cap = stateQuery.data?.cap ?? 3;
  const nextChargeMs = (stateQuery.data?.nextChargeAt ?? 0) - now;

  return (
    <div className="space-y-6">
      {/* Charge meter */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Skull className="h-5 w-5 text-amber-400" />
          <span className="text-sm font-bold text-gray-200">{t.raidCharges}</span>
        </div>
        <div className="flex items-center gap-1.5" aria-label={`${charges}/${cap}`}>
          {Array.from({ length: cap }, (_, i) => (
            <span
              key={i}
              className={`h-3 w-3 rounded-full transition-colors ${
                i < charges
                  ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]"
                  : "bg-gray-800 border border-gray-700"
              }`}
            />
          ))}
        </div>
        <span className="ml-auto text-xs text-gray-500 font-mono">
          {charges >= cap
            ? t.raidChargesFull
            : t.raidNextChargeIn.replace("{time}", formatCountdown(nextChargeMs))}
        </span>
      </div>

      {/* Targets */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-100">
            <Target className="h-4 w-4 text-amber-400" />
            {t.raidTargetsTitle}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-gray-400"
            onClick={() => {
              play("click");
              targetsQuery.refetch();
            }}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${targetsQuery.isFetching ? "animate-spin" : ""}`} />
            {t.raidTargetsRefresh}
          </Button>
        </div>
        <p className="text-xs text-gray-500 mb-3">{t.raidTargetsHint}</p>

        {targetsQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-900/70" />
            ))}
          </div>
        ) : (targetsQuery.data?.targets.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">{t.raidNoTargets}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {targetsQuery.data!.targets.map((target) => (
              <div
                key={target.id}
                className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 flex items-center gap-3"
              >
                <MiniAvatar username={target.username} avatarUrl={target.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${target.username}`}
                    className="block truncate text-sm font-bold text-gray-100 hover:text-cyan-300"
                  >
                    {target.username}
                  </Link>
                  <span className="text-xs text-gray-500 font-mono">
                    {t.value}: {formatCompact(target.playerValue)}¢
                  </span>
                </div>
                <Button
                  size="sm"
                  disabled={charges <= 0 || raidMutation.isPending}
                  onClick={() => raidMutation.mutate(target.id)}
                  className="bg-amber-500 hover:bg-amber-400 text-black font-black text-xs tracking-wider"
                >
                  {raidMutation.isPending && raidMutation.variables === target.id
                    ? t.raidBusy
                    : t.raidExecute}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="text-base font-bold text-gray-100 mb-3">{t.raidHistoryTitle}</h2>
        {stateQuery.isLoading ? (
          <div className="h-16 animate-pulse rounded-xl bg-gray-900/70" />
        ) : (stateQuery.data?.history.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 py-3">{t.raidHistoryEmpty}</p>
        ) : (
          <ul className="space-y-1.5">
            {stateQuery.data!.history.map((entry) => (
              <li
                key={entry.id}
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  entry.direction === "out"
                    ? "border-gray-800 bg-gray-900/50"
                    : "border-red-500/20 bg-red-500/[0.06]"
                }`}
              >
                <span className="text-xs font-mono text-gray-600 shrink-0">
                  {new Date(entry.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                {entry.other ? (
                  <Link
                    href={`/players/${entry.other.username}`}
                    className="text-sm font-semibold text-gray-200 hover:text-cyan-300 truncate"
                  >
                    {entry.direction === "out"
                      ? t.raidHistoryOut.replace("{name}", entry.other.username)
                      : t.raidHistoryIn.replace("{name}", entry.other.username)}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-500">—</span>
                )}
                <span className="ml-auto shrink-0 font-mono text-sm font-bold tabular-nums text-amber-300">
                  +{formatCompact(entry.lootCredits)}¢
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {revealResult && (
        <RaidRevealModal result={revealResult} onClose={() => setRevealResult(null)} />
      )}
    </div>
  );
}

function BountyTab() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { play } = useSound();
  const [type, setType] = useState<"foreclose" | "deliver">("foreclose");
  const [targetUsername, setTargetUsername] = useState("");
  const [reward, setReward] = useState("");

  const boardQuery = useQuery<{ board: BoardBounty[]; mine: MyBounty[] }>({
    queryKey: ["bounties"],
    queryFn: async () => {
      const res = await fetch("/api/game/bounties");
      if (!res.ok) throw new Error("Failed to load bounties");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 180 * 1000,
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/bounties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetUsername, reward: Number(reward) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to post bounty");
      return data;
    },
    onSuccess: () => {
      play("reward");
      toast.success(t.bountyPostTitle);
      setTargetUsername("");
      setReward("");
      queryClient.invalidateQueries({ queryKey: ["bounties"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (error: Error) => {
      play("error");
      toast.error(error.message);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch("/api/game/bounties/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      return data;
    },
    onSuccess: () => {
      play("sell");
      queryClient.invalidateQueries({ queryKey: ["bounties"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (error: Error) => {
      play("error");
      toast.error(error.message);
    },
  });

  const rewardNum = Number(reward) || 0;
  const feePreview = Math.max(1, Math.floor(rewardNum * 0.02));

  const statusLabel = (status: string) =>
    status === "open"
      ? t.bountyStatusOpen
      : status === "completed"
        ? t.bountyStatusCompleted
        : status === "expired"
          ? t.bountyStatusExpired
          : t.bountyStatusCancelled;

  return (
    <div className="space-y-6">
      {/* Post form */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-100 mb-3">
          <Flame className="h-4 w-4 text-red-400" />
          {t.bountyPostTitle}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <button
            type="button"
            onClick={() => { setType("foreclose"); play("click"); }}
            className={`rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors ${
              type === "foreclose"
                ? "border-red-500/60 bg-red-500/10 text-red-200"
                : "border-gray-800 bg-gray-900/50 text-gray-400 hover:border-gray-700"
            }`}
          >
            <span className="block font-black tracking-widest mb-0.5">{t.bountyTypeForeclose}</span>
            {t.bountyPostTypeForeclose}
          </button>
          <button
            type="button"
            onClick={() => { setType("deliver"); play("click"); }}
            className={`rounded-lg border px-3 py-2 text-left text-xs leading-snug transition-colors ${
              type === "deliver"
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-200"
                : "border-gray-800 bg-gray-900/50 text-gray-400 hover:border-gray-700"
            }`}
          >
            <span className="block font-black tracking-widest mb-0.5">{t.bountyTypeDeliver}</span>
            {t.bountyPostTypeDeliver}
          </button>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={targetUsername}
            onChange={(e) => setTargetUsername(e.target.value)}
            placeholder={t.bountyPostTarget}
            aria-label={t.bountyPostTarget}
            className="flex-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-amber-500/60 focus:outline-none"
          />
          <input
            value={reward}
            onChange={(e) => setReward(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder={t.bountyPostReward}
            aria-label={t.bountyPostReward}
            inputMode="numeric"
            className="w-full sm:w-40 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-amber-500/60 focus:outline-none font-mono"
          />
          <Button
            disabled={postMutation.isPending || !targetUsername.trim() || rewardNum < 100}
            onClick={() => postMutation.mutate()}
            className="bg-red-500 hover:bg-red-400 text-white font-bold shrink-0"
          >
            {postMutation.isPending ? t.bountyPosting : t.bountyPostButton}
          </Button>
        </div>
        {rewardNum >= 100 && (
          <p className="mt-2 text-xs text-gray-500 font-mono">
            {t.bountyPostFee
              .replace("{fee}", formatCompact(feePreview))
              .replace("{reward}", formatCompact(rewardNum))}
          </p>
        )}
      </section>

      {/* Board */}
      <section>
        <h2 className="text-base font-bold text-gray-100 mb-3">{t.bountyBoardTitle}</h2>
        {boardQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-900/70" />
            ))}
          </div>
        ) : (boardQuery.data?.board.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 py-3">{t.bountyBoardEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {boardQuery.data!.board.map((bounty) => (
              <li
                key={bounty.id}
                className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 flex items-center gap-3"
              >
                <MiniAvatar username={bounty.targetUsername} avatarUrl={bounty.targetAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/players/${bounty.targetUsername}`}
                      className="text-sm font-bold text-gray-100 hover:text-cyan-300 truncate"
                    >
                      {bounty.targetUsername}
                    </Link>
                    <span
                      className={`text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded ${
                        bounty.type === "foreclose"
                          ? "bg-red-500/15 text-red-300"
                          : "bg-cyan-500/15 text-cyan-300"
                      }`}
                    >
                      {bounty.type === "foreclose" ? t.bountyTypeForeclose : t.bountyTypeDeliver}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {t.bountyBy.replace("{name}", bounty.creatorUsername)}
                    {bounty.ownerUsername ? ` · ${bounty.ownerUsername}` : ""}
                  </span>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-black text-amber-300 tabular-nums">
                    {formatCompact(bounty.rewardCredits)}¢
                  </div>
                  <Link
                    href={`/players/${bounty.targetUsername}`}
                    className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300"
                  >
                    {t.bountyGoPoach} →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* My bounties */}
      <section>
        <h2 className="text-base font-bold text-gray-100 mb-3">{t.bountyMineTitle}</h2>
        {(boardQuery.data?.mine.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 py-3">{t.bountyMineEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {boardQuery.data!.mine.map((bounty) => (
              <li
                key={bounty.id}
                className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 flex items-center gap-3"
              >
                <span className="text-sm font-semibold text-gray-200 truncate flex-1">
                  {bounty.targetUsername}
                  <span className="text-gray-600 font-mono text-xs ml-2">
                    {formatCompact(bounty.rewardCredits)}¢
                  </span>
                </span>
                {bounty.status === "completed" && bounty.takerUsername && (
                  <span className="text-xs text-cyan-400">
                    {t.bountyTaker.replace("{name}", bounty.takerUsername)}
                  </span>
                )}
                <span
                  className={`text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded ${
                    bounty.status === "open"
                      ? "bg-amber-500/15 text-amber-300"
                      : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {statusLabel(bounty.status)}
                </span>
                {bounty.status === "open" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-400 hover:text-red-300"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(bounty.id)}
                  >
                    {t.bountyCancel}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function RaidPage() {
  const { t } = useLanguage();
  const { play } = useSound();
  const [tab, setTab] = useState<"raid" | "bounties" | "blueprints">("raid");

  const tabs = useMemo(
    () =>
      [
        { id: "raid" as const, label: t.raidTabRaid },
        { id: "bounties" as const, label: t.raidTabBounties },
        { id: "blueprints" as const, label: t.raidTabBlueprints },
      ],
    [t]
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5 py-2">
      <header>
        <div className="flex items-center gap-2">
          <Crosshair className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-black tracking-tight text-gray-100">{t.raidPageTitle}</h1>
        </div>
        <p className="mt-1 text-sm text-gray-500">{t.raidPageSubtitle}</p>
      </header>

      <WorldVaultBar />

      <div className="flex gap-2" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => {
              setTab(item.id);
              play("click");
            }}
            className={`px-4 h-9 rounded-lg border text-sm font-bold transition-colors ${
              tab === item.id
                ? "border-amber-500/70 bg-amber-500/15 text-amber-300"
                : "border-gray-800 bg-gray-900/50 text-gray-400 hover:border-gray-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "raid" ? <RaidTab /> : tab === "bounties" ? <BountyTab /> : <BlueprintsTab />}
    </div>
  );
}
