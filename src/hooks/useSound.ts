"use client";

import { useCallback } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Semantic sound palette. Files live in /public/sounds/*.mp3
 * (Kenney.nl "Interface Sounds" + "Digital Audio" packs, CC0).
 *
 * "buttons" is a legacy alias kept so older call sites keep working.
 */
type SoundType =
  | "click" // generic button press
  | "buttons" // legacy alias of click
  | "changepage" // navigating to another page
  | "toggle" // switches, filters, tabs
  | "open" // dialog / panel opened
  | "close" // dialog / panel closed
  | "chat" // public chat message received
  | "message" // private message received
  | "error" // failed action / error toast
  | "confirm" // neutral confirmation
  | "hire" // hired a card
  | "sell" // sold / discarded a card
  | "reward" // portfolio reward, rank bonus, login reward
  | "coin" // credits received (revenue share)
  | "poach" // one of your cards was poached
  | "bought" // YOU were bought by someone
  | "reveal" // reveal / mystery card
  | "win"; // countdown started / endgame fanfare

const ALIASES: Partial<Record<SoundType, SoundType>> = {
  buttons: "click",
};

/** Per-sound volume tweaks (relative to the master volume). */
const SOUND_GAIN: Partial<Record<SoundType, number>> = {
  click: 0.7,
  toggle: 0.6,
  chat: 0.5,
  poach: 0.8,
  win: 1.0,
};

/**
 * Haptic patterns (ms) matching the semantic sounds — the same events that
 * make sound also buzz on supporting devices (Android; iOS Safari ignores
 * navigator.vibrate, which is fine). Tied to the mute switch: muted = no
 * sound AND no buzz.
 */
const HAPTIC_PATTERNS: Partial<Record<SoundType, number | number[]>> = {
  click: 10,
  toggle: 10,
  changepage: 10,
  open: 10,
  close: 10,
  confirm: 15,
  chat: 10,
  message: 15,
  coin: 10,
  hire: 30,
  sell: 30,
  reward: [15, 40, 15],
  reveal: [10, 20],
  poach: 50,
  bought: [20, 20],
  error: 40,
  win: [10, 30, 10, 30, 10],
};

interface SoundSettings {
  muted: boolean;
  volume: number; // 0..1 master volume
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  setVolume: (volume: number) => void;
}

export const useSoundSettings = create<SoundSettings>()(
  persist(
    (set) => ({
      muted: false,
      volume: 0.5,
      setMuted: (muted) => set({ muted }),
      toggleMuted: () => set((s) => ({ muted: !s.muted })),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
    }),
    { name: "sound-settings" }
  )
);

// Module-level cache so repeated plays don't re-fetch the file.
const audioCache = new Map<string, HTMLAudioElement>();

export function playSound(sound: SoundType) {
  if (typeof window === "undefined") return;
  const { muted, volume } = useSoundSettings.getState();
  if (muted || volume <= 0) return;

  const name = ALIASES[sound] ?? sound;

  // Haptic twin of the sound (no-op where unsupported).
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(HAPTIC_PATTERNS[sound] ?? HAPTIC_PATTERNS[name] ?? 0);
    } catch {
      // vibrate() can throw on some embeds — never let it break the sound.
    }
  }

  const src = `/sounds/${name}.mp3`;

  let base = audioCache.get(src);
  if (!base) {
    base = new Audio(src);
    base.preload = "auto";
    audioCache.set(src, base);
  }

  // Clone so rapid repeat plays can overlap instead of cutting off.
  const node = base.cloneNode(true) as HTMLAudioElement;
  node.volume = volume * (SOUND_GAIN[name] ?? 1);
  // Ignore autoplay-policy rejections (before first user interaction).
  node.play().catch(() => {});
}

export function useSound() {
  const play = useCallback((sound: SoundType) => playSound(sound), []);
  return { play };
}
