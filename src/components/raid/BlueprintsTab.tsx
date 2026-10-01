"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Repeat2 } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useSound } from "@/hooks/useSound";
import { toast } from "@/lib/event-feed";
import { Button } from "@/components/ui/button";
import {
  ALBUMS,
  BLUEPRINTS,
  RARITY_LABEL,
  blueprintName,
  type BlueprintCategory,
} from "@/lib/blueprints";

/**
 * Blueprints tab (/raid) — albums, duplicates, escrowed trades. Pure
 * display of server state; every mutation goes through the API.
 */

interface BlueprintView {
  inventory: { id: string; count: number }[];
  albums: { id: BlueprintCategory; total: number; owned: number; complete: boolean }[];
  duplicates: { id: string; count: number }[];
  tradesOut: { id: number; toUsername: string; offerBp: string; requestBp: string; status: string; expiresAt: string }[];
  tradesIn: { id: number; fromUsername: string; offerBp: string; requestBp: string; requestBp2?: never; expiresAt: string }[];
}

const RARITY_COLOR: Record<string, string> = {
  common: "#B9B3A8",
  rare: "#7FA8C9",
  epic: "#A893C9",
  legendary: "#F5C518",
};

export function BlueprintsTab() {
  const { t, locale } = useLanguage();
  const { play } = useSound();
  const queryClient = useQueryClient();
  const [toUsername, setToUsername] = useState("");
  const [offerBp, setOfferBp] = useState("");
  const [requestBp, setRequestBp] = useState("");

  const viewQuery = useQuery<BlueprintView>({
    queryKey: ["blueprints"],
    queryFn: async () => {
      const res = await fetch("/api/game/blueprints");
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    staleTime: 30_000,
    refetchInterval: 180_000,
  });

  const act = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/game/blueprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blueprints"] });
    },
    onError: (error: Error) => {
      play("error");
      toast.error(error.message);
    },
  });

  const view = viewQuery.data;
  const owned = new Map((view?.inventory ?? []).map((i) => [i.id, i.count]));

  return (
    <div className="space-y-6">
      {/* Albums */}
      <section>
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-100 mb-3">
          <Layers className="h-4 w-4 text-amber-400" />
          {t.bpAlbumsTitle}
        </h2>
        <p className="text-xs text-gray-500 mb-3">{t.bpAlbumsHint}</p>
        {viewQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-900/70" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALBUMS.map((album) => {
              const items = BLUEPRINTS.filter((b) => b.category === album.id);
              const stats = view?.albums.find((a) => a.id === album.id);
              const complete = stats?.complete ?? false;
              return (
                <div
                  key={album.id}
                  className={`rounded-xl border p-3 ${
                    complete ? "border-amber-400/60 bg-amber-500/10" : "border-gray-800 bg-gray-900/60"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-gray-100">
                      {locale === "zh" ? album.nameZh : album.nameEn}
                    </span>
                    <span className="font-mono text-xs text-gray-400">
                      {stats?.owned ?? 0}/{stats?.total ?? items.length}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {items.map((b) => {
                      const n = owned.get(b.id) ?? 0;
                      return (
                        <li key={b.id} className="flex items-center gap-2 text-xs">
                          <span
                            className="inline-block h-2 w-2 rounded-full shrink-0"
                            style={{ background: RARITY_COLOR[b.rarity], opacity: n > 0 ? 1 : 0.25 }}
                          />
                          <span className={n > 0 ? "text-gray-200" : "text-gray-600"}>
                            {blueprintName(b.id, locale)}
                          </span>
                          <span className="ml-auto font-mono text-gray-500">
                            {n > 1 ? `×${n}` : n === 1 ? "✓" : "—"}
                          </span>
                          <span className="text-[10px] text-gray-600">
                            {locale === "zh" ? RARITY_LABEL[b.rarity].zh : RARITY_LABEL[b.rarity].en}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <p className={`mt-2 text-[11px] ${complete ? "text-amber-300" : "text-gray-600"}`}>
                    {complete
                      ? `${t.bpPropEarned}: ${locale === "zh" ? album.propNameZh : album.propNameEn}`
                      : t.bpPropLocked}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Trades */}
      <section>
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-100 mb-3">
          <Repeat2 className="h-4 w-4 text-cyan-400" />
          {t.bpTradeTitle}
        </h2>
        <p className="text-xs text-gray-500 mb-3">{t.bpTradeHint}</p>

        {/* Propose */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            value={toUsername}
            onChange={(e) => setToUsername(e.target.value)}
            placeholder={t.bpTradePartner}
            aria-label={t.bpTradePartner}
            className="flex-1 rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none"
          />
          <select
            value={offerBp}
            onChange={(e) => setOfferBp(e.target.value)}
            aria-label={t.bpTradeOffer}
            className="rounded-lg border border-gray-800 bg-gray-950 px-2 py-2 text-sm text-gray-100"
          >
            <option value="">{t.bpTradeOffer}</option>
            {(view?.duplicates ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {blueprintName(d.id, locale)} (×{d.count})
              </option>
            ))}
          </select>
          <select
            value={requestBp}
            onChange={(e) => setRequestBp(e.target.value)}
            aria-label={t.bpTradeRequest}
            className="rounded-lg border border-gray-800 bg-gray-950 px-2 py-2 text-sm text-gray-100"
          >
            <option value="">{t.bpTradeRequest}</option>
            {BLUEPRINTS.map((b) => (
              <option key={b.id} value={b.id}>
                {blueprintName(b.id, locale)}
              </option>
            ))}
          </select>
          <Button
            disabled={act.isPending || !toUsername.trim() || !offerBp || !requestBp}
            onClick={() =>
              act.mutate(
                { action: "propose", toUsername, offerBp, requestBp },
                {
                  onSuccess: () => {
                    play("reward");
                    toast.success(t.bpTradeSent);
                    setToUsername("");
                    setOfferBp("");
                    setRequestBp("");
                  },
                }
              )
            }
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold shrink-0"
          >
            {t.bpTradeSend}
          </Button>
        </div>

        {/* Incoming */}
        {(view?.tradesIn.length ?? 0) > 0 && (
          <ul className="space-y-2 mb-3">
            {view!.tradesIn.map((tr) => (
              <li
                key={tr.id}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/[0.06] px-3 py-2 flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="text-gray-300">
                  <strong>{tr.fromUsername}</strong> {t.bpTradeWantsYour}{" "}
                  <strong>{blueprintName(tr.requestBp, locale)}</strong> →{" "}
                  <strong>{blueprintName(tr.offerBp, locale)}</strong>
                </span>
                <span className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate({ action: "accept", tradeId: tr.id }, { onSuccess: () => { play("reward"); toast.success(t.bpTradeDone); } })
                    }
                    className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
                  >
                    {t.bpTradeAccept}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ action: "decline", tradeId: tr.id })}
                    className="h-7 text-xs text-gray-400"
                  >
                    {t.bpTradeDecline}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Outgoing */}
        {(view?.tradesOut.length ?? 0) > 0 && (
          <ul className="space-y-2">
            {view!.tradesOut.map((tr) => (
              <li
                key={tr.id}
                className="rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-2 flex items-center gap-2 text-sm"
              >
                <span className="text-gray-300">
                  → <strong>{tr.toUsername}</strong>: {t.bpTradeOffering}{" "}
                  <strong>{blueprintName(tr.offerBp, locale)}</strong> {t.bpTradeFor}{" "}
                  <strong>{blueprintName(tr.requestBp, locale)}</strong>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ action: "cancel", tradeId: tr.id })}
                  className="ml-auto h-7 text-xs text-gray-400 hover:text-red-300"
                >
                  {t.bpTradeCancel}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
