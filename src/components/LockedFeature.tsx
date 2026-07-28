"use client";

import { Lock } from "lucide-react";
import { formatCompact } from "@/lib/utils";

interface LockedFeatureProps {
  /** What the locked feature is (e.g. "Ranks & live activity"). */
  title: string;
  /** Owned cards the player currently has. */
  ownedCount: number;
  /** Owned cards required to unlock. */
  threshold: number;
}

/**
 * Greyed-out placeholder shown in place of features that are still locked
 * behind the mission ladder, so first-time players can SEE what they are
 * working toward instead of having features silently appear later.
 */
export function LockedFeature({ title, ownedCount, threshold }: LockedFeatureProps) {
  const remaining = Math.max(0, threshold - ownedCount);
  return (
    <div
      className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 sm:p-4 flex items-center gap-3"
      aria-label={`${title} — locked, unlocks at ${formatCompact(threshold)} owned cards`}
    >
      <div className="p-2 rounded-lg bg-gray-800/60 shrink-0">
        <Lock className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-300 truncate">{title}</p>
        <p className="text-xs text-gray-500">
          Unlocks at {formatCompact(threshold)} owned cards — you have{" "}
          <span className="font-semibold text-gray-400">{formatCompact(ownedCount)}</span>
          {remaining > 0 && ` (${formatCompact(remaining)} to go)`}
        </p>
      </div>
    </div>
  );
}
