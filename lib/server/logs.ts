import { and, desc, eq, gt, ilike, inArray, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db";
import { logs, sources } from "@/db/schema";
import { bucketSizeFor, fillBuckets, totalsOf, type BucketRow } from "@/lib/buckets";
import { escapeLike } from "@/lib/highlight";
import type { logQuerySchema } from "@/lib/schemas";
import type { LogEntry, LogsResponse, Severity, StatsResponse } from "@/types";

type LogQuery = z.infer<typeof logQuerySchema>;

function toEntry(row: typeof logs.$inferSelect, sourceName: string): LogEntry {
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName,
    severity: row.severity,
    message: row.message,
    stack: row.stack,
    meta: row.meta,
    ts: row.ts.toISOString(),
  };
}

/**
 * Two modes, both by cursor (never OFFSET, which gets slower the deeper you page):
 * `since` returns logs newer than an id (live polling) and `before` returns the next older page.
 * Either way the result is newest first.
 */
export async function queryLogs(query: LogQuery): Promise<LogsResponse> {
  const conditions = [
    query.sourceId ? eq(logs.sourceId, query.sourceId) : undefined,
    query.severity?.length ? inArray(logs.severity, query.severity) : undefined,
    query.q ? or(ilike(logs.message, `%${escapeLike(query.q)}%`), ilike(logs.stack, `%${escapeLike(query.q)}%`)) : undefined,
    query.since !== undefined ? gt(logs.id, query.since) : undefined,
    query.before !== undefined ? lt(logs.id, query.before) : undefined,
  ].filter((c) => c !== undefined);

  const polling = query.since !== undefined;
  const limit = polling ? 500 : query.limit;
  const rows = await getDb()
    .select({ log: logs, sourceName: sources.name })
    .from(logs)
    .innerJoin(sources, eq(sources.id, logs.sourceId))
    .where(and(...conditions))
    .orderBy(desc(logs.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const entries = page.map((r) => toEntry(r.log, r.sourceName));
  return { logs: entries, olderCursor: !polling && rows.length > limit ? (entries.at(-1)?.id ?? null) : null };
}

export async function getLog(id: number): Promise<LogEntry | null> {
  const [row] = await getDb().select({ log: logs, sourceName: sources.name }).from(logs).innerJoin(sources, eq(sources.id, logs.sourceId)).where(eq(logs.id, id)).limit(1);
  return row ? toEntry(row.log, row.sourceName) : null;
}

/** Log counts per time bucket and severity for the chart, with quiet buckets filled in as zeros. */
export async function queryStats(minutes: number, sourceId?: string): Promise<StatsResponse> {
  const bucketSec = bucketSizeFor(minutes);
  const toSec = Math.floor(Date.now() / 1000);
  const fromSec = toSec - minutes * 60;
  const result = await getDb().execute<{ t: string; severity: Severity; n: number }>(sql`
    select (floor(extract(epoch from ts) / ${bucketSec}) * ${bucketSec})::bigint as t, severity, count(*)::int as n
    from logs
    where ts >= to_timestamp(${fromSec}) and ts < to_timestamp(${toSec + 1})
      ${sourceId ? sql`and source_id = ${sourceId}` : sql``}
    group by 1, 2`);
  const rows: BucketRow[] = result.rows.map((r) => ({ t: Number(r.t), severity: r.severity, n: r.n }));
  const buckets = fillBuckets(rows, fromSec, toSec + 1, bucketSec);
  return { buckets, bucketSec, totals: totalsOf(buckets) };
}

/** Old logs are deleted as new ones arrive, so a public demo can never fill the database. */
export async function purgeOldLogs(hours = 48): Promise<void> {
  await getDb().execute(sql`delete from logs where ts < now() - make_interval(hours => ${hours})`);
}
