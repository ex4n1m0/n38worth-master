import { pgTable, serial, integer, bigint, timestamp, index, uniqueIndex, varchar } from "drizzle-orm/pg-core";
import { users } from "./users";

export const ownership = pgTable(
  "ownership",
  {
    id: serial("id").primaryKey(),
    ownerId: integer("owner_id")
      .references(() => users.id)
      .notNull(),
    ownedId: integer("owned_id")
      .references(() => users.id)
      .notNull(),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
    purchasePrice: bigint("purchase_price", { mode: "number" }).notNull(),
    blockSellUntil: timestamp("block_sell_until"),
    blockSellBy: varchar("block_sell_by", { length: 30 }),
    blockUnbreakableUntil: timestamp("block_unbreakable_until"),
    permBlockUntil: timestamp("perm_block_until"),
    lastBoostAt: timestamp("last_boost_at"),
    avatarRevealUntil: timestamp("avatar_reveal_until"),
    boostPressCount: integer("boost_press_count").default(0),
    lastBoostPressAt: timestamp("last_boost_press_at"),
    revealPressCount: integer("reveal_press_count").default(0),
    lastRevealPressAt: timestamp("last_reveal_press_at"),
    // Stamped when the CURRENT owner renames this NPC card. Each ownership
    // stint gets one rename — a fresh row means a fresh rename.
    renamedAt: timestamp("renamed_at"),
  },
  (table) => [
    index("idx_ownership_owner").on(table.ownerId),
    uniqueIndex("idx_ownership_owned").on(table.ownedId),
    uniqueIndex("idx_ownership_pair").on(table.ownerId, table.ownedId),
    // Performance indexes for frequently queried columns
    index("idx_ownership_block_sell_until").on(table.blockSellUntil),
    index("idx_ownership_perm_block_until").on(table.permBlockUntil),
  ]
);
