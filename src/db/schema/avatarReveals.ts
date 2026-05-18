import { pgTable, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const avatarReveals = pgTable(
  "avatar_reveals",
  {
    id: serial("id").primaryKey(),
    viewerId: integer("viewer_id")
      .references(() => users.id)
      .notNull(),
    targetId: integer("target_id")
      .references(() => users.id)
      .notNull(),
    revealUntil: timestamp("reveal_until").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_avatar_reveals_viewer").on(table.viewerId),
    index("idx_avatar_reveals_target").on(table.targetId),
    uniqueIndex("idx_avatar_reveals_pair").on(table.viewerId, table.targetId),
  ]
);
