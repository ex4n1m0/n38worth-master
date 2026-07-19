"use client";

import { useEffect } from "react";
import { usePoachStore } from "@/hooks/usePoachEffect";

/**
 * Global poach controller. Owns the auto-clear timer and the `__testPoach`
 * preview helper. The visual itself is rendered inline inside the Navbar's
 * credits/value bar (in its empty right space) so it never overlays page
 * content. Mounted once in the game layout.
 */
export function PoachEffect() {
  const event = usePoachStore((s) => s.event);
  const clear = usePoachStore((s) => s.clear);

  useEffect(() => {
    if (!event) return;
    const t = setTimeout(() => clear(), 1900);
    return () => clearTimeout(t);
  }, [event, clear]);

  // Manual confirmation hook: run `__testPoach()` in the browser console on any
  // in-game page to preview the effect without an actual purchase.
  useEffect(() => {
    (window as unknown as { __testPoach?: (amount?: number) => void }).__testPoach = (
      amount = 12345
    ) => {
      usePoachStore.getState().trigger({
        amount,
        player: "TestPlayer",
        playerAvatar: "/NewAIPlayer.png",
        buyer: "TestBuyer",
      });
    };
    return () => {
      delete (window as unknown as { __testPoach?: (amount?: number) => void }).__testPoach;
    };
  }, []);

  // No overlay — the poach visual is rendered inline in the Navbar credits bar.
  return null;
}
