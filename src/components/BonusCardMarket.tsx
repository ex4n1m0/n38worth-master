"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, User, ShoppingCart, Loader2, Shield, Clock } from "lucide-react";
import { BlockCountdownBar } from "./BlockCountdownBar";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useCredits } from "@/hooks/useCredits";
import { useKnowledgePower } from "@/hooks/useKnowledgePower";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { formatNumber, formatCompact } from "@/lib/utils";
import { BONUS_CARD_POWERS, BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

// Mass Hire must never target goddesses or bonus cards — those are earned via
// mission progress, not bulk-hired. They're excluded client-side so the loop
// doesn't waste attempts (and inflate the "failed" count) on cards the server
// will reject anyway.
const MASS_HIRE_EXCLUDED = new Set<string>([
  ...GODDESS_USERNAMES,
  ...BONUS_CARD_USERNAMES,
]);

interface BonusCardMarketProps {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  originalValue: number;
  ownerCount: number;
  ownedCount: number;
  ownerName?: string | null;
  ownerValue?: number | null;
  blockSellUntil?: string | null;
  currentUserId: number | null;
  compact?: boolean;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Live partnership countdown — ticks down to the block end every second. */
function PartnershipCountdown({ blockSellUntil }: { blockSellUntil: string | Date }) {
  const endMs = new Date(blockSellUntil).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endMs - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, endMs - Date.now())), 1000);
    return () => clearInterval(id);
  }, [endMs]);
  return <>{formatCountdown(remaining)}</>;
}

function getBonusCardEmoji(username: string): string {
  const emojis: Record<string, string> = {
    "Bonus Own Value": "💰",
    "Bonus Owned Players": "👥",
    "Bonus Player Slot": "➕",
    "Mass Hire": "⚡",
    "Create NPC": "🤖",
    "+10 Player Slots": "🎯",
    "10-Min Knowledge": "👁️",
  };
  return emojis[username] || "🎁";
}

