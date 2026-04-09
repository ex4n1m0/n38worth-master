import { pgTable, serial, integer, bigint, timestamp, varchar, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    buyerId: integer("buyer_id")
      .references(() => users.id)
      .notNull(),
    targetId: integer("target_id")
      .references(() => users.id)
      .notNull(),
    type: varchar("type", { length: 20 }).notNull(), // 'purchase' | 'discard'
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_transactions_buyer").on(table.buyerId),
    index("idx_transactions_target").on(table.targetId),
    index("idx_transactions_created").on(table.createdAt),
  ]
);
