import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Blueprint Albums (2026-10-01, GAME_INTEGRATION_STUDY §5E).
 *
 * blueprint_inventory holds one row per (player, blueprint) with a COUNT —
 * count > 1 marks a tradeable duplicate. The `__backfilled` sentinel row
 * (count 0) marks that the one-time historical backfill ran for the player.
 * Albums/props are DERIVED from inventory (never stored); the collection is
 * cosmetic-only and SURVIVES world resets (a retention anchor, no power).
 */
export const blueprintInventory = pgTable(
  "blueprint_inventory",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    blueprintId: varchar("blueprint_id", { length: 32 }).notNull(),
    count: integer("count").default(1).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_bp_inventory_user_bp").on(table.userId, table.blueprintId),
    index("idx_bp_inventory_user").on(table.userId),
  ]
);

/**
 * Escrowed duplicate-for-duplicate trades (the ONLY trading surface —
 * player cards are never tradeable). Proposing escrows the offer copy
 * immediately (count −1); acceptance escrows the counterpart the same way;
 * both sides then credit. Every state flip is a single conditional UPDATE
 * on status='open' so settle/cancel/expire are mutually exclusive.
 */
export const blueprintTrades = pgTable(
  "blueprint_trades",
  {
    id: serial("id").primaryKey(),
    fromId: integer("from_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    toId: integer("to_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    offerBp: varchar("offer_bp", { length: 32 }).notNull(),
    requestBp: varchar("request_bp", { length: 32 }).notNull(),
    // "open" | "accepted" | "declined" | "cancelled" | "expired"
    status: varchar("status", { length: 16 }).default("open").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    completedAt: timestamp("completed_at"),
  },
  (table) => [
    index("idx_bp_trades_to_status").on(table.toId, table.status),
    index("idx_bp_trades_from_status").on(table.fromId, table.status),
  ]
);
