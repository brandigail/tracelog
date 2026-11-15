export type Severity = "INFO" | "WARN" | "ERROR";

export const SEVERITIES: readonly Severity[] = ["INFO", "WARN", "ERROR"];

export type LogMeta = Record<string, string | number | boolean>;

/** A source never exposes its key hash; `keyPrefix` is just enough to recognise a key. */
export interface Source {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
}

export interface LogEntry {
  /** A growing integer, used as the polling and paging cursor. */
  id: number;
  sourceId: string;
  sourceName: string;
  severity: Severity;
  message: string;
  stack: string | null;
  meta: LogMeta;
  ts: string;
}

/** The webhook URL is a secret, so the client only ever sees a masked copy. */
export interface AlertRule {
  id: string;
  sourceId: string;
  sourceName: string;
  severity: Severity;
  threshold: number;
  windowSec: number;
  webhookMasked: string;
  webhookKind: "discord" | "slack";
  enabled: boolean;
  lastFiredAt: string | null;
}

export interface LogsResponse {
  /** Newest first. */
  logs: LogEntry[];
  /** Pass as `before` to get the next older page, or null when there is no more. */
  olderCursor: number | null;
}

export interface BucketPoint {
  /** Start of the bucket, in epoch seconds. */
  t: number;
  INFO: number;
  WARN: number;
  ERROR: number;
}

export interface StatsResponse {
  buckets: BucketPoint[];
  bucketSec: number;
  totals: { INFO: number; WARN: number; ERROR: number; total: number };
}
