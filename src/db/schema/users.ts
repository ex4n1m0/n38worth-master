import { pgTable, serial, text, integer, bigint, doublePrecision, timestamp, varchar, jsonb, index } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 30 }).unique().notNull(),
    passwordHash: text("password_hash"),
    facebookId: text("facebook_id").unique(),
    googleId: text("google_id").unique(),
    avatarUrl: text("avatar_url"),
    playerValue: bigint("player_value", { mode: "number" }).default(1).notNull(),
    valueFloor: bigint("value_floor", { mode: "number" }).default(1).notNull(),
    credits: doublePrecision("credits").default(100).notNull(),
    lastDividendAt: timestamp("last_dividend_at").defaultNow().notNull(),
    totalOnlineMinutes: integer("total_online_minutes").default(0).notNull(),
    lastOnlineAt: timestamp("last_online_at").defaultNow().notNull(),
    blockSellUntil: timestamp("block_sell_until"),
    blockSellBy: varchar("block_sell_by", { length: 30 }),
    estimatedDeletionAt: timestamp("estimated_deletion_at"),
    isActive: integer("is_active").default(1).notNull(),
    isVerified: integer("is_verified").default(0).notNull(),
    isNpc: integer("is_npc").default(0).notNull(),
    ownerlessAt: timestamp("ownerless_at"),
    wasReset: integer("was_reset").default(0).notNull(),
    photoAuthorName: text("photo_author_name"),
    photoAuthorUrl: text("photo_author_url"),
    photoSourceUrl: text("photo_source_url"),
    lastRankBonusAt: timestamp("last_rank_bonus_at"),
    lastLoginRewardAt: timestamp("last_login_reward_at"),
    // Onboarding fields
    avatarCompleted: integer("avatar_completed").default(0).notNull(),
    onboardingNpcs: jsonb("onboarding_npcs").default([]).notNull(),
    onboardingOwnedCount: integer("onboarding_owned_count").default(0).notNull(),
    onboardingComplete: integer("onboarding_complete").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_users_username").on(table.username),
  ]
);
