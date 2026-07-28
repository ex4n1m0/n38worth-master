"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
 * card's profile page. Avatars are ALWAYS visible here (no hidden-card
 * masking) — it's a showcase of the player's collection.
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

  // On your own profile the lite team query strips avatars — fetch the real
  // ones for the grid ids (same endpoint + cache key the team grid uses).
  const gridIds = useMemo(
    () => topPlayers.map((p) => p.id).sort((a, b) => a - b),
    [topPlayers]
  );
  const { data: avatarsData } = useQuery<{ avatarMap: Record<string, string | null> }>({
    queryKey: ["owned-avatars", ownerUsername, gridIds],
    queryFn: async () => {
      const res = await fetch(`/api/players/${ownerUsername}/owned-avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: gridIds }),
      });
      if (!res.ok) return { avatarMap: {} };
      return res.json();
    },
    enabled: isOwnProfile && gridIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  const avatarMap = avatarsData?.avatarMap ?? {};

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
        {topPlayers.map((p) => {
          const rawUrl = isOwnProfile
            ? avatarMap[String(p.id)] ?? p.avatarUrl
            : p.avatarUrl;
          const src = rawUrl || UNHIRED_AVATAR_SRC;
          return (
            <Link
              key={p.id}
              href={`/players/${encodeURIComponent(p.username)}`}
              title={`${p.username} — ${formatCompact(p.playerValue)}¢`}
              aria-label={`View ${p.username}'s profile`}
              className="aspect-square rounded-lg border border-white/10 overflow-hidden shadow-lg relative block hover:border-white/40 hover:scale-[1.03] transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={p.username}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
