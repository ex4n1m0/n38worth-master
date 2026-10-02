"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "@/lib/event-feed";
import { Loader2, Shield, Sparkles, ShoppingCart, Wand2, Zap, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCompact, navbarBtnStyle } from "@/lib/utils";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useNow } from "@/hooks/useNow";
import { useSound } from "@/hooks/useSound";
import { professionPerk, professionName } from "@/lib/professions";
import { cardDisplayName } from "@/lib/display-names";
import { useLanguage } from "./LanguageContext";
import type { ComboPlayer, UseProfessionComboSelectionReturn } from "@/hooks/useProfessionComboSelection";
import { RateLimitError, throwIfRateLimited } from "@/lib/action-rate";

interface ProfessionComboBarProps {
  combo: UseProfessionComboSelectionReturn;
}

/** Minimal owned-card shape the bar needs to track combo candidates. */
interface OwnedCard {
  id: number;
  username: string;
  playerValue: number;
  avatarUrl: string | null;
  profession: string;
  playerType?: string | null;
  /** Firewall (sell-block) expiry on the VIEWER's own ownership row — the
   *  exact timestamp the server checks when gating the combo sale. */
  ownBlockSellUntil?: string | null;
}

/**
 * The combo bar as a live puzzle tracker: six profession slots that light up
 * as you own matching cards. Shares the dashboard's ["player", "me"] query
 * cache (actions already invalidate it), so no extra polling is introduced.
 */
