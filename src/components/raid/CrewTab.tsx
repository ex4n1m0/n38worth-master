"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Users, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { toast } from "@/lib/event-feed";
import { useNow } from "@/hooks/useNow";
import { formatCompact } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { professionName } from "@/lib/professions";
import { crewJobTitle, crewJobFlavor, OUTCOME_MULTIPLIER } from "@/lib/crew-jobs";
import { familyStyle } from "@/lib/city/map2d/palette";
import { FAMILY_KEYS } from "@/lib/city/map2d/families";

/**
 * Crew Jobs tab (/raid) — pick a 5-card crew, heist a Founder's bank, watch
 * the three locks resolve. Server resolves everything; this only animates.
 */

interface CrewJobView {
  key: string;
  basePayout: number;
  minCrewTiers: number;
  requiredFamilies: { f: number; min: number }[];
  steps: { difficulty: number; favored: number }[];
  fee: number;
  cooldownEndAt: number | null;
}

interface CrewData {
  pot: number;
  jobs: CrewJobView[];
  runs: { jobKey: string; outcome: string; payout: number; fee: number; rolledAt: string }[];
  roster: { id: number; u: string; f: number; t: number; p: string | null }[];
}

interface RunResult {
  steps: { success: boolean; crewPower: number; needed: number }[];
  outcome: string;
  payout: number;
  fee: number;
  potAfter: number;
}

const OUTCOME_KEY: Record<string, "crewOutcomeFail" | "crewOutcomePartial" | "crewOutcomeClean" | "crewOutcomePerfect"> = {
  fail: "crewOutcomeFail",
  partial: "crewOutcomePartial",
  clean: "crewOutcomeClean",
  perfect: "crewOutcomePerfect",
};

