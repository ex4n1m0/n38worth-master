import { pgTable, serial, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const gameSettings = pgTable(
  "game_settings",
  {
    id: serial("id").primaryKey(),
    settingKey: varchar("setting_key", { length: 50 }).notNull().unique(),
    settingValue: integer("setting_value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  }
);