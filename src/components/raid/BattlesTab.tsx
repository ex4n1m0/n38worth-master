"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Swords, Trophy, Shield, X } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { useNow } from "@/hooks/useNow";
import { toast } from "@/lib/event-feed";
import { formatCompact } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BANDS, type BattleCard } from "@/lib/crew-battle";
import { familyStyle } from "@/lib/city/map2d/palette";

/**
 * Crew Battles tab (/raid) — save a 5-card defense lineup, attack other
 * players' ghost lineups in your band, watch the deterministic replay.
 * Server resolves everything (seeded sim); this only animates the log.
 */

interface BattlesView {
  myLineup: { cards: BattleCard[]; band: number; updatedAt: string } | null;
  myRecord: { wins: number; losses: number; streak: number; rating: number };
  targets: { userId: number; username: string; rating: number; wins: number; losses: number; cards: BattleCard[] }[];
  recent: { id: number; opponent: string; won: boolean; prize: number; createdAt: string; direction: "out" | "in" }[];
  ladder: { username: string; rating: number; wins: number; losses: number }[];
  pot: number;
  cooldownEndAt: number | null;
}

interface RosterData {
  roster: { id: number; u: string; f: number; t: number; p: string | null }[];
}

interface AttackBattle {
  id: number;
  won: boolean;
  rounds: number;
  prize: number;
  log: { kind: string; side?: string; unit?: string; target?: string; dmg?: number; hpAfter?: number; amount?: number; n?: number }[];
  units: { id: number; u: string; f: number; t: number; side: "A" | "D"; hp: number; maxHp: number }[];
  attackerRating: number;
  defenderRating: number;
}

