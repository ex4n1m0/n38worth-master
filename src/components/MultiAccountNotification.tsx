"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Shows a one-time toast notification when a player has been flagged
 * for multi-account usage (warning or penalty).
 * 
 * Checks /api/multi-account/status on mount. If the user has a pending
 * warning or penalty, shows the appropriate toast notification.
 */
export function MultiAccountNotification() {
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkMultiAccountStatus() {
      try {
        const res = await fetch("/api/multi-account/status");
        if (!res.ok) return;
        const data = await res.json();

        if (data.penalized) {
          toast.error("🚫 Multi-Account Penalty Active", {
            description:
              "Your account has been penalized for using multiple accounts from the same network. " +
              "A 50% reduction has been applied to your credits and player value.",
            duration: 20000,
          });
        } else if (data.warnings > 0) {
          toast.warning("⚠️ Multi-Account Warning", {
            description:
              "Multiple accounts have been detected from your network. " +
              "If this continues, a 50% penalty will be applied to your credits and player value.",
            duration: 15000,
          });
        }
      } catch {
        // Silently ignore — not critical
      }
    }

    checkMultiAccountStatus();
  }, []);

  return null;
}
