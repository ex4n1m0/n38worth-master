"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/event-feed";
import { useRouter } from "next/navigation";

/**
 * Shows a one-time toast notification when a player's account has been reset.
 * 
 * Handles two types of resets:
 * - wasReset = 1: Account ran out of credits (system gave fresh start)
 * - wasReset = 2: Game win reset (someone collected all 6 goddesses)
 * 
 * Fetches /api/me on mount. If `wasReset` is truthy, shows a rich toast
 * and then calls POST /api/me to acknowledge and clear the flag.
 */
export function AccountResetNotification() {
  const hasChecked = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkReset() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data = await res.json();

        if (data.wasReset === 2) {
          // Game win reset — someone collected all 6 goddesses
          toast.success("🏆 Game Won — World Reset!", {
            description:
              "A player has collected all 6 Goddesses and won the game! " +
              "The world has been reset. Everyone starts fresh with 100¢. " +
              "Check the Hall of Fame to see the champion!",
            duration: 20000,
            action: {
              label: "Hall of Fame",
              onClick: () => router.push("/hall-of-fame"),
            },
          });

          // Acknowledge the reset so the message is not shown again
          await fetch("/api/me", { method: "POST" });
        } else if (data.wasReset === 1) {
          // Account credit reset — player ran out of credits
          toast.warning("🔄 Account Reset", {
            description:
              "Your account ran out of credits and has been reset to a fresh start. " +
              "You have 10¢ to begin again — upload an avatar to earn bonus credits!",
            duration: 15000,
          });

          // Acknowledge the reset so the message is not shown again
          await fetch("/api/me", { method: "POST" });
        }
      } catch {
        // Silently ignore — not critical
      }
    }

    checkReset();
  }, [router]);

  return null;
}
