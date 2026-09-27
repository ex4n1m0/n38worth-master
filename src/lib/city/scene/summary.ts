/**
 * Mainframe City — world-LOD summary derivation (pure, node-safe).
 *
 * The world-zoom overlay shows ONE bounded line per profession family plus a
 * total row. DISPLAY-ONLY derivation of SERVER aggregates (RTS plan §Phase D):
 * counts come straight from the projection's family totals / detailed +
 * aggregated counts — never recomputed from building lists, and never from
 * anything the server did not already send.
 */

/** Max family rows in the world summary (6 roster professions + unassigned). */
export const WORLD_SUMMARY_FAMILY_CAP = 7;

/** Minimal family shape the summary needs (CityFamily satisfies it). */
export interface SummaryFamilyInput {
  /** DB profession name, or UNASSIGNED_FAMILY for profession-less cards. */
  profession: string;
  /** Visible owned-card count in the family (server-computed total). */
  total: number;
}

export interface WorldSummaryRow {
  /** Raw family key — the React shell resolves the locale display name. */
  profession: string;
  count: number;
}

/**
 * Family rows for the world summary: non-empty families, count descending
 * (ties broken by name for determinism), capped at
 * WORLD_SUMMARY_FAMILY_CAP. Mirrors the projection's own sort order.
 */
export function worldSummaryRows(
  families: readonly SummaryFamilyInput[],
  cap: number = WORLD_SUMMARY_FAMILY_CAP
): WorldSummaryRow[] {
  return families
    .filter((f) => f.total > 0)
    .map((f) => ({ profession: f.profession, count: f.total }))
    .sort((a, b) => b.count - a.count || a.profession.localeCompare(b.profession))
    .slice(0, Math.max(0, cap));
}

/**
 * Total buildings for the summary footer — the two server-computed counts
 * added together (detailed + aggregated = every rendered building; goddesses
 * are landmarks and never count).
 */
export function summaryBuildingTotal(projection: {
  detailedCount: number;
  aggregatedCount: number;
}): number {
  return projection.detailedCount + projection.aggregatedCount;
}
