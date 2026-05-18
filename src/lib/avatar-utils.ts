/**
 * Path to the masked avatar shown for any player the viewer hasn't hired.
 */
export const UNHIRED_AVATAR_SRC = "/UNHIRED2.png";

/**
 * Decide which avatar URL to display for a player, given the viewer's context.
 *
 * Rules:
 *  - If the player IS the viewer, always show their real avatar (or UNHIRED2.png as fallback).
 *  - If the viewer has hired the player, show the real avatar.
 *  - If isGoddess is true, always show the real avatar (goddesses are always visible).
 *  - If isAvatarRevealed is true, show the real avatar.
 *  - Otherwise, show UNHIRED2.png — applies to every other human and NPC.
 */
export function getAvatarSrc(params: {
  avatarUrl: string | null | undefined;
  playerId: number;
  playerUsername: string;
  viewerUsername: string | null | undefined;
  ownedIds: Set<number>;
  isGoddess?: boolean;
  isBonus?: boolean;
  isAvatarRevealed?: boolean;
}): string {
  const { avatarUrl, playerId, playerUsername, viewerUsername, ownedIds, isGoddess, isBonus, isAvatarRevealed } = params;
  const isSelf = !!viewerUsername && viewerUsername === playerUsername;
  const isHired = ownedIds.has(playerId);
  if (isSelf || isHired || isGoddess || isBonus || isAvatarRevealed) {
    return avatarUrl || UNHIRED_AVATAR_SRC;
  }
  return UNHIRED_AVATAR_SRC;
}

/**
 * Username-only variant for cases where the player ID isn't available
 * (e.g. transaction records). Same rule: real avatar only if self or hired.
 */
export function getAvatarSrcByUsername(params: {
  avatarUrl: string | null | undefined;
  playerUsername: string;
  viewerUsername: string | null | undefined;
  ownedUsernames: Set<string>;
}): string {
  const { avatarUrl, playerUsername, viewerUsername, ownedUsernames } = params;
  const isSelf = !!viewerUsername && viewerUsername === playerUsername;
  const isHired = ownedUsernames.has(playerUsername);
  if (isSelf || isHired) {
    return avatarUrl || UNHIRED_AVATAR_SRC;
  }
  return UNHIRED_AVATAR_SRC;
}
