import { pgTable, serial, text, integer, bigint, doublePrecision, timestamp, varchar, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    // Unsplash photo "likes" captured at NPC creation — a crowd-sourced proxy
    // for how good the avatar photo looks. Drives the AI Agent's "prettiest
    // first" card selection. 0 for humans / non-Unsplash cards.
    photoScore: integer("photo_score").default(0).notNull(),
    lastRankBonusAt: timestamp("last_rank_bonus_at"),
    lastLoginRewardAt: timestamp("last_login_reward_at"),
    // Multi-account detection fields
    multiAccountWarnings: integer("multi_account_warnings").default(0).notNull(),
    multiAccountPenalized: integer("multi_account_penalized").default(0).notNull(),
    // Onboarding fields
    avatarCompleted: integer("avatar_completed").default(0).notNull(),
    onboardingNpcs: jsonb("onboarding_npcs").default([]).notNull(),
    onboardingOwnedCount: integer("onboarding_owned_count").default(0).notNull(),
    onboardingComplete: integer("onboarding_complete").default(0).notNull(),
    onboardingStarted: integer("onboarding_started").default(0).notNull(),
    // Onboarding pool - NPCs pre-generated with avatars, waiting to be assigned
    isOnboardingPool: integer("is_onboarding_pool").default(0).notNull(),
    // Tracks which player created this onboarding NPC (for visibility restriction)
    onboardingCreatedBy: integer("onboarding_created_by"),
    // Protection field - prevents deletion of special NPCs (e.g., goddesses)
    isProtected: integer("is_protected").default(0).notNull(),
    // Purchase counter - tracks how many times this player has been purchased
    purchaseCount: integer("purchase_count").default(0).notNull(),
    // Marketplace mission progress — index of the current mission (0-based).
    // Increments as the player completes "collect N cards" missions.
    missionLevel: integer("mission_level").default(0).notNull(),
    // Short bio / description set by the player (or their boss for NPCs)
    bio: text("bio"),
    // Profession - one of the 6 professions for NPCs, chosen by human players during onboarding
    profession: varchar("profession", { length: 30 }),
    // Hire slots — max number of players this user can own; starts at 20, purchasable in +10 increments
    hireSlots: integer("hire_slots").default(20).notNull(),
    temporaryKnowledgeUntil: timestamp("temporary_knowledge_until"),
    // Anchor for hourly "idle user loses 1 NPC per hour after 24h offline" decay
    lastOwnershipDecayAt: timestamp("last_ownership_decay_at"),
    lastCreateNpcAt: timestamp("last_create_npc_at"),
    // Remaining free NPC creations in the current "Create NPC" batch (one press
    // spawns 10 NPCs over time; this caps the free follow-up creations).
    createNpcBatchRemaining: integer("create_npc_batch_remaining").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_users_username").on(table.username),
    // Partial unique index — enforces no two NPCs share an Unsplash photo.
    // NULLs (humans, non-Unsplash NPCs) are excluded so this doesn't conflict.
    uniqueIndex("idx_users_photo_source_url_unique")
      .on(table.photoSourceUrl)
      .where(sql`${table.photoSourceUrl} IS NOT NULL`),
  ]
);