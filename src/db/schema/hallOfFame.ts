import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";

export const hallOfFame = pgTable("hall_of_fame", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  username: varchar("username", { length: 30 }).notNull(),
  wonAt: timestamp("won_at").defaultNow().notNull(),
});
