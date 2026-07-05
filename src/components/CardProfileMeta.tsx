"use client";

import { Users, ExternalLink } from "lucide-react";

/**
 * Compact meta row shown on player cards (market + profile team cards):
 *   - A small icon + count of how many players this player currently owns
 *     (only rendered when > 0).
 *   - A small button that opens this player's profile page in a NEW TAB.
 *
 * The "open" button uses window.open (not an <a>) + stopPropagation so it works
 * correctly when the card itself is wrapped in a <Link> or has a click handler
 * (e.g. combo selection), without triggering that navigation/toggle.
 */
export function CardProfileMeta({
  username,
  ownedCount,
  className = "",
}: {
  username: string;
  ownedCount?: number;
  className?: string;
}) {
  const openInNewTab = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`/players/${encodeURIComponent(username)}`, "_blank", "noopener,noreferrer");
  };

  const count = ownedCount ?? 0;

  return (
    <div className={`flex items-center justify-between gap-1 ${className}`}>
      {count > 0 ? (
        <span
          className="flex items-center gap-0.5 text-[10px] sm:text-xs text-gray-400"
          title={`Owns ${count} player${count === 1 ? "" : "s"}`}
        >
          <Users className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-t2-400 shrink-0" />
          <span className="font-semibold tabular-nums">{count}</span>
        </span>
      ) : (
        <span />
      )}
      <button
        type="button"
        onClick={openInNewTab}
        title={`Open ${username}'s profile in a new tab`}
        aria-label={`Open ${username}'s profile in a new tab`}
        className="flex items-center justify-center h-6 w-6 rounded-md border border-gray-700 text-gray-400 hover:text-t1-300 hover:border-t1-500/60 hover:bg-t1-500/10 transition-colors shrink-0"
      >
        <ExternalLink className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
      </button>
    </div>
  );
}
