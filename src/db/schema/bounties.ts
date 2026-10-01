import { pgTable, serial, integer, varchar, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Bounty Board (2026-10-01, GAME_INTEGRATION_STUDY §5B) — escrowed public
 * contracts on other players' cards.
 *
 * Two types:
 *  - "foreclose": reward goes to whoever POACHES the target card away from its
 *    current landlord (settled inside the purchase flow, any buyer ≠ creator).
 *  - "deliver": the creator wants to end up owning the target card; the escrow
 *    returns to the creator when THEY acquire it.
 *
 * The reward is escrowed at post time (deducted from the creator immediately)
 * and released by the settlement/expiry paths — credits only, no new currency.
 * The listing fee is burned (sink).
 */
export const bounties = pgTable(
  "bounties",
  {
    id: serial("id").primaryKey(),
    creatorId: integer("creator_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    type: varchar("type", { length: 20 }).notNull(), // "foreclose" | "deliver"
    targetUserId: integer("target_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Denormalized for stable board display (usernames are unique + immutable).
    targetUsername: varchar("target_username", { length: 30 }).notNull(),
    rewardCredits: doublePrecision("reward_credits").notNull(),
    // Listing fee burned at post time (audit only — never refunded).
    feeCredits: doublePrecision("fee_credits").default(0).notNull(),
    // "open" | "completed" | "expired" | "cancelled"
    status: varchar("status", { length: 20 }).default("open").notNull(),
    takerId: integer("taker_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_bounties_status_expiry").on(table.status, table.expiresAt),
    index("idx_bounties_target").on(table.targetUserId, table.status),
    index("idx_bounties_creator").on(table.creatorId, table.createdAt),
  ]
);