export function CrewTab() {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const queryClient = useQueryClient();
  const now = useNow();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [crew, setCrew] = useState<number[]>([]);
  const [reveal, setReveal] = useState<{ jobKey: string; result: RunResult } | null>(null);

  const dataQuery = useQuery<CrewData>({
    queryKey: ["crew-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/game/crew-jobs");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/crew-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobKey: selectedJob, crewCardIds: crew }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Job failed");
      return data as RunResult;
    },
    onSuccess: (result) => {
      setReveal({ jobKey: selectedJob!, result });
      setCrew([]);
      setSelectedJob(null);
      play(result.outcome === "fail" ? "error" : "reward");
      queryClient.invalidateQueries({ queryKey: ["crew-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (error: Error) => {
      play("error");
      toast.error(error.message);
    },
  });

  const roster = useMemo(() => dataQuery.data?.roster ?? [], [dataQuery.data]);
  const rosterById = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const job = dataQuery.data?.jobs.find((j) => j.key === selectedJob) ?? null;

  const toggleCrew = (id: number) => {
    play("click");
    setCrew((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < 5 ? [...c, id] : c));
  };

  const crewTierSum = crew.reduce((s, id) => s + (rosterById.get(id)?.t ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Pot */}
      <div className="rounded-xl border border-amber-500/30 bg-gray-900/60 px-4 py-3 flex flex-wrap items-center gap-3">
        <Landmark className="h-4 w-4 text-amber-400" aria-hidden="true" />
        <span className="text-sm font-bold text-amber-200">{t.crewPotTitle}</span>
        <span className="text-xs text-gray-500">{t.crewPotHint}</span>
        <span className="ml-auto font-mono text-sm font-bold text-amber-300 tabular-nums">
          {formatCompact(dataQuery.data?.pot ?? 0)}¢
        </span>
      </div>

      {/* Jobs */}
      {dataQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-gray-900/70" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {dataQuery.data!.jobs.map((j) => {
            const onCd = j.cooldownEndAt != null && j.cooldownEndAt > now;
            const active = selectedJob === j.key;
            return (
              <div
                key={j.key}
                className={`rounded-xl border p-3 flex flex-col gap-2 ${
                  active ? "border-amber-400/70 bg-amber-500/10" : "border-gray-800 bg-gray-900/60"
                }`}
              >
                <div>
                  <div className="text-sm font-bold text-gray-100">{crewJobTitle(j.key, locale)}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{crewJobFlavor(j.key, locale)}</div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] text-gray-400">
                  <span className="rounded bg-gray-800/80 px-1.5 py-0.5">
                    {t.crewReqTiers.replace("{n}", String(j.minCrewTiers))}
                  </span>
                  {j.requiredFamilies.map((rf) => (
                    <span
                      key={rf.f}
                      className="rounded px-1.5 py-0.5"
                      style={{ background: familyStyle(rf.f).fill + "33" }}
                    >
                      {t.crewReqFamily
                        .replace("{n}", String(rf.min))
                        .replace("{family}", professionName(FAMILY_KEYS[rf.f], locale))}
                    </span>
                  ))}
                </div>
                <div className="mt-auto flex items-center gap-2">
                  <span className="font-mono text-xs text-amber-300">
                    {t.crewBasePayout.replace("{n}", formatCompact(j.basePayout))}
                  </span>
                  <span className="text-[11px] text-gray-600">
                    {t.crewFee.replace("{n}", formatCompact(j.fee))}
                  </span>
                  <Button
                    size="sm"
                    disabled={onCd || (!!selectedJob && !active)}
                    onClick={() => {
                      play("click");
                      setSelectedJob(active ? null : j.key);
                      setCrew([]);
                    }}
                    className="ml-auto h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold"
                  >
                    {onCd
                      ? t.crewCooldown.replace(
                          "{time}",
                          (() => {
                            const m = Math.ceil(((j.cooldownEndAt ?? 0) - now) / 60000);
                            return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
                          })()
                        )
                      : active
                        ? t.crewDeselect
                        : t.crewPlanHeist}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Crew picker */}
      {job && (
        <section className="rounded-xl border border-amber-500/30 bg-gray-900/60 p-3">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span className="text-sm font-bold text-gray-100">{t.crewPickTitle}</span>
            <span className="font-mono text-xs text-gray-400">
              {crew.length}/5 · {t.crewTierSum.replace("{n}", String(crewTierSum))}
              {job ? ` / ${job.minCrewTiers}` : ""}
            </span>
            <Button
              size="sm"
              disabled={crew.length !== 5 || runMutation.isPending}
              onClick={() => runMutation.mutate()}
              className="ml-auto h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              {runMutation.isPending ? t.crewRunning : t.crewRunHeist}
            </Button>
          </div>
          {roster.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">{t.crewRosterEmpty}</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 max-h-64 overflow-y-auto pr-1">
              {roster.map((card) => {
                const chosen = crew.includes(card.id);
                const fam = familyStyle(card.f);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => toggleCrew(card.id)}
                    aria-pressed={chosen}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                      chosen ? "border-amber-400/70 bg-amber-500/15" : "border-gray-800 bg-gray-950/60 hover:border-gray-600"
                    }`}
                  >
                    <span
                      className="inline-block h-4 w-4 rounded-[3px] shrink-0"
                      style={{ background: fam.fill }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-gray-200">{card.u}</span>
                      <span className="block text-[10px] text-gray-500">
                        {t.crewCardTier.replace("{n}", String(card.t))}
                        {card.p ? " · 🔒" : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* History */}
      {(dataQuery.data?.runs.length ?? 0) > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-100 mb-2">{t.crewHistory}</h2>
          <ul className="space-y-1.5">
            {dataQuery.data!.runs.slice(0, 8).map((r, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-sm">
                <span className="text-gray-300 truncate">{crewJobTitle(r.jobKey, locale)}</span>
                <span
                  className={`text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded ${
                    r.outcome === "perfect"
                      ? "bg-amber-500/20 text-amber-300"
                      : r.outcome === "clean"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : r.outcome === "partial"
                          ? "bg-gray-700 text-gray-300"
                          : "bg-red-500/15 text-red-300"
                  }`}
                >
                  {t[OUTCOME_KEY[r.outcome] ?? "crewOutcomeFail"]}
                </span>
                <span className="ml-auto font-mono text-xs text-amber-300 tabular-nums">
                  {r.payout > 0 ? `+${formatCompact(r.payout)}¢` : `−${formatCompact(r.fee)}¢`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reveal && <CrewRevealModal jobKey={reveal.jobKey} result={reveal.result} onClose={() => setReveal(null)} />}
    </div>
  );
}

function CrewRevealModal({
  jobKey,
  result,
  onClose,
}: {
  jobKey: string;
  result: RunResult;
  onClose: () => void;
}) {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const [revealed, setRevealed] = useState(0);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setRevealed(result.steps.length);
      return;
    }
    setRevealed(0);
    const timers = result.steps.map((s, i) =>
      setTimeout(() => {
        setRevealed(i + 1);
        play(s.success ? "reward" : "error");
      }, 650 * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const done = revealed >= result.steps.length;
  const mult = OUTCOME_MULTIPLIER[result.outcome as keyof typeof OUTCOME_MULTIPLIER] ?? 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={crewJobTitle(jobKey, locale)}
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-gray-950 p-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-black tracking-[0.25em] text-amber-400">
            {crewJobTitle(jobKey, locale).toUpperCase()}
          </span>
          <button type="button" onClick={onClose} aria-label={t.cancel} className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 mb-5 mt-4">
          {result.steps.map((s, i) => {
            const isRevealed = i < revealed;
            return (
              <div
                key={i}
                className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all duration-300 ${
                  !isRevealed
                    ? "border-gray-800 bg-gray-900/60 text-gray-500"
                    : s.success
                      ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/50 bg-red-500/10 text-red-300"
                }`}
              >
                <span className="text-xs font-mono tracking-widest">{t.crewStep.replace("{n}", String(i + 1))}</span>
                {!isRevealed ? (
                  <span className="text-xs font-semibold animate-pulse">{t.raidRevealDrilling}</span>
                ) : (
                  <span className="font-mono text-xs">
                    {s.crewPower} {s.success ? "≥" : "<"} {s.needed}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {done && (
          <div className="border-t border-gray-800 pt-4 space-y-2 text-center">
            <div className="text-lg font-black text-amber-300">{t[OUTCOME_KEY[result.outcome] ?? "crewOutcomeFail"]}</div>
            <div className="font-mono text-sm text-gray-300">
              {result.payout > 0 ? `+${formatCompact(result.payout)}¢` : t.crewFailNoPay}
              <span className="text-gray-600"> · ×{mult}</span>
            </div>
        <Button onClick={onClose} className="w-full mt-2 bg-amber-500 hover:bg-amber-400 text-black font-bold">
          {t.raidClose}
        </Button>
          </div>
        )}
      </div>
    </div>
  );
}

