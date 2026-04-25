import { pgTable, serial, integer, varchar, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const ipSessions = pgTable(
  "ip_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_ip_sessions_user_ip").on(table.userId, table.ipAddress),
    index("idx_ip_sessions_ip").on(table.ipAddress),
    index("idx_ip_sessions_last_seen").on(table.lastSeenAt),
  ]
);
