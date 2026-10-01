"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Vault } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";
import { toast } from "@/lib/event-feed";
import { useSound } from "@/hooks/useSound";
import { useLanguage } from "@/components/LanguageContext";
import { formatCompact } from "@/lib/utils";

/**
 * The World Vault — always-on server-wide progress bar (GAME_INTEGRATION_
 * STUDY.md §5G, lean v1). Every acquire/renovate/raid cracks it; a break
 * pays every contributor and re-arms at a higher goal. Live updates via the
 * game-global `vault-broken` Pusher event + a 60s poll.
 */
export function WorldVaultBar() {
  const { t } = useLanguage();
  const { play } = useSound();
  const queryClient = useQueryClient();

  const vaultQuery = useQuery({
    queryKey: ["world-vault"],
    queryFn: async () => {
      const res = await fetch("/api/game/world-vault");
      if (!res.ok) throw new Error("vault status failed");
      return (await res.json()) as {
        goal: number;
        damage: number;
        progress: number;
        breaks: number;
        contributors: number;
        lastBreakAt: number | null;
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe("game-global");
    const onBroken = (data: { goal: number }) => {
      play("reward");
      toast.success(t.vaultBrokenToast.replace("{goal}", formatCompact(data.goal)));
      queryClient.invalidateQueries({ queryKey: ["world-vault"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
    };
    channel.bind("vault-broken", onBroken);
    return () => {
      // game-global is a SHARED channel (countdown, world-reboot, …) — unbind
      // ONLY our event; never unsubscribe the channel itself.
      channel.unbind("vault-broken", onBroken);
    };
  }, [play, t, queryClient]);

  const v = vaultQuery.data;
  const pct = v ? Math.round(Math.min(1, v.progress) * 100) : 0;

  return (
    <section
      className="rounded-xl border border-amber-500/30 bg-gray-900/60 px-4 py-3"
      aria-label={t.vaultTitle}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Vault className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
        <span className="text-sm font-bold text-amber-200">{t.vaultTitle}</span>
        <span className="text-xs text-gray-500">{t.vaultHint}</span>
        <span className="ml-auto font-mono text-xs text-gray-400 tabular-nums">
          {v ? `${formatCompact(v.damage)} / ${formatCompact(v.goal)}` : "…"}
        </span>
      </div>
      <div
        className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t.vaultTitle}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {v && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 text-[11px] text-gray-500">
          <span>{t.vaultContributors.replace("{n}", String(v.contributors))}</span>
          <span>{t.vaultBreaks.replace("{n}", String(v.breaks))}</span>
        </div>
      )}
    </section>
  );
}
