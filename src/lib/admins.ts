/**
 * Hard-coded admin allowlist.
 *
 * Kept in code (not in the DB) so the privilege can't be granted via a stray
 * SQL update or a leaked DB connection — only a code change + redeploy can
 * add a new admin.
 *
 * Match is case-insensitive against `session.user.name` (== users.username).
 */
export const ADMIN_USERNAMES: readonly string[] = ["IgorCarlier"];

export function isAdminUser(username: string | null | undefined): boolean {
  if (!username) return false;
  const lc = username.toLowerCase();
  return ADMIN_USERNAMES.some((a) => a.toLowerCase() === lc);
}
