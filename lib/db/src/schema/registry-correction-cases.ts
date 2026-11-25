import { jsonb, pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type RegistryCorrectionValues = Record<string, string | number | null>;

export const registryCorrectionCasesTable = pgTable("registry_correction_cases", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id").notNull(),
  aircraft: jsonb("aircraft").$type<Record<string, string | number | null>>().notNull(),
  originalValues: jsonb("original_values").$type<RegistryCorrectionValues>().notNull(),
  proposedValues: jsonb("proposed_values").$type<RegistryCorrectionValues>().notNull(),
  rationale: text("rationale").notNull(),
  status: text("status").notNull().default("pending"),
  reviewNote: text("review_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertRegistryCorrectionCaseSchema = createInsertSchema(registryCorrectionCasesTable).omit({
  id: true,
  status: true,
  reviewNote: true,
  submittedAt: true,
  reviewedAt: true,
});
export type InsertRegistryCorrectionCase = z.infer<typeof insertRegistryCorrectionCaseSchema>;
export type RegistryCorrectionCase = typeof registryCorrectionCasesTable.$inferSelect;
