import { and, inArray, sql, type SQL } from "drizzle-orm";
import { ownership, users } from "@/db/schema";
import { GODDESS_USERNAMES } from "@/lib/goddesses";

/** Far-future timestamp used as the "permanent" Fate seal. */
export const FATE_SEAL_DATE = new Date("2099-12-31T23:59:59Z");

/**
 * WHERE clause for fate-seal cron step 2: ownership rows (joined to the owned
 * `users` row) that belong to an active Fate holder, are not yet sealed, and
 * are not goddesses.
 *
 * The NULL-or-older-than-seal disjunction MUST stay parenthesized: drizzle's
 * `and()` joins its chunks with a bare ` and ` (only the whole list is
 * wrapped), so an unparenthesized `a IS NULL OR a < x` chunk splits the
 * clause into `(holder AND a IS NULL) OR (a < x AND not-goddess)` — which
 * matched EVERY non-goddess row with a timed firewall regardless of owner
 * (the 2026-09-27 H2 bug that stamped, then erased, other players' firewalls).
 */
export function fateSealCandidateWhere(fateHolderIds: number[]): SQL | undefined {
  return and(
    inArray(ownership.ownerId, fateHolderIds),
    sql`(${ownership.blockSellUntil} IS NULL OR ${ownership.blockSellUntil} < ${FATE_SEAL_DATE})`,
    // Exclude goddesses — never seal them
    sql`${users.username} NOT IN (${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)})`
  );
}
