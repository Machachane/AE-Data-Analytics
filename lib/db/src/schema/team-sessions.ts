import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const teamSessionsTable = pgTable("team_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  credentialVersion: text("credential_version").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [index("team_sessions_expiry_idx").on(table.expiresAt)]);

export const insertTeamSessionSchema = createInsertSchema(teamSessionsTable);
export type InsertTeamSession = z.infer<typeof insertTeamSessionSchema>;
export type TeamSessionRow = typeof teamSessionsTable.$inferSelect;