export function BattlesTab() {
  const { t } = useLanguage();
  const { play } = useSound();
  const queryClient = useQueryClient();
  const now = useNow();
  const [editing, setEditing] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);
  const [replay, setReplay] = useState<AttackBattle | null>(null);

  const viewQuery = useQuery<BattlesView>({
    queryKey: ["crew-battles"],
    queryFn: async () => {
      const res = await fetch("/api/game/crew-battles");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 120_000,
  });

  // Roster comes from the crew-jobs endpoint (same react-query cache as the
  // Crew tab — one fetch, two tabs).
  const rosterQuery = useQuery<RosterData>({
    queryKey: ["crew-jobs"],
    queryFn: async () => {
      const res = await fetch("/api/game/crew-jobs");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });

  const act = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/game/crew-battles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crew-battles"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (error: Error) => {
      play("error");
      toast.error(error.message);
    },
  });

  const view = viewQuery.data;
  const roster = useMemo(() => rosterQuery.data?.roster ?? [], [rosterQuery.data]);
  const rosterById = useMemo(() => new Map(roster.map((c) => [c.id, c])), [roster]);
  const onCooldown = !!view?.cooldownEndAt && view.cooldownEndAt > now;
  const band = view?.myLineup?.band != null ? BANDS[view.myLineup.band] : null;
  const picksTierSum = picks.reduce((s, id) => s + (rosterById.get(id)?.t ?? 0), 0);

  const togglePick = (id: number) => {
    play("click");
    setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < 5 ? [...p, id] : p));
  };

  return (
    <div className="space-y-6">
      {/* Record + pot */}
      <div className="rounded-xl border border-rose-500/30 bg-gray-900/60 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Swords className="h-4 w-4 text-rose-400" aria-hidden="true" />
        <span className="text-sm font-bold text-rose-200">{t.battlesTitle}</span>
        {view && (
          <span className="font-mono text-xs text-gray-400">
            {view.myRecord.wins}W–{view.myRecord.losses}L · {t.battlesRating.replace("{n}", String(view.myRecord.rating))}
            {view.myRecord.streak !== 0
              ? ` · ${view.myRecord.streak > 0 ? t.battlesStreakWin : t.battlesStreakLoss}`.replace("{n}", String(Math.abs(view.myRecord.streak)))
              : ""}
          </span>
        )}
        <span className="ml-auto font-mono text-xs text-amber-300">{t.crewPotTitle}: {formatCompact(view?.pot ?? 0)}¢</span>
      </div>

      {/* Lineup */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Shield className="h-4 w-4 text-rose-400" aria-hidden="true" />
          <span className="text-sm font-bold text-gray-100">{t.battlesLineupTitle}</span>
          {band && (
            <span className="text-[11px] text-gray-500">
              {t.battlesBand.replace("{i}", String(band.index + 1)).replace("{fee}", formatCompact(band.fee))}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs"
            onClick={() => {
              play("click");
              setEditing((e) => !e);
              setPicks(view?.myLineup?.cards.map((c) => c.id) ?? []);
            }}
          >
            {editing ? t.cancel : t.battlesEditLineup}
          </Button>
        </div>
        <div className="grid grid-cols-5 gap-1.5 mb-2">
          {(view?.myLineup?.cards ?? Array.from({ length: 5 }, (_, i) => null)).map((card, i) =>
            card ? (
              <div key={card.id} className="rounded-lg border border-gray-700 bg-gray-950/60 px-2 py-1.5 text-center">
                <span className="mx-auto mb-1 block h-3 w-3 rounded-[3px]" style={{ background: familyStyle(card.f).fill }} />
                <span className="block truncate text-[11px] font-semibold text-gray-200">{card.u}</span>
                <span className="block text-[10px] text-gray-500">T{card.t}</span>
              </div>
            ) : (
              <div key={i} className="rounded-lg border border-dashed border-gray-800 bg-gray-950/40 h-14" />
            )
          )}
        </div>
        {editing && (
          <>
            <div className="flex items-center gap-2 mb-2 text-xs text-gray-400">
              <span className="font-mono">
                {picks.length}/5 · {t.crewTierSum.replace("{n}", String(picksTierSum))}
              </span>
              <Button
                size="sm"
                disabled={picks.length !== 5 || act.isPending}
                onClick={() =>
                  act.mutate(
                    { action: "lineup", cardIds: picks },
                    {
                      onSuccess: () => {
                        play("reward");
                        toast.success(t.battlesLineupSaved);
                        setEditing(false);
                      },
                    }
                  )
                }
                className="ml-auto h-7 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold"
              >
                {t.battlesSaveLineup}
              </Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {roster.map((card) => {
                const chosen = picks.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => togglePick(card.id)}
                    aria-pressed={chosen}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${
                      chosen ? "border-rose-400/70 bg-rose-500/15" : "border-gray-800 bg-gray-950/60 hover:border-gray-600"
                    }`}
                  >
                    <span className="inline-block h-4 w-4 rounded-[3px] shrink-0" style={{ background: familyStyle(card.f).fill }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-gray-200">{card.u}</span>
                      <span className="block text-[10px] text-gray-500">T{card.t}{card.p ? " · 🔒" : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Targets */}
      <section>
        <h2 className="text-base font-bold text-gray-100 mb-2">{t.battlesTargets}</h2>
        {!view?.myLineup ? (
          <p className="text-sm text-gray-500 py-2">{t.battlesNeedLineup}</p>
        ) : (view.targets.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 py-2">{t.battlesNoTargets}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {view.targets.map((target) => (
              <div key={target.userId} className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-gray-100 truncate">{target.username}</span>
                  <span className="ml-auto font-mono text-[11px] text-gray-500">
                    {target.wins}W–{target.losses}L · {target.rating}
                  </span>
                </div>
                <div className="flex gap-1 mb-2">
                  {target.cards.slice(0, 5).map((c) => (
                    <span
                      key={c.id}
                      title={c.u}
                      className="h-5 w-5 rounded-[3px] shrink-0"
                      style={{ background: familyStyle(c.f).fill, opacity: 0.4 + (c.t / 14) * 0.6 }}
                    />
                  ))}
                </div>
                <Button
                  size="sm"
                  disabled={act.isPending || onCooldown}
                  onClick={() =>
                    act.mutate(
                      { action: "attack", targetUserId: target.userId },
                      {
                        onSuccess: (data: { battle: AttackBattle }) => {
                          setReplay(data.battle);
                          play(data.battle.won ? "reward" : "error");
                        },
                      }
                    )
                  }
                  className="w-full h-7 text-xs bg-rose-600 hover:bg-rose-500 text-white font-bold"
                >
                  {onCooldown ? t.battlesCooldown : t.battlesAttack.replace("{fee}", formatCompact(band?.fee ?? 0))}
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ladder + recent */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section>
          <h2 className="flex items-center gap-2 text-base font-bold text-gray-100 mb-2">
            <Trophy className="h-4 w-4 text-amber-400" aria-hidden="true" />
            {t.battlesLadder}
          </h2>
          {(view?.ladder.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">{t.battlesLadderEmpty}</p>
          ) : (
            <ol className="space-y-1">
              {view!.ladder.map((row, i) => (
                <li key={row.username} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-sm">
                  <span className="font-mono text-xs text-gray-600 w-4">{i + 1}</span>
                  <span className="text-gray-200 truncate">{row.username}</span>
                  <span className="ml-auto font-mono text-xs text-gray-500">
                    {row.wins}W–{row.losses}L · <span className="text-amber-300">{row.rating}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section>
          <h2 className="text-base font-bold text-gray-100 mb-2">{t.battlesRecent}</h2>
          {(view?.recent.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">{t.battlesLadderEmpty}</p>
          ) : (
            <ul className="space-y-1">
              {view!.recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 text-sm">
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${r.won ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
                    {r.direction === "out"
                      ? r.won
                        ? t.battlesBadgeWin
                        : t.battlesBadgeLoss
                      : r.won
                        ? t.battlesBadgeDefended
                        : t.battlesBadgeRaided}
                  </span>
                  <span className="text-gray-300 truncate">{r.opponent}</span>
                  <span className="ml-auto font-mono text-xs text-amber-300 tabular-nums">
                    {r.prize > 0 ? `+${formatCompact(r.prize)}¢` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {replay && <BattleReplayModal battle={replay} onClose={() => setReplay(null)} />}
    </div>
  );
}

function BattleReplayModal({ battle, onClose }: { battle: AttackBattle; onClose: () => void }) {
  const { t } = useLanguage();
  const { play } = useSound();
  const [shown, setShown] = useState(0);
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const actions = useMemo(() => battle.log.filter((l) => l.kind !== "round"), [battle.log]);

  useEffect(() => {
    if (reduced) {
      setShown(actions.length);
      return;
    }
    setShown(0);
    const timer = setInterval(() => {
      setShown((s) => {
        if (s >= actions.length) {
          clearInterval(timer);
          return s;
        }
        play("click");
        return s + 1;
      });
    }, 220);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle]);

  const done = shown >= actions.length;
  const visibleActions = actions.slice(0, shown);

  // Reconstruct current HP by replaying the visible prefix of the log.
  const hp = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of battle.units) m.set(u.u, u.maxHp);
    for (const a of visibleActions) {
      if ((a.kind === "hit" || a.kind === "crit") && a.target) m.set(a.target, a.hpAfter ?? 0);
    }
    return m;
  }, [battle.units, visibleActions]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.battlesTitle}
    >
      <div className="w-full max-w-lg rounded-2xl border border-rose-500/30 bg-gray-950 p-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-black tracking-[0.25em] text-rose-400">
            {t.battlesTitle.toUpperCase()}
          </span>
          <button type="button" onClick={onClose} aria-label={t.cancel} className="text-gray-500 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 5v5 unit bars */}
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {battle.units
            .filter((u) => u.side === "A")
            .map((u) => (
              <UnitBar key={`a${u.id}`} name={u.u} color={familyStyle(u.f).fill} hp={hp.get(u.u) ?? 0} maxHp={u.maxHp} />
            ))}
        </div>
        <div className="text-center text-[10px] font-black tracking-widest text-gray-600 my-1">{t.battlesVs}</div>
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {battle.units
            .filter((u) => u.side === "D")
            .map((u) => (
              <UnitBar key={`d${u.id}`} name={u.u} color={familyStyle(u.f).fill} hp={hp.get(u.u) ?? 0} maxHp={u.maxHp} />
            ))}
        </div>

        {/* Log feed */}
        <div className="h-28 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900/60 p-2 space-y-0.5 text-[11px] font-mono">
          {visibleActions.length === 0 && !done && <p className="text-gray-600">{t.crewRunning}</p>}
          {visibleActions.map((a, i) => (
            <p key={i} className={a.side === "A" ? "text-cyan-300" : "text-rose-300"}>
              {a.kind === "heal"
                ? `+${a.amount} ${a.side === "A" ? "⟲" : "⟲"}`
                : `${a.unit} ${a.kind === "crit" ? "💥" : "→"} ${a.target} −${a.dmg} (${a.hpAfter})`}
            </p>
          ))}
        </div>

        {done && (
          <div className="mt-3 border-t border-gray-800 pt-3 text-center space-y-1">
            <div className={`text-lg font-black ${battle.won ? "text-emerald-300" : "text-red-300"}`}>
              {battle.won ? t.battlesVictory : t.battlesDefeat}
            </div>
            <div className="font-mono text-xs text-gray-400">
              {battle.prize > 0 ? `+${formatCompact(battle.prize)}¢` : "—"} · {t.battlesRating.replace("{n}", String(battle.attackerRating))}
            </div>
            <Button onClick={onClose} className="w-full mt-2 bg-rose-600 hover:bg-rose-500 text-white font-bold">
              {t.raidClose}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function UnitBar({ name, color, hp, maxHp }: { name: string; color: string; hp: number; maxHp: number }) {
  const pct = Math.max(0, Math.round((hp / maxHp) * 100));
  return (
    <div className={`rounded-lg border px-1 py-1 text-center transition-opacity ${hp > 0 ? "border-gray-700" : "border-gray-800 opacity-40"}`}>
      <span className="mx-auto mb-1 block h-3 w-3 rounded-[3px]" style={{ background: color }} />
      <span className="block truncate text-[10px] font-semibold text-gray-300">{name}</span>
      <div className="mt-1 h-1.5 w-full rounded-full bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${pct > 50 ? "bg-emerald-400" : pct > 20 ? "bg-amber-400" : "bg-red-400"}`}
          style={{ width: `${pct}%`, transition: "width 180ms linear" }}
        />
      </div>
    </div>
  );
}
