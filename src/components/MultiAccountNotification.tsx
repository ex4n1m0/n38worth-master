"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/lib/event-feed";
import { useLanguage } from "@/components/LanguageContext";

/**
 * Shows a one-time toast notification when a player has been flagged
 * for multi-account usage (warning or penalty).
 * 
 * Checks /api/multi-account/status on mount. If the user has a pending
 * warning or penalty, shows the appropriate toast notification.
 */
export function MultiAccountNotification() {
  const hasChecked = useRef(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    async function checkMultiAccountStatus() {
      try {
        const res = await fetch("/api/multi-account/status");
        if (!res.ok) return;
        const data = await res.json();

        if (data.penalized) {
          toast.error(t.multiAccountPenaltyActiveTitle, {
            description: t.multiAccountPenaltyActiveDesc,
            duration: 20000,
          });
        } else if (data.warnings > 0) {
          toast.warning(t.multiAccountWarningTitle, {
            description: t.multiAccountWarningDesc,
            duration: 15000,
          });
        }
      } catch {
        // Silently ignore — not critical
      }
    }

    checkMultiAccountStatus();
  }, [t]);

  return null;
}
