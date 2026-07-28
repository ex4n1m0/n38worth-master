"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Users } from "lucide-react";
import { UNHIRED_AVATAR_SRC } from "@/lib/avatar-utils";
import { formatCompact } from "@/lib/utils";

/** How many cards fit the grid (12 cols × 6 rows on desktop). */
const GRID_LIMIT = 72;

interface OwnedPlayer {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  ownerCount?: number;
}

/**
 * Avatar grid of the cards a player owns, same look & feel as the landing
 * page's "Highest-Value NPC Cards" grid. Shows the most valuable owned cards
 * that fit, sorted top-left → bottom-right. Every avatar links to that
 * card's profile page.
 *
 * Avatars are ALWAYS visible here (no hidden-card masking) — it's a showcase
 * of the player's collection. Images are served via the public, CDN-cached
 * /api/avatar/[username] route so it works identically on your own profile
 * and on anyone else's, at ~zero function cost.
 */
export function OwnedAvatarGrid({
  ownerUsername,
  players,
  isOwnProfile,
}: {
  ownerUsername: string;
  players: OwnedPlayer[];
  isOwnProfile: boolean;
}) {
  const topPlayers = useMemo(
    () =>
      [...players]
        .sort((a, b) => (b.playerValue ?? 0) - (a.playerValue ?? 0))
        .slice(0, GRID_LIMIT),
    [players]
  );

  if (topPlayers.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <Users className="h-5 w-5 text-t1-400" />
        {isOwnProfile ? "Your" : `${ownerUsername}'s`} Most Valuable Cards
        <span className="text-sm font-normal text-gray-400">
          (top {topPlayers.length} of {players.length})
        </span>
      </h2>
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-12 gap-1.5">
        {topPlayers.map((p) => (
          <Link
            key={p.id}
            href={`/players/${encodeURIComponent(p.username)}`}
            title={`${p.username} — ${formatCompact(p.playerValue)}¢`}
            aria-label={`View ${p.username}'s profile`}
            className="aspect-square rounded-lg border border-white/10 overflow-hidden shadow-lg relative block hover:border-white/40 hover:scale-[1.03] transition-all"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/avatar/${encodeURIComponent(p.username)}`}
              alt={p.username}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                // No avatar stored (404) → masked placeholder.
                const el = e.currentTarget;
                if (!el.src.endsWith(UNHIRED_AVATAR_SRC)) el.src = UNHIRED_AVATAR_SRC;
              }}
              className="h-full w-full object-cover"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
