import { sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db";
import { logs } from "@/db/schema";
import { MAX_LOGS_PER_MINUTE, type ingestSchema } from "@/lib/schemas";
import type { GeneratedLog } from "@/lib/sim";
import { generateBatch } from "@/lib/sim";
import { evaluateRules } from "./alerts";
import { ApiError } from "./errors";
import { purgeOldLogs } from "./logs";
import { findDemoSource } from "./sources";

const MAX_AGE_MS = 7 * 24 * 3_600_000;
const FUTURE_TOLERANCE_MS = 60_000;
const SIMULATE_COOLDOWN_SEC = 2;

async function loggedInLastMinute(sourceId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(logs)
    .where(sql`${logs.sourceId} = ${sourceId} and ${logs.createdAt} > now() - interval '1 minute'`);
  return row?.n ?? 0;
}

async function insertLogs(sourceId: string, entries: GeneratedLog[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < entries.length; i += 250) {
    await db.insert(logs).values(entries.slice(i, i + 250).map((e) => ({ sourceId, severity: e.severity, message: e.message, stack: e.stack, meta: e.meta, ts: e.ts })));
  }
}

/** Opportunistic cleanup, so retention needs no scheduled job. */
function maybePurge(): Promise<void> {
  return Math.random() < 0.02 ? purgeOldLogs() : Promise.resolve();
}

export interface IngestResult {
  accepted: number;
  alertsFired: number;
}

/** Stores a validated batch for an authenticated source, then checks that source's alert rules. */
export async function ingest(sourceId: string, input: z.infer<typeof ingestSchema>): Promise<IngestResult> {
  const now = Date.now();
  const entries: GeneratedLog[] = input.logs.map((l) => {
    const ts = l.ts ? new Date(l.ts) : new Date(now);
    if (ts.getTime() > now + FUTURE_TOLERANCE_MS) throw new ApiError(400, "A log has a timestamp in the future.");
    if (ts.getTime() < now - MAX_AGE_MS) throw new ApiError(400, "Logs older than 7 days are not accepted.");
    return { severity: l.severity, message: l.message, stack: l.stack ?? null, meta: l.meta, ts };
  });

  if ((await loggedInLastMinute(sourceId)) + entries.length > MAX_LOGS_PER_MINUTE) {
    throw new ApiError(429, `Rate limit: at most ${MAX_LOGS_PER_MINUTE} logs per minute per source.`);
  }
  await insertLogs(sourceId, entries);
  const alertsFired = await evaluateRules(sourceId);
  await maybePurge();
  return { accepted: entries.length, alertsFired };
}

/** The "send some traffic" button: realistic logs for the demo source, throttled so it can't flood the database. */
export async function simulate(mode: "normal" | "errors"): Promise<IngestResult> {
  const source = await findDemoSource();
  const [recent] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(logs)
    .where(sql`${logs.sourceId} = ${source.id} and ${logs.createdAt} > now() - make_interval(secs => ${SIMULATE_COOLDOWN_SEC})`);
  if ((recent?.n ?? 0) > 0) throw new ApiError(429, "Easy there: wait a moment between bursts.");
  const entries = generateBatch(mode, new Date(), Date.now() % 100_000);
  await insertLogs(source.id, entries);
  const alertsFired = await evaluateRules(source.id);
  await maybePurge();
  return { accepted: entries.length, alertsFired };
}
