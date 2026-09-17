import { pgTable, serial, varchar, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Self-hosted, anonymous acquisition analytics (no third-party scripts).
 *
 * Rows are written by the landing-page visit beacon
 * (/api/analytics/visit) and on new-account creation (register, demo,
 * quickplay, OAuth sign-ups) with the UTM cookie values captured on the
 * landing page. No IPs, no user agents, no cross-site identifiers — just
 * "which channel brought a visit, and which brought a player".
 *
 * Inspect with: npm run analytics:summary
 */
export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    /** "visit" (landing beacon) or "signup" (account created). */
    type: varchar("type", { length: 16 }).notNull(),
    /** Page path the beacon fired from (landing: "/"). */
    path: varchar("path", { length: 128 }),
    /** Hostname of the document.referrer, when present and parseable. */
    referrerDomain: varchar("referrer_domain", { length: 128 }),
    utmSource: varchar("utm_source", { length: 64 }),
    utmMedium: varchar("utm_medium", { length: 64 }),
    utmCampaign: varchar("utm_campaign", { length: 64 }),
    /** Set on "signup" rows only — links a channel to a created account. */
    username: varchar("username", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("analytics_events_created_at_idx").on(t.createdAt),
    index("analytics_events_type_idx").on(t.type),
  ]
);
