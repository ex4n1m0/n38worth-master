import { pgTable, serial, integer, varchar, doublePrecision, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Crew Jobs audit trail (2026-10-01, GAME_INTEGRATION_STUDY §5C): one row
 * per run — job, outcome, payout (from the recycled boss-tax pot), burned
 * fee, and the crew card ids. The per-job cooldown derives from the latest
 * rolledAt per (userId, jobKey).
 */
export const crewJobRuns = pgTable(
  "crew_job_runs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    jobKey: varchar("job_key", { length: 40 }).notNull(),
    outcome: varchar("outcome", { length: 12 }).notNull(), // fail|partial|clean|perfect
    payout: doublePrecision("payout").notNull(),
    fee: doublePrecision("fee").notNull(),
    crewCardIds: jsonb("crew_card_ids").default([]).notNull(),
    /** Resolution audit (study §5C "server-seeded, audit-logged"): steps + powers. */
    details: jsonb("details"),
    rolledAt: timestamp("rolled_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_crew_runs_user_job").on(table.userId, table.jobKey, table.rolledAt),
  ]
);
