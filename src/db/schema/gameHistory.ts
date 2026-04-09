import { pgTable, serial, integer, timestamp, varchar, text, index } from "drizzle-orm/pg-core";

export const gameHistory = pgTable(
  "game_history",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 30 }).notNull(), // 'purchase', 'sell', 'npc_deletion', 'player_deletion'
    actorId: integer("actor_id"), // who performed the action (nullable for system actions)
    targetId: integer("target_id"), // who was affected (nullable for some events)
    targetUsername: varchar("target_username", { length: 30 }), // username of affected player (preserved even if user deleted)
    details: text("details"), // JSON string with additional event details
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_game_history_created").on(table.createdAt),
    index("idx_game_history_type").on(table.eventType),
    index("idx_game_history_actor").on(table.actorId),
  ]
);