import { z } from "zod";

export const MAX_BATCH = 500;
export const MAX_MESSAGE = 2000;
export const MAX_STACK = 8000;
export const MAX_META_KEYS = 20;
export const PAGE_SIZE = 50;
/** Per source, per minute: protects the database from a runaway client. */
export const MAX_LOGS_PER_MINUTE = 3000;

const severity = z.enum(["INFO", "WARN", "ERROR"]);

const metaValue = z.union([z.string().max(300), z.number().finite(), z.boolean()]);

export const ingestLogSchema = z.object({
  severity,
  message: z.string().trim().min(1).max(MAX_MESSAGE),
  stack: z.string().max(MAX_STACK).nullish(),
  meta: z
    .record(z.string().max(60), metaValue)
    .refine((m) => Object.keys(m).length <= MAX_META_KEYS, { message: `At most ${MAX_META_KEYS} meta keys per log` })
    .default({}),
  /** ISO timestamp; defaults to now. Future dates and anything older than a week are rejected. */
  ts: z.iso.datetime({ offset: true }).optional(),
});

export const ingestSchema = z.object({
  logs: z.array(ingestLogSchema).min(1, "Send at least one log").max(MAX_BATCH, `At most ${MAX_BATCH} logs per request`),
});

const csvSeverities = z
  .string()
  .transform((value) => value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean))
  .pipe(z.array(severity).max(3));

const idParam = z.coerce.number().int().positive();

export const logQuerySchema = z.object({
  sourceId: z.uuid().optional(),
  severity: csvSeverities.optional(),
  q: z.string().trim().max(100).optional(),
  /** Older page: logs with an id below this. */
  before: idParam.optional(),
  /** Live polling: logs with an id above this. */
  since: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(PAGE_SIZE),
});

export const statsQuerySchema = z.object({
  sourceId: z.uuid().optional(),
  minutes: z.coerce.number().int().refine((n) => [15, 60, 360, 1440].includes(n), "Pick 15, 60, 360 or 1440 minutes").default(60),
});

export const createSourceSchema = z.object({ name: z.string().trim().min(2).max(40) });

export const createRuleSchema = z.object({
  sourceId: z.uuid(),
  severity,
  threshold: z.number().int().min(1).max(100_000),
  windowSec: z.number().int().min(30).max(86_400),
  webhookUrl: z.string().trim().url().max(500),
});

export const updateRuleSchema = z.object({ enabled: z.boolean() });

export const simulateSchema = z.object({ mode: z.enum(["normal", "errors"]).default("normal") });
