"use client";

import { useCallback } from "react";

type SoundType = "changepage" | "hire" | "buttons";

export function useSound() {
  const play = useCallback((_sound: SoundType) => {
    // Sound effects disabled
  }, []);

  return { play };
}