export function ProfessionComboBar({ combo }: ProfessionComboBarProps) {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const { ownedIds, isSuccess: ownershipLoaded } = useOwnedPlayerIds();
  const { play } = useSound();
  const { t, locale } = useLanguage();
  const now = useNow();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Owned cards that carry a profession — combo candidates. Mirrors the
  // dashboard's ["player", "me"] query so both observers share one fetch.
  const { data: comboInventory } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 60_000,
    select: (player: {
      profession?: string | null;
      ownedPlayers?: OwnedCard[];
    } | null) => ({
      selfProfession: player?.profession ?? null,
      cards: (player?.ownedPlayers ?? []).filter(
        (p): p is OwnedCard & { profession: string } => !!p.profession
      ),
    }),
  });

  // Most-expensive-first candidates per profession (any card works in a
  // combo, and the 10× payout multiplies combined value, so the priciest
  // card is the auto-fill default; players can swap manually via the card
  // toggles).
  const candidatesByProfession = useMemo(() => {
    const map = new Map<string, OwnedCard[]>();
    for (const card of comboInventory?.cards ?? []) {
      const list = map.get(card.profession) ?? [];
      list.push(card);
      map.set(card.profession, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.playerValue - a.playerValue);
    return map;
  }, [comboInventory?.cards]);

  // Drop any selected players that have been stolen since being added (so a
  // combo can't be attempted with cards the user no longer owns). Runs whenever
  // ownership data refreshes; idempotent, and only after a successful fetch so
  // the initial empty load doesn't wipe a valid selection.
  const { slots, removeUnowned } = combo;

  // FIREWALL countdown: the server rejects the combo sale while ANY selected
  // card's ownership row is firewalled, until the LONGEST of those expiries
  // passes (comboCore step 4). Track the viewer's own expiries and show the
  // wait on the sell button instead of letting players discover it by failing
  // the sell. Ticks on the shared 1s clock; refreshes via the ["player"]
  // invalidation the FIREWALL action already performs.
  const firewallByPlayerId = useMemo(() => {
    const map = new Map<number, number>();
    for (const card of comboInventory?.cards ?? []) {
      const until = card.ownBlockSellUntil
        ? new Date(card.ownBlockSellUntil).getTime()
        : NaN;
      if (Number.isFinite(until) && until > 0) map.set(card.id, until);
    }
    return map;
  }, [comboInventory?.cards]);

  const firewalledMembers = slots.flatMap((slot) => {
    if (!slot.player) return [];
    const until = firewallByPlayerId.get(slot.player.playerId) ?? 0;
    return until > now
      ? [{ profession: slot.profession, player: slot.player, until }]
      : [];
  });
  const firewallExpiresAt = firewalledMembers.reduce((max, m) => Math.max(max, m.until), 0);
  const firewallMsLeft = firewallExpiresAt - now;
  const comboLocked = combo.isComplete && firewallMsLeft > 0;
  const firewallTitle = firewalledMembers.length
    ? t.comboFirewallTitle.replace(
        "{list}",
        firewalledMembers
          .map(
            (m) =>
              `${cardDisplayName(m.player.username, locale)} — ${formatFirewallWait(m.until - now)}`
          )
          .join(", ")
      )
    : undefined;
useEffect(() => {
    if (!ownershipLoaded) return;
    const stolen = slots
      .map((s) => s.player)
      .filter((p): p is ComboPlayer => !!p && !ownedIds.has(p.playerId));
    if (stolen.length === 0) return;
    removeUnowned(ownedIds);
    const names = stolen.map((p) => p.username).join(", ");
    toast.warning(
      stolen.length === 1
        ? t.comboStolenOne.replace("{names}", names)
        : t.comboStolenMany
            .replace("{count}", String(stolen.length))
            .replace("{names}", names),
      { duration: 6000 }
    );
  }, [ownedIds, ownershipLoaded, slots, removeUnowned, t]);

  // Celebrate the moment the 6th slot fills — this is the "aha, it's ready"
  // signal that was previously missing entirely.
  const wasComplete = useRef(combo.isComplete);
  useEffect(() => {
    if (combo.isComplete && !wasComplete.current) {
      play("reward");
      toast.success(t.comboComplete, {
        description:
          firewallMsLeft > 0
            ? t.comboCompleteFirewalled.replace("{time}", formatFirewallWait(firewallMsLeft))
            : t.comboCompleteSell.replace("{amount}", formatCompact(combo.reward)),
        duration: 6000,
      });
    }
    wasComplete.current = combo.isComplete;
  }, [combo.isComplete, combo.reward, play, firewallMsLeft, t]);

  const sellMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/sell-profession-combo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerIds: combo.selectedPlayerIds }),
      });
      await throwIfRateLimited(res, t.rateLimitSlowDown);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.comboSellFailed);
      return data;
    },
    onSuccess: async (data) => {
      const humanMsg =
        data.resetPlayerCount > 0
          ? (data.resetPlayerCount > 1 ? t.comboResetMany : t.comboResetOne)
              .replace("{count}", String(data.resetPlayerCount))
          : "";
      const spawnMsg =
        data.createdNpcCount > 0
          ? (data.createdNpcCount > 1 ? t.comboSpawnMany : t.comboSpawnOne)
              .replace("{count}", String(data.createdNpcCount))
          : "";
      const bonusMsg =
        data.firstComboBonus > 0 ? t.comboFirstBonus.replace("{count}", String(data.firstComboBonus)) : "";

      play("win");
      toast.success(t.comboSoldToast.replace("{amount}", formatCompact(data.reward)), {
        description: [humanMsg, spawnMsg, bonusMsg].filter(Boolean).join(". "),
        duration: 8000,
      });

      // Clear selection and refresh all data
      combo.clear();
      setConfirmOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["player"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["missions"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
      ]);
    },
    onError: (err: Error) => {      if (err instanceof RateLimitError) return;

      play("error");
      toast.error(err.message);
    },
  });

  const handleSellClick = () => {
    play("confirm");
    setConfirmOpen(true);
  };

  const handleSell = () => {
    sellMutation.mutate();
  };

  // Fill every empty slot that has an owned candidate (most expensive
  // first — the biggest 10× payout). The button shows whenever ANY empty
  // slot has a candidate, i.e. immediately — no need to tap a tile first.
  // (When the combo is complete there are no empty slots, so it hides.)
  const canAutoFill = slots.some(
    (s) => !s.player && (candidatesByProfession.get(s.profession)?.length ?? 0) > 0
  );
  const handleAutoFill = () => {
    play("toggle");
    for (const slot of slots) {
      if (slot.player) continue;
      const priciest = candidatesByProfession.get(slot.profession)?.[0];
      if (!priciest) continue;
      combo.toggleSelection(
        {
          playerId: priciest.id,
          username: priciest.username,
          playerValue: priciest.playerValue,
          avatarUrl: priciest.avatarUrl,
          isNpc: priciest.playerType === "card" ? 1 : 0,
          valueFloor: 1,
        },
        slot.profession
      );
    }
  };

  // Perks the seller will actually LOSE: a perk survives if the seller IS that
  // profession or owns another card with it besides the six being sold.
  const selectedIds = useMemo(() => new Set(combo.selectedPlayerIds), [combo.selectedPlayerIds]);
  const lostPerks = useMemo(() => {
    if (!combo.isComplete) return [];
    return slots
      .filter((s) => s.player)
      .map((s) => s.profession)
      .filter((profession) => {
        if (comboInventory?.selfProfession === profession) return false;
        const keepsOther = (candidatesByProfession.get(profession) ?? []).some(
          (c) => !selectedIds.has(c.id)
        );
        return !keepsOther;
      });
  }, [combo.isComplete, slots, comboInventory?.selfProfession, candidatesByProfession, selectedIds]);

  const selectedSlots = slots.filter((s) => s.player);

  return (
    <div className="rounded-lg border border-gray-700 bg-transparent px-3 py-2">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 shrink-0 text-sm font-bold text-white uppercase tracking-wide">
            <Sparkles className="h-4 w-4" />
            {t.comboTitle}
            <span className={`font-bold ${combo.isComplete ? "text-amber-300" : "text-white"}`}>
              {combo.selectedCount}/6
            </span>
          </span>

          {/* The six profession slots — the live puzzle tracker. Tiles wrap on
              small screens (3-up on phones). */}
          <div className="flex items-center gap-2 flex-wrap">
            {slots.map((slot) => {
              const priciest = candidatesByProfession.get(slot.profession)?.[0];
              const state: "selected" | "ready" | "missing" = slot.player
                ? "selected"
                : priciest
                  ? "ready"
                  : "missing";
              const slotFirewallUntil = slot.player
                ? firewallByPlayerId.get(slot.player.playerId) ?? 0
                : 0;
              const slotFirewalled = slotFirewallUntil > now;
              const title =
                state === "selected"
                  ? `${cardDisplayName(slot.player!.username, locale)} · ${formatCompact(slot.player!.playerValue)}¢${
                      slotFirewalled
                        ? ` — ${t.comboSlotFirewalled.replace("{time}", formatFirewallWait(slotFirewallUntil - now))}`
                        : ""
                    } — ${t.comboClickToRemove}`
                  : state === "ready"
                    ? t.comboSlotReadyTitle
                        .replace("{name}", priciest!.username)
                        .replace("{value}", formatCompact(priciest!.playerValue))
                        .replace("{profession}", professionName(slot.profession, locale))
                    : t.comboSlotMissingTitle.replace("{profession}", professionName(slot.profession, locale));
              return (
                <button
                  key={slot.profession}
                  type="button"
                  title={title}
                  aria-label={title}
                  onClick={() => {
                    if (state === "selected") {
                      play("toggle");
                      combo.toggleSelection(slot.player!, slot.profession);
                    } else if (state === "ready") {
                      play("toggle");
                      combo.toggleSelection(
                        {
                          playerId: priciest!.id,
                          username: priciest!.username,
                          playerValue: priciest!.playerValue,
                          avatarUrl: priciest!.avatarUrl,
                          isNpc: priciest!.playerType === "card" ? 1 : 0,
                          valueFloor: 1,
                        },
                        slot.profession
                      );
                    }
                  }}
                  className={`relative h-24 w-24 sm:h-28 sm:w-28 flex-none overflow-hidden rounded-xl border transition-all ${
                    state === "selected"
                      ? "border-amber-400 ring-2 ring-amber-400/60"
                      : state === "ready"
                        ? "border-t1-500/70 ring-1 ring-t1-500/40 hover:ring-t1-400 hover:scale-105"
                        : "border-gray-700 cursor-default"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={slot.player?.avatarUrl || slot.imagePath}
                    alt={professionName(slot.profession, locale)}
                    className={`h-full w-full object-cover ${
                      state === "missing" ? "opacity-30 grayscale" : "opacity-90"
                    }`}
                  />
                  {state === "ready" && (
                    <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full bg-t1-400 shadow-[0_0_8px_var(--t1-400)]" />
                  )}
                  {state === "selected" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
                        ✓
                      </span>
                    </span>
                  )}
                  {state === "selected" && slotFirewalled && (
                    <span
                      className="absolute bottom-1 left-1 flex h-6 w-6 items-center justify-center rounded-full bg-cyan-600 text-white shadow"
                      title={t.comboSlotFirewallBadge}
                    >
                      <Shield className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <p className="text-xs font-medium leading-tight text-white flex-1 min-w-0 sm:min-w-[220px]">
            {t.comboBarHintPrefix}{" "}
            <span className="font-bold text-white">{t.comboBarHintHighlight}</span>{" "}
            {t.comboBarHintSuffix}
          </p>

          <div className="flex items-center gap-2">
            {canAutoFill && (
              <Button
                onClick={handleAutoFill}
                size="sm"
                variant="outline"
                title={t.comboAutoFillTitle}
                className="h-auto rounded-xl border-t1-500/50 bg-t1-500/10 px-6 py-4 text-lg font-bold text-t1-300 hover:bg-t1-500/20 hover:text-t1-200"
              >
                <Wand2 className="mr-2 h-5 w-5" />
                {t.comboAutoFill}
              </Button>
            )}

            {comboLocked && (
              <Button
                disabled
                title={firewallTitle}
                className="h-auto shrink-0 rounded-xl border border-cyan-500/50 bg-cyan-950/40 px-6 py-4 font-bold text-lg sm:text-xl tracking-wide text-cyan-300"
              >
                <Shield className="h-5 w-5 mr-2" />
                {t.comboSellUnlocksIn.replace("{time}", formatFirewallWait(firewallMsLeft))}
              </Button>
            )}

            {combo.isComplete && !comboLocked && (
              <Button
                onClick={handleSellClick}
                disabled={sellMutation.isPending}
                className="relative overflow-hidden shrink-0 px-6 py-4 h-auto rounded-xl font-bold text-lg sm:text-xl tracking-wide text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  ...navbarBtnStyle,
                  background:
                    "linear-gradient(135deg, rgba(245,158,11,0.4) 0%, rgba(180,83,9,0.4) 50%, rgba(245,158,11,0.4) 100%)",
                }}
              >
                {sellMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                ) : (
                  <ShoppingCart className="h-5 w-5 mr-2" />
                )}
                {t.comboSellButton} = {formatCompact(combo.reward)}¢
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Sell confirmation — spells out the trade-off (perk loss) that was
          previously invisible until after the sale. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-gray-900 border-gray-800">
          <DialogHeader>
            <DialogTitle className="text-white">
              {t.comboConfirmTitle.replace("{amount}", formatCompact(combo.reward))}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-gray-400 text-sm space-y-3">
                <ul className="space-y-1">
                  {selectedSlots.map((s) => (
                    <li key={s.profession} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        <span className="text-white font-medium">
                          {cardDisplayName(s.player!.username, locale)}
                        </span>{" "}
                        <span className="text-gray-500">· {professionName(s.profession, locale)}</span>
                      </span>
                      <span className="font-mono text-t1-400 shrink-0">
                        {formatCompact(s.player!.playerValue)}¢
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between gap-3 border-t border-gray-800 pt-1">
                    <span>{t.comboCombinedValue}</span>
                    <span className="font-mono text-amber-300 font-bold">
                      {formatCompact(combo.reward)}¢
                    </span>
                  </li>
                </ul>

                <div className="space-y-1.5 text-gray-300">
                  <p className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-300 shrink-0" />
                    {t.comboConfirmReset}
                  </p>
                  <p className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-t1-400 shrink-0" />
                    {t.comboConfirmSpawn}
                  </p>
                  <p className="flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-red-400 shrink-0" />
                    {lostPerks.length > 0 ? (
                      <span>
                        {t.comboPerksLostPrefix}{" "}
                        {lostPerks
                          .map((p) => {
                            const perk = professionPerk(p, locale);
                            return `${perk?.name ?? p} (${
                              perk?.description ?? ""
                            })`;
                          })
                          .join(" · ")}
                      </span>
                    ) : (
                      t.comboKeepPerks
                    )}
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              className="border-gray-700 text-gray-300"
            >
              {t.cancel}
            </Button>
            <Button
              onClick={handleSell}
              disabled={sellMutation.isPending}
              className="bg-amber-600 hover:bg-amber-500 text-white font-bold"
            >
              {sellMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t.comboSellButton} = {formatCompact(combo.reward)}¢
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Live remaining-firewall wait. FIREWALL adds 1h per press (12h cap), so
 *  format as "Hh MMm" over an hour, ticking "MM:SS" below it. */
export function formatFirewallWait(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
