import { pgTable, integer, timestamp } from "drizzle-orm/pg-core";

/**
 * Pre-computed leaderboard rank positions per user, refreshed by the
 * /api/cron/rank-snapshot cron every 10 min. Lets /api/leaderboard answer
 * "what is my position in each category" with one indexed lookup instead of
 * 5 correlated COUNT subqueries per request.
 */
export const userRankSnapshots = pgTable("user_rank_snapshots", {
  userId: integer("user_id").primaryKey(),
  empireRank: integer("empire_rank").notNull(),
  legacyRank: integer("legacy_rank").notNull(),
  creditsRank: integer("credits_rank").notNull(),
  valueRank: integer("value_rank").notNull(),
  portfolioRank: integer("portfolio_rank").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
