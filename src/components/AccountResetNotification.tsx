"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/event-feed";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageContext";

/**
 * Shows a one-time toast notification when a player's account has been reset.
 * 
 * Handles two types of resets:
 * - wasReset = 1: Account ran out of credits (system gave fresh start)
 * - wasReset = 2: Game win reset (someone assembled all Six)
 * 
 * Fetches /api/me on mount. If `wasReset` is truthy, shows a rich toast
 * and then calls POST /api/me to acknowledge and clear the flag.
 */
export function AccountResetNotification() {
  const hasChecked = useRef(false);
  const router = useRouter();
  const { t } = useLanguage();

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkReset() {
      try {
        const res = await fetch("/api/me");
        if (!res.ok) return;
        const data = await res.json();

        if (data.wasReset === 2) {
          // Game win reset — someone assembled all Six
          toast.success(t.gameWonTitle, {
            description: t.gameWonDesc,
            duration: 20000,
            action: {
              label: t.rootWallAction,
              onClick: () => router.push("/my-profile"),
            },
          });

          // Acknowledge the reset so the message is not shown again
          await fetch("/api/me", { method: "POST" });
        } else if (data.wasReset === 1) {
          // Account credit reset — player ran out of credits
          toast.warning(t.accountResetTitle, {
            description: t.accountResetDesc,
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
  }, [router, t]);

  return null;
}
