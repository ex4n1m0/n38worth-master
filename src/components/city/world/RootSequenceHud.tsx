"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useNow } from "@/hooks/useNow";
import { getPusherClient } from "@/lib/pusher-client";
import {
  rootSequenceFor,
  rootSequenceKey,
  type RootSequenceVisualState,
} from "@/lib/city/root-sequence";
import type { CityScene } from "./scene/CityScene";

/** /api/goddess-countdown payload (public, CDN-cached). */
interface CountdownData {
  active: boolean;
  userId: number;
  username: string | null;
  startedAt: number;
  expiresAt: number;
  remainingSeconds: number;
  durationMinutes: number;
  /** Expired-but-unprocessed hold hint (M1, additive server field). */
  resolving?: boolean;
}

const IDLE_COUNTDOWN: CountdownData = {
  active: false,
  userId: 0,
  username: null,
  startedAt: 0,
  expiresAt: 0,
  remainingSeconds: 0,
  durationMinutes: 60,
};

/**
 * Root Sequence driver (Phase E) — one leaf component so the shared 1s
 * useNow clock never re-renders the world tree, only this chip.
 *
 * Data flow (GAME-SYSTEMS ruling): the sequence state is DERIVED from the
 * authoritative countdown only — shared ["goddess-countdown"] query (same
 * cache as the navbar countdown) + `game-global` Pusher events that
 * invalidate it. `rootSequenceEligible` is never consulted here; a city
 * shows the sequence only while the SERVER countdown is active and owned by
 * THIS city's owner. Acquisition/loss/interrupt/reconnect/refresh all
 * collapse into "mirror the payload": no client-side win timer exists.
 *
 * Pusher hygiene: binds with PRECISION unbinds (event + handler) on cleanup
 * — game-global is shared with WorldRebootingOverlay/GoddessCountdown, and
 * unbind_all()/unsubscribe() here would sever THEIR handlers.
 *
 * Dev-only visual fixture: NEXT_PUBLIC_CITY_ROOT_FX=<0..1> (development
 * builds only) synthesizes an active countdown at that progress for the
 * viewed city — screenshot/QA aid for stir/surge/brink states without
 * touching the shared production game settings.
 */
