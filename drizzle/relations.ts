import { relations } from "drizzle-orm/relations";
import { users, transactions, ownership, messages } from "./schema";

export const transactionsRelations = relations(transactions, ({one}) => ({
	user_buyerId: one(users, {
		fields: [transactions.buyerId],
		references: [users.id],
		relationName: "transactions_buyerId_users_id"
	}),
	user_targetId: one(users, {
		fields: [transactions.targetId],
		references: [users.id],
		relationName: "transactions_targetId_users_id"
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	transactions_buyerId: many(transactions, {
		relationName: "transactions_buyerId_users_id"
	}),
	transactions_targetId: many(transactions, {
		relationName: "transactions_targetId_users_id"
	}),
	ownerships_ownerId: many(ownership, {
		relationName: "ownership_ownerId_users_id"
	}),
	ownerships_ownedId: many(ownership, {
		relationName: "ownership_ownedId_users_id"
	}),
	messages_senderId: many(messages, {
		relationName: "messages_senderId_users_id"
	}),
	messages_recipientId: many(messages, {
		relationName: "messages_recipientId_users_id"
	}),
}));

export const ownershipRelations = relations(ownership, ({one}) => ({
	user_ownerId: one(users, {
		fields: [ownership.ownerId],
		references: [users.id],
		relationName: "ownership_ownerId_users_id"
	}),
	user_ownedId: one(users, {
		fields: [ownership.ownedId],
		references: [users.id],
		relationName: "ownership_ownedId_users_id"
	}),
}));

export const messagesRelations = relations(messages, ({one}) => ({
	user_senderId: one(users, {
		fields: [messages.senderId],
		references: [users.id],
		relationName: "messages_senderId_users_id"
	}),
	user_recipientId: one(users, {
		fields: [messages.recipientId],
		references: [users.id],
		relationName: "messages_recipientId_users_id"
	}),
}));