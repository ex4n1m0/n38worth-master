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
    lastBoostAt: timestamp("last_boost_at"),
  },
  (table) => [
    index("idx_ownership_owner").on(table.ownerId),
    uniqueIndex("idx_ownership_owned").on(table.ownedId),
    uniqueIndex("idx_ownership_pair").on(table.ownerId, table.ownedId),
  ]
);
