import { pgTable, index, foreignKey, serial, integer, bigint, varchar, timestamp, uniqueIndex, unique, text, doublePrecision, check } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const transactions = pgTable("transactions", {
	id: serial().primaryKey().notNull(),
	buyerId: integer("buyer_id").notNull(),
	targetId: integer("target_id").notNull(),
	type: varchar({ length: 20 }).notNull(),
	amount: bigint({ mode: 'number' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_transactions_buyer").using("btree", table.buyerId.asc().nullsLast().op("int4_ops")),
	index("idx_transactions_created").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_transactions_target").using("btree", table.targetId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.buyerId],
			foreignColumns: [users.id],
			name: "transactions_buyer_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.targetId],
			foreignColumns: [users.id],
			name: "transactions_target_id_users_id_fk"
		}),
]);

export const ownership = pgTable("ownership", {
	id: serial().primaryKey().notNull(),
	ownerId: integer("owner_id").notNull(),
	ownedId: integer("owned_id").notNull(),
	purchasedAt: timestamp("purchased_at", { mode: 'string' }).defaultNow().notNull(),
	purchasePrice: bigint("purchase_price", { mode: 'number' }).notNull(),
	blockSellUntil: timestamp("block_sell_until", { mode: 'string' }),
	blockSellBy: varchar("block_sell_by", { length: 30 }),
}, (table) => [
	index("idx_ownership_owned").using("btree", table.ownedId.asc().nullsLast().op("int4_ops")),
	index("idx_ownership_owner").using("btree", table.ownerId.asc().nullsLast().op("int4_ops")),
	uniqueIndex("idx_ownership_pair").using("btree", table.ownerId.asc().nullsLast().op("int4_ops"), table.ownedId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [users.id],
			name: "ownership_owner_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.ownedId],
			foreignColumns: [users.id],
			name: "ownership_owned_id_users_id_fk"
		}),
]);

export const users = pgTable("users", {
	id: serial().primaryKey().notNull(),
	username: varchar({ length: 30 }).notNull(),
	passwordHash: text("password_hash"),
	avatarUrl: text("avatar_url"),
	playerValue: bigint("player_value", { mode: 'number' }).default(1).notNull(),
	credits: doublePrecision().default(10).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	lastDividendAt: timestamp("last_dividend_at", { mode: 'string' }).defaultNow().notNull(),
	lastOnlineAt: timestamp("last_online_at", { mode: 'string' }).defaultNow().notNull(),
	isActive: integer("is_active").default(1).notNull(),
	valueFloor: bigint("value_floor", { mode: 'number' }).default(1).notNull(),
	blockSellUntil: timestamp("block_sell_until", { mode: 'string' }),
	blockSellBy: varchar("block_sell_by", { length: 30 }),
	estimatedDeletionAt: timestamp("estimated_deletion_at", { mode: 'string' }),
	facebookId: text("facebook_id"),
	googleId: text("google_id"),
	isVerified: integer("is_verified").default(0).notNull(),
	wasReset: integer("was_reset").default(0).notNull(),
	totalOnlineMinutes: integer("total_online_minutes").default(0).notNull(),
	isNpc: integer("is_npc").default(0).notNull(),
	ownerlessAt: timestamp("ownerless_at", { mode: 'string' }),
	photoAuthorName: text("photo_author_name"),
	photoAuthorUrl: text("photo_author_url"),
	photoSourceUrl: text("photo_source_url"),
}, (table) => [
	index("idx_users_username").using("btree", table.username.asc().nullsLast().op("text_ops")),
	unique("users_username_unique").on(table.username),
	unique("users_facebook_id_unique").on(table.facebookId),
	unique("users_google_id_unique").on(table.googleId),
]);

export const messages = pgTable("messages", {
	id: serial().primaryKey().notNull(),
	senderId: integer("sender_id").notNull(),
	recipientId: integer("recipient_id"),
	content: text().notNull(),
	type: text().default('public').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_messages_created").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_messages_recipient").using("btree", table.recipientId.asc().nullsLast().op("int4_ops")),
	index("idx_messages_sender").using("btree", table.senderId.asc().nullsLast().op("int4_ops")),
	index("idx_messages_type").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.senderId],
			foreignColumns: [users.id],
			name: "messages_sender_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.recipientId],
			foreignColumns: [users.id],
			name: "messages_recipient_id_users_id_fk"
		}),
]);

export const spawnQueue = pgTable("spawn_queue", {
	id: integer().default(1).primaryKey().notNull(),
	spawnsRemaining: integer("spawns_remaining").default(5).notNull(),
	nextSpawnAt: timestamp("next_spawn_at", { mode: 'string' }).defaultNow().notNull(),
	lastTriggeredAt: timestamp("last_triggered_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	check("spawn_queue_id_check", sql`id = 1`),
]);

export const randomPlayerSettings = pgTable("random_player_settings", {
	id: serial().primaryKey().notNull(),
	lastCreatedAt: timestamp("last_created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const gameHistory = pgTable("game_history", {
	id: serial().primaryKey().notNull(),
	eventType: varchar("event_type", { length: 30 }).notNull(),
	actorId: integer("actor_id"),
	targetId: integer("target_id"),
	targetUsername: varchar("target_username", { length: 30 }),
	details: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_game_history_created").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("idx_game_history_type").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("idx_game_history_actor").using("btree", table.actorId.asc().nullsLast().op("int4_ops")),
]);

export const gameSettings = pgTable("game_settings", {
	id: serial().primaryKey().notNull(),
	settingKey: varchar("setting_key", { length: 50 }).notNull(),
	settingValue: integer("setting_value").notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("game_settings_key_unique").on(table.settingKey),
]);