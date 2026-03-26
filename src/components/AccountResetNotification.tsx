"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Shows a one-time toast notification when a player's account has been reset
 * (i.e., they ran out of credits and the system gave them a fresh start).
 * 
 * Fetches /api/me on mount. If `wasReset` is truthy, shows a rich toast
 * and then calls POST /api/me to acknowledge and clear the flag.
 */
export function AccountResetNotification() {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkReset() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data = await res.json();

        if (data.wasReset) {
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
  }, []);

  return null;
}