export function RootSequenceHud({
  ownerUsername,
  sceneRef,
  sceneEpoch,
}: {
  ownerUsername: string;
  sceneRef: RefObject<CityScene | null>;
  /** Bumped by CityWorld when the scene (re)mounts — re-push current state. */
  sceneEpoch: number;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const countdownQuery = useQuery<CountdownData>({
    queryKey: ["goddess-countdown"],
    queryFn: async () => {
      const res = await fetch("/api/goddess-countdown");
      if (!res.ok) return IDLE_COUNTDOWN;
      return res.json();
    },
    // CDN caches the route for 10s; 30s polling is the freshness floor for
    // a minutes-scale sequence (Pusher events cover the instant edges).
    refetchInterval: 30_000,
    staleTime: 5_000,
  });

  // game-global mirrors the countdown. M3: the events are AUTHORITATIVE —
  // seed the shared query cache from the event payload (start events carry
  // startedAt/expiresAt) / set it idle on cancel+win, instead of waiting on
  // a refetch that may hit a up-to-40s-stale CDN copy. A refetch still
  // follows to converge on the server view. M4: the city projection's
  // landmark flags lag the same edges — invalidate ["city", username] too.
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe("game-global");
    const refetchAll = () => {
      void queryClient.invalidateQueries({ queryKey: ["goddess-countdown"] });
      void queryClient.invalidateQueries({ queryKey: ["city", ownerUsername] });
    };
    const onStarted = (payload: {
      username?: string;
      userId?: number;
      durationMinutes?: number;
      startedAt?: number;
      expiresAt?: number;
    }) => {
      if (
        typeof payload.startedAt === "number" &&
        typeof payload.expiresAt === "number" &&
        payload.expiresAt > payload.startedAt
      ) {
        const now = Math.floor(Date.now() / 1000);
        queryClient.setQueryData<CountdownData>(["goddess-countdown"], {
          active: true,
          userId: payload.userId ?? 0,
          username: payload.username ?? null,
          startedAt: payload.startedAt,
          expiresAt: payload.expiresAt,
          remainingSeconds: Math.max(0, payload.expiresAt - now),
          durationMinutes: payload.durationMinutes ?? 60,
          resolving: false,
        });
      }
      refetchAll();
    };
    const onIdle = () => {
      queryClient.setQueryData<CountdownData>(["goddess-countdown"], {
        ...IDLE_COUNTDOWN,
      });
      refetchAll();
    };
    channel.bind("countdown-started", onStarted);
    channel.bind("countdown-cancelled", onIdle);
    channel.bind("game-won", onIdle);
    return () => {
      channel.unbind("countdown-started", onStarted);
      channel.unbind("countdown-cancelled", onIdle);
      channel.unbind("game-won", onIdle);
      // No unbind_all()/unsubscribe: shared channel (see header comment).
    };
  }, [queryClient, ownerUsername]);

  const nowSec = Math.floor(useNow() / 1000);

  const countdown = countdownQuery.data ?? null;

  // Dev-only fixture branch (documented in the header). Production builds
  // inline "1"/"0" never matching the numeric window — dead code there.
  const devFixture = deriveDevFixture(nowSec, ownerUsername);

  const state = useMemo<RootSequenceVisualState>(() => {
    if (devFixture) {
      return rootSequenceFor(devFixture, ownerUsername, nowSec);
    }
    return rootSequenceFor(countdown, ownerUsername, nowSec);
  }, [devFixture, countdown, ownerUsername, nowSec]);

  const key = rootSequenceKey(state);
  // Key + epoch of the last SUCCESSFUL scene push. A push made while
  // sceneRef.current was still null (the Pixi scene creates asynchronously)
  // must NOT record the key — otherwise the re-push after scene-ready is
  // swallowed and the sequence visuals never mount (Phase E bug: chip
  // rendered, canvas stayed identical to idle). The epoch part re-pushes the
  // current state into each FRESH scene instance after a remount.
  const lastPushed = useRef<{ key: string; epoch: number } | null>(null);

  // Push to the imperative scene ONLY when the rendered visuals change.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return; // not ready yet — leave the key unrecorded
    if (
      lastPushed.current &&
      lastPushed.current.key === key &&
      lastPushed.current.epoch === sceneEpoch
    ) {
      return;
    }
    lastPushed.current = { key, epoch: sceneEpoch };
    scene.setRootSequence(state);
  }, [key, state, sceneRef, sceneEpoch]);

  if (!state.active) {
    if (!foreignActive(countdown, ownerUsername, devFixture)) return null;
    // Foreign sequence (public info from the global countdown): a quiet
    // rival banner — the city itself renders no sequence visuals.
    return (
      <div className="city-root-chip city-root-chip-foreign" role="status">
        <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>
          {t.cityRootSequenceForeign.replace("{name}", countdown?.username ?? "")}
        </span>
      </div>
    );
  }

  const phaseLabel =
    state.phase === "stir"
      ? t.cityRootSequencePhaseStir
      : state.phase === "surge"
        ? t.cityRootSequencePhaseSurge
        : t.cityRootSequencePhaseBrink;

  const mm = Math.floor(state.remainingSeconds / 60);
  const ss = state.remainingSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  return (
    <div
      className={`city-root-chip city-root-chip-${state.phase}${state.resolving ? " city-root-chip-resolving" : ""}`}
      role="timer"
      aria-label={`${t.cityRootSequenceLabel} ${phaseLabel}`}
    >
      <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="city-root-chip-title">{t.cityRootSequenceLabel}</span>
      <span className="city-root-chip-phase">
        {state.resolving ? t.cityRootSequenceResolving : phaseLabel}
      </span>
      <span className="city-root-chip-time">
        {state.resolving ? "…" : `${pad(mm)}:${pad(ss)}`}
      </span>
    </div>
  );
}

function foreignActive(
  countdown: CountdownData | null,
  ownerUsername: string,
  devFixture: CountdownLike | null
): boolean {
  if (devFixture) return false;
  return !!countdown?.active && !!countdown.username && countdown.username !== ownerUsername;
}

type CountdownLike = Parameters<typeof rootSequenceFor>[0];

/**
 * Dev-only countdown fixture from NEXT_PUBLIC_CITY_ROOT_FX ("0.2" | "0.5" |
 * "0.9" …) — the viewed owner runs a synthetic sequence at that progress.
 * Null in production or when unset/out-of-range.
 */
function deriveDevFixture(
  nowSec: number,
  ownerUsername: string
): CountdownLike | null {
  if (process.env.NODE_ENV !== "development") return null;
  const raw = process.env.NEXT_PUBLIC_CITY_ROOT_FX;
  if (!raw) return null;
  const p = Number(raw);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  const span = 3_600;
  const startedAt = nowSec - Math.round(span * p);
  return {
    active: true,
    username: ownerUsername,
    startedAt,
    expiresAt: startedAt + span,
  };
}
