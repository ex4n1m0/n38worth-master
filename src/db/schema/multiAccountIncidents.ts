import { pgTable, serial, integer, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const multiAccountIncidents = pgTable(
  "multi_account_incidents",
  {
    id: serial("id").primaryKey(),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    userId1: integer("user_id_1")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    userId2: integer("user_id_2")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    action: varchar("action", { length: 20 }).notNull(), // "warning" or "penalty"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_multi_account_ip").on(table.ipAddress),
    index("idx_multi_account_user1").on(table.userId1),
    index("idx_multi_account_user2").on(table.userId2),
    index("idx_multi_account_created").on(table.createdAt),
  ]
);