export function BonusCardMarket({
  id,
  username,
  avatarUrl,
  playerValue,
  originalValue,
  ownerCount,
  ownedCount,
  ownerName,
  blockSellUntil,
  compact = false,
}: BonusCardMarketProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { ownedIds } = useOwnedPlayerIds();
  const { play } = useSound();
  const { data: credits } = useCredits();
  // Goddess of Fate (and Creation) creates NPCs for free.
  const { hasFate } = useKnowledgePower();

  const isMassHire = username === "Mass Hire";
  const isCreateNpc = username === "Create NPC";
  const isTenSlots = username === "+10 Player Slots";
  const isTenMinuteKnowledge = username === "10-Min Knowledge";
  const isActionCard = isMassHire || isCreateNpc || isTenSlots || isTenMinuteKnowledge;
  const { data: ownershipLimit } = useQuery({
    queryKey: ["ownership-limit"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ownership-limit");
      if (!res.ok) throw new Error("Failed to fetch ownership limit");
      return res.json() as Promise<{ limit: number; currentOwned: number; canBuyMore: boolean; nextSlotCost: number }>;
    },
    enabled: !!session && isTenSlots,
    staleTime: 30 * 1000,
  });
  // "+10 Player Slots" keeps the slot-upgrade price; Mass Hire is free (and
  // Create NPC is free for Goddess of Fate holders); every other card shows its
  // current global price (playerValue), which doubles on each hire/use.
  const createNpcIsFree = isCreateNpc && hasFate;
  const displayValue = isTenSlots
    ? ownershipLimit?.nextSlotCost ?? originalValue
    : isMassHire || createNpcIsFree
      ? 0
      : playerValue;
  const isOwned = ownerCount > 0 && !!ownerName;
  const isOwnProfile = !isActionCard && session?.user?.name === username;
  // Ownable (passive) bonus cards get a partnership sell-block + extend button,
  // just like goddesses. Action cards (Mass Hire, Create NPC, etc.) never do.
  const isOwnableCard = !isActionCard;
  const isViewerOwner =
    !!session?.user?.name && !!ownerName && session.user.name === ownerName;
  const blockActive = !!blockSellUntil && new Date(blockSellUntil) > new Date();
  const canAffordExtend = (credits ?? 0) >= displayValue;
  const bonusCardAvatarSrc = getAvatarSrc({
    avatarUrl,
    playerId: id,
    playerUsername: username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isBonus: true, // Bonus cards always show real avatars
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: async () => {
      toast.success(
        `You bought ${username}! Next hire costs ${formatNumber(playerValue * 2)}¢ 💰`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
  });

  const massHireMutation = useMutation({
    mutationFn: async () => {
      // Mass Hire is FREE — no fee. Players only pay for the players they hire.
      // Read authoritative credits from the server (the cached value can be
      // stale right after a reward claim, e.g. the demo auto-hire flow).
      let currentCredits = credits ?? 0;
      try {
        const meRes = await fetch("/api/me");
        if (meRes.ok) {
          const me = await meRes.json();
          const fresh = typeof me.credits === "number" ? me.credits : Number(me.credits);
          if (Number.isFinite(fresh)) currentCredits = fresh;
        }
      } catch {
        // fall back to the cached credits value
      }

      const slotRes = await fetch("/api/settings/ownership-limit");
      let slotsRemaining = Infinity;
      if (slotRes.ok) {
        const slotData = await slotRes.json();
        slotsRemaining = Math.max(0, slotData.limit - slotData.currentOwned);
        if (slotsRemaining === 0) {
          throw new Error("You've reached your hire limit. Buy more slots to expand your team!");
        }
      }

      let remainingCredits = currentCredits;
      let hiredCount = 0;
      let spent = 0;
      let failedCount = 0;
      const limit = 100;

      // Hire the globally cheapest players first, across ALL options (owned or
      // ownerless). The pass paginates the cheapest matching players and hires
      // within the remaining budget/slots.
      const runHirePass = async (filter: Record<string, string>) => {
        let page = 1;
        while (true) {
          if (hiredCount >= slotsRemaining) break;
          if (remainingCredits <= 0) break;

          const params = new URLSearchParams({
            page: String(page),
            limit: String(limit),
            sort: "cheapest",
            ...filter,
          });
          const res = await fetch(`/api/players?${params}`);
          if (!res.ok) break;
          const data = await res.json();
          const rawPlayers: Array<{ id: number; username: string; playerValue: number }> =
            data.players || [];

          if (rawPlayers.length === 0) break;

          // Never mass-hire goddesses or bonus cards. Keep the raw page length
          // for pagination so filtering these out doesn't cut the pass short.
          const players = rawPlayers
            .filter((p) => !MASS_HIRE_EXCLUDED.has(p.username))
            .sort((a, b) => a.playerValue - b.playerValue);

          // Whole page was excluded, but later (pricier) pages may still have
          // hireable cards — advance instead of ending the pass.
          if (players.length === 0) {
            if (rawPlayers.length < limit) break;
            page++;
            if (page > 20) break;
            continue;
          }

          if (players[0].playerValue > remainingCredits) break;

          let anyHiredThisPage = false;
          for (const p of players) {
            if (hiredCount >= slotsRemaining) break;
            if (p.playerValue > remainingCredits) break;

            try {
              const buyRes = await fetch("/api/game/purchase", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ targetId: p.id }),
              });
              if (!buyRes.ok) {
                failedCount++;
                continue;
              }
              remainingCredits -= p.playerValue;
              spent += p.playerValue;
              hiredCount++;
              anyHiredThisPage = true;
            } catch {
              failedCount++;
            }
          }

          if (hiredCount >= slotsRemaining) break;
          if (!anyHiredThisPage) break;
          if (rawPlayers.length < limit) break;
          if (remainingCredits <= 0) break;
          page++;
          if (page > 20) break;
        }
      };

      // 1) Cheapest OWNERLESS players first.
      await runHirePass({ noBoss: "true" });
      // 2) Then the cheapest remaining players (already owned by someone else).
      await runHirePass({ hasOwner: "true" });

      return { hiredCount, spent, failedCount };
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: async ({ hiredCount, spent, failedCount }) => {
      if (hiredCount === 0) {
        toast.error("No affordable players available to hire");
      } else {
        toast.success(
          `Mass Hire complete! Hired ${hiredCount} player${hiredCount === 1 ? "" : "s"} for ${formatNumber(spent)}¢` +
            (failedCount > 0 ? ` (${failedCount} failed)` : "")
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["my-players"] }),
      ]);
    },
  });

  const createNpcMutation = useMutation({
    mutationFn: async () => {
      // Goddess of Fate holders create NPCs for free — skip the credit gate.
      const createNpcCost = hasFate ? 0 : playerValue;
      if (!hasFate && (!credits || credits < createNpcCost)) {
        throw new Error(`Need ${formatNumber(createNpcCost)}¢ to create an NPC`);
      }

      const res = await fetch("/api/game/create-npc", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create NPC");
      }
      return data;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      toast.success(`NPC "${data.player?.username}" spawned in the marketplace! 🤖`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
  });

  const buySlotsMutation = useMutation({
    mutationFn: async () => {
      const slotCost = ownershipLimit?.nextSlotCost ?? 1000;
      if (!credits || credits < slotCost) {
        throw new Error(`+10 slots costs ${formatNumber(slotCost)}¢. You don't have enough credits.`);
      }

      const res = await fetch("/api/game/buy-hire-slots", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to buy slots");
      }
      return data;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      toast.success(`+10 slots purchased! New limit: ${data.newLimit}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
  });

  // Extend partnership (+10 min) — owner only. Cost = the card's current value,
  // burned from the economy (mirrors the goddess extend flow).
  const extendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/extend-partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extend partnership");
      return data as { cost: number };
    },
    onSuccess: async (data) => {
      toast.success(`+10 min partnership on ${username}! (-${formatCompact(data.cost)}¢)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExtendClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    extendMutation.mutate();
  };

  const temporaryKnowledgeMutation = useMutation({
    mutationFn: async () => {
      const knowledgeCost = playerValue;
      if (!credits || credits < knowledgeCost) {
        throw new Error(`10-Min Knowledge costs ${formatNumber(knowledgeCost)}¢. You don't have enough credits.`);
      }

      const res = await fetch("/api/game/temporary-knowledge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to activate 10-Min Knowledge");
      }
      return data as { temporaryKnowledgeUntil: string };
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      const expiry = new Date(data.temporaryKnowledgeUntil).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      toast.success(`10-Min Knowledge active until ${expiry} 👁️`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["bonus-cards"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["goddess-powers"] }),
      ]);
    },
  });

  // One-time bootstrap Mass Hire: fires once, right after the daily reward is
  // claimed (LoginReward sets "auto-reward-claimed" + dispatches
  // "auto-daily-claimed"), so a player instantly gets a starter roster. It only
  // runs when a bootstrap hire is PENDING — armed at onboarding completion for
  // new players, or on a fresh demo session. Established players never have the
  // pending flag, so their credits are never auto-spent on login. The pending
  // flag is cleared as soon as it fires, so it happens once per account.
  const autoMassHiredRef = useRef(false);
  useEffect(() => {
    if (!isMassHire) return;

    const tryAutoMassHire = () => {
      if (autoMassHiredRef.current || typeof window === "undefined") return;
      // Only when a bootstrap hire is owed AND the reward has landed this session.
      if (!sessionStorage.getItem("initial-mass-hire-pending")) return;
      if (!sessionStorage.getItem("auto-reward-claimed")) return;
      autoMassHiredRef.current = true;
      sessionStorage.removeItem("initial-mass-hire-pending");
      massHireMutation.mutate();
    };

    // Fire if the reward was already claimed before this card mounted, or when
    // the claim happens afterwards.
    tryAutoMassHire();
    window.addEventListener("auto-daily-claimed", tryAutoMassHire);
    return () => window.removeEventListener("auto-daily-claimed", tryAutoMassHire);
  }, [isMassHire, massHireMutation]);

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isMassHire) {
      play("buttons");
      massHireMutation.mutate();
    } else if (isCreateNpc) {
      play("buttons");
      createNpcMutation.mutate();
    } else if (isTenSlots) {
      play("buttons");
      buySlotsMutation.mutate();
    } else if (isTenMinuteKnowledge) {
      play("buttons");
      temporaryKnowledgeMutation.mutate();
    } else {
      play("hire");
      mutation.mutate();
    }
  };

  const isPending = isMassHire
    ? massHireMutation.isPending
    : isCreateNpc
      ? createNpcMutation.isPending
      : isTenSlots
        ? buySlotsMutation.isPending
        : isTenMinuteKnowledge
          ? temporaryKnowledgeMutation.isPending
          : mutation.isPending;

  return (
    <Card className={`border-purple-800/60 bg-purple-950/30 hover:bg-purple-900/40 transition-all duration-200 group overflow-hidden ${compact ? 'text-xs' : ''}`}>
      <CardContent className="p-0">
        {/* Clean Avatar Section - No overlay */}
        <div className={compact ? 'h-24 sm:h-32' : 'aspect-square'}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bonusCardAvatarSrc}
            alt={username}
            className="w-full h-full object-contain bg-black/30"
          />
        </div>

        {/* Info Section Below Avatar */}
        <div className={compact ? 'p-1.5 sm:p-2 space-y-1 sm:space-y-1.5' : 'p-2 sm:p-4 space-y-2 sm:space-y-3'}>
          {/* Card Name with Emoji */}
          <div className="flex items-center gap-1">
            <span className={compact ? 'text-sm shrink-0' : 'text-base sm:text-xl shrink-0'}>{getBonusCardEmoji(username)}</span>
            <h3 className={compact ? 'font-bold text-white text-[10px] sm:text-xs leading-tight break-words min-w-0' : 'font-bold text-white text-xs sm:text-base leading-tight break-words min-w-0'}>
              {username}
            </h3>
          </div>

          {/* Owner — the card's value is shown only in the action button below. */}
          {!isActionCard && !compact && (
            <div className="grid grid-cols-1 gap-2">
              <div className="bg-gray-800/50 rounded-lg p-2">
                <p className="text-gray-400 text-xs">Owner</p>
                {isOwned ? (
                  <Link
                    href={`/players/${ownerName}`}
                    className="text-yellow-400 font-semibold text-sm truncate hover:text-yellow-300 transition-colors block"
                  >
                    {ownerName}
                  </Link>
                ) : (
                  <p className="text-green-400 font-semibold text-[10px] sm:text-sm">Available</p>
                )}
              </div>
            </div>
          )}

          {/* Power description - hidden in compact mode */}
          {BONUS_CARD_POWERS[username] && !compact && (
            <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-2.5">
              <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider mb-1">Power</p>
              <p className="text-gray-300 text-xs leading-snug">{BONUS_CARD_POWERS[username]}</p>
            </div>
          )}

          {/* Buy Button - hidden when the viewer already owns this card */}
          {session && !isOwnProfile && !isViewerOwner && (isActionCard || !ownedIds.has(id)) && (
            <Button
              onClick={handleBuyClick}
              disabled={isPending}
              className={compact ? 'w-full font-bold py-1 px-2 text-[10px] leading-tight bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg h-auto min-h-[1.75rem]' : 'w-full font-bold py-2 text-[10px] sm:text-sm leading-tight bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg h-auto min-h-[2.5rem]'}
            >
              {isPending ? (
                <Loader2 className={compact ? 'h-3 w-3 animate-spin mr-1' : 'h-4 w-4 animate-spin mr-2'} />
              ) : isActionCard ? (
                <>
                  <ShoppingCart className={compact ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'} />
                  {isMassHire || createNpcIsFree
                    ? (compact ? "Free" : "Use (Free)")
                    : compact ? formatCompact(displayValue) + '¢' : `Use for ${formatCompact(displayValue)}¢`}
                </>
              ) : (
                <>
                  <ShoppingCart className={compact ? 'h-3 w-3 mr-1' : 'h-4 w-4 mr-2'} />
                  {compact ? formatCompact(displayValue) + '¢' : `Hire for ${formatCompact(displayValue)}¢`}
                </>
              )}
            </Button>
          )}

          {/* Partnership sell-block countdown — ownable bonus cards only. */}
          {isOwnableCard && blockActive && blockSellUntil && (
            <div className="flex flex-col items-center gap-1 rounded-md bg-amber-950/50 border border-amber-500/30 py-1.5 px-2">
              <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-amber-400 leading-none tabular-nums">
                <Shield className="h-3 w-3" />
                <PartnershipCountdown blockSellUntil={blockSellUntil} />
              </span>
              <BlockCountdownBar blockSellUntil={blockSellUntil} className="w-[70%]" />
            </div>
          )}

          {/* Extend partnership (+10 min) — owner only. Cost = current value. */}
          {isOwnableCard && isViewerOwner && (
            <Button
              onClick={handleExtendClick}
              disabled={!canAffordExtend || extendMutation.isPending}
              className={`w-full font-bold py-2 px-2 text-[9px] sm:text-[11px] leading-tight h-auto min-h-[2.5rem] ${
                canAffordExtend
                  ? "bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-lg"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {extendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 shrink-0" />
              ) : (
                <Clock className="h-3 w-3 mr-1 shrink-0" />
              )}
              <span className="whitespace-normal break-all text-center leading-tight">+10 min · {formatCompact(displayValue)}¢</span>
            </Button>
          )}

          {/* Info footer - hidden in compact mode */}
          {!isActionCard && !compact && (
            <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
              <span className="flex items-center gap-1">
                <Gift className="h-3 w-3" />
                {ownerCount} owner{ownerCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Owns {ownedCount}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
