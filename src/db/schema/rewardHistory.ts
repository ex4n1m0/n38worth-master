import { pgTable, serial, integer, doublePrecision, text, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const rewardHistory = pgTable(
  "reward_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id)
      .notNull(),
    type: text("type").notNull(), // 'portfolio_reward' | 'rank_bonus' | 'login_reward' | 'purchase_income' | 'boss_portfolio_tax' | 'boss_no_income_tax'
    amount: doublePrecision("amount").notNull(),
    details: text("details"), // JSON string with extra context
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_reward_history_user").on(table.userId),
    index("idx_reward_history_created").on(table.createdAt),
    index("idx_reward_history_user_created").on(table.userId, table.createdAt),
  ]
);
