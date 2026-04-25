"use client";

import { useCallback } from "react";

type SoundType = "changepage" | "hire" | "buttons";

const soundFiles: Record<SoundType, string> = {
  changepage: "/changepage.wav",
  hire: "/buy.wav",
  buttons: "/buttons.wav",
};

// Preload audio for instant playback
const audioCache: Map<SoundType, HTMLAudioElement> = new Map();

function getAudio(sound: SoundType): HTMLAudioElement {
  if (typeof window === "undefined") {
    throw new Error("Audio not available on server");
  }

  if (audioCache.has(sound)) {
    return audioCache.get(sound)!;
  }

  const audio = new Audio(soundFiles[sound]);
  audio.volume = 0.5;
  audio.preload = "auto";
  audioCache.set(sound, audio);
  return audio;
}

export function useSound() {
  const play = useCallback((sound: SoundType) => {
    try {
      const audio = getAudio(sound);
      // Clone the audio to allow overlapping sounds
      const clone = audio.cloneNode() as HTMLAudioElement;
      clone.volume = 0.5;
      clone.play().catch(() => {
        // Handle autoplay restrictions silently
      });
    } catch {
      // Handle any audio errors silently
    }
  }, []);

  return { play };
}
