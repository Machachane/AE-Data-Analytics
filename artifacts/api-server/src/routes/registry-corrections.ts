import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  GetRegistryCorrectionCasesQueryParams,
  GetRegistryCorrectionCasesResponse,
  ReviewRegistryCorrectionBody,
  ReviewRegistryCorrectionParams,
  ReviewRegistryCorrectionResponse,
  SubmitRegistryCorrectionBody,
  SubmitRegistryCorrectionResponse,
} from "@workspace/api-zod";
import { db, registryCorrectionCasesTable } from "@workspace/db";
import { registryRecordById } from "../lib/registry";

const router: IRouter = Router();
const editFields = [
  "manufacturer", "model", "aircraftType", "registration", "msn",
  "operator", "owner", "firstFlight", "year", "engineManufacturer",
  "engineFamily", "engineModel",
] as const;
const rateLimits = new Map<string, { count: number; reset: number }>();
const objectValues = (value: unknown): value is Record<string, string | number | null> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const caseShape = (item: typeof registryCorrectionCasesTable.$inferSelect) => ({
  ...item,
  aircraft: item.aircraft,
  originalValues: item.originalValues,
  proposedValues: item.proposedValues,
});

router.get("/registry/corrections", async (req, res): Promise<void> => {
  const parsed = GetRegistryCorrectionCasesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a valid correction case status." });
    return;
  }
  const query = db.select().from(registryCorrectionCasesTable);
  const cases = await (parsed.data.status
    ? query.where(eq(registryCorrectionCasesTable.status, parsed.data.status))
    : query).orderBy(desc(registryCorrectionCasesTable.submittedAt), desc(registryCorrectionCasesTable.id)).limit(200);
  res.json(GetRegistryCorrectionCasesResponse.parse({ cases: cases.map(caseShape) }));
});

router.post("/registry/corrections", async (req, res): Promise<void> => {
  const parsed = SubmitRegistryCorrectionBody.safeParse(req.body);
  if (!parsed.success || !objectValues(parsed.data?.proposedValues) || !parsed.data.rationale.trim()) {
    res.status(400).json({ error: "Select a registry entry, suggest at least one valid field, and explain the correction." });
    return;
  }
  const now = Date.now();
  for (const [key, limit] of rateLimits) if (limit.reset <= now) rateLimits.delete(key);
  const key = req.ip ?? req.socket.remoteAddress ?? "shared";
  const limit = rateLimits.get(key) ?? { count: 0, reset: now + 60_000 };
  if (limit.count >= 10 || rateLimits.size > 5000) {
    res.setHeader("Retry-After", "60");
    res.status(429).json({ error: "Please wait a minute before submitting another correction." });
    return;
  }

  const row = await registryRecordById(parsed.data.recordId);
  if (!row) {
    res.status(404).json({ error: "That registry entry is no longer available." });
    return;
  }
  const submitted = parsed.data.proposedValues;
  const fields = Object.keys(submitted);
  if (!fields.length || fields.some(field => !editFields.includes(field as typeof editFields[number]))) {
    res.status(400).json({ error: "Only supported Registry fields can be suggested." });
    return;
  }
  const originalValues: Record<string, string | number | null> = {};
  for (const field of fields) {
    const value = submitted[field];
    const current = row[field as keyof typeof row];
    if (field === "year") {
      if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1900 || value > 2100)) {
        res.status(400).json({ error: "Manufacture year must be a whole year between 1900 and 2100, or blank." });
        return;
      }
    } else if (value !== null && (typeof value !== "string" || value.length > 300)) {
      res.status(400).json({ error: "Text field suggestions must be 300 characters or fewer." });
      return;
    }
    originalValues[field] = typeof current === "string" || typeof current === "number" ? current : null;
  }
  if (fields.every(field => originalValues[field] === submitted[field])) {
    res.status(400).json({ error: "At least one suggested value must differ from the current Registry entry." });
    return;
  }

  limit.count++;
  rateLimits.set(key, limit);
  const aircraft = {
    manufacturer: row.manufacturer,
    model: row.model,
    registration: row.registration,
    msn: row.msn,
    operator: row.operator,
  };
  const [saved] = await db.insert(registryCorrectionCasesTable).values({
    recordId: row.id,
    aircraft,
    originalValues,
    proposedValues: submitted,
    rationale: parsed.data.rationale.trim(),
  }).returning();
  res.status(201).json(SubmitRegistryCorrectionResponse.parse(caseShape(saved)));
});

router.patch("/registry/corrections/:id", async (req, res): Promise<void> => {
  const params = ReviewRegistryCorrectionParams.safeParse(req.params);
  const body = ReviewRegistryCorrectionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Provide a valid approval or rejection decision." });
    return;
  }
  const [reviewed] = await db.update(registryCorrectionCasesTable).set({
    status: body.data.decision === "approve" ? "approved" : "rejected",
    reviewNote: body.data.reviewNote?.trim() || null,
    reviewedAt: new Date(),
  }).where(and(
    eq(registryCorrectionCasesTable.id, params.data.id),
    eq(registryCorrectionCasesTable.status, "pending"),
  )).returning();
  if (!reviewed) {
    const [existing] = await db.select({ id: registryCorrectionCasesTable.id })
      .from(registryCorrectionCasesTable)
      .where(eq(registryCorrectionCasesTable.id, params.data.id)).limit(1);
    res.status(existing ? 409 : 404).json({
      error: existing ? "This correction case has already been reviewed." : "Correction case not found.",
    });
    return;
  }
  res.json(ReviewRegistryCorrectionResponse.parse(caseShape(reviewed)));
});

export default router;
