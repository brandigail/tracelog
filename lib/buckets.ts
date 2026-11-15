import type { BucketPoint, Severity } from "@/types";

export interface BucketRow {
  /** Bucket start in epoch seconds, already aligned to the bucket size. */
  t: number;
  severity: Severity;
  n: number;
}

/**
 * Bucket size in seconds for a range in minutes. The two numbers are equal on purpose: a range of N minutes is
 * N*60 seconds, so N-second buckets always give exactly 60 points on the chart, however long the range.
 */
export function bucketSizeFor(minutes: number): number {
  return Math.max(15, Math.round(minutes));
}

/**
 * Turns sparse (bucket, severity, count) rows into a continuous series from `fromSec` to `toSec`,
 * with zeros for buckets that had no logs, so a quiet minute shows as a dip and not as a gap in the line.
 */
export function fillBuckets(rows: readonly BucketRow[], fromSec: number, toSec: number, bucketSec: number): BucketPoint[] {
  const start = Math.floor(fromSec / bucketSec) * bucketSec;
  const points = new Map<number, BucketPoint>();
  for (let t = start; t < toSec; t += bucketSec) points.set(t, { t, INFO: 0, WARN: 0, ERROR: 0 });
  for (const row of rows) {
    const point = points.get(row.t);
    if (point) point[row.severity] += row.n;
  }
  return [...points.values()];
}

export function totalsOf(buckets: readonly BucketPoint[]): { INFO: number; WARN: number; ERROR: number; total: number } {
  const totals = { INFO: 0, WARN: 0, ERROR: 0, total: 0 };
  for (const b of buckets) {
    totals.INFO += b.INFO;
    totals.WARN += b.WARN;
    totals.ERROR += b.ERROR;
  }
  totals.total = totals.INFO + totals.WARN + totals.ERROR;
  return totals;
}
