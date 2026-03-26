import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    senderId: integer("sender_id")
      .references(() => users.id)
      .notNull(),
    recipientId: integer("recipient_id")
      .references(() => users.id),
    content: text("content").notNull(),
    type: text("type").notNull().default("public"), // "public" or "private"
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_messages_type").on(table.type),
    index("idx_messages_sender").on(table.senderId),
    index("idx_messages_recipient").on(table.recipientId),
    index("idx_messages_created").on(table.createdAt),
  ]
);
