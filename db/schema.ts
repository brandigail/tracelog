import { sql } from "drizzle-orm";
import { bigserial, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const severityEnum = pgEnum("severity", ["INFO", "WARN", "ERROR"]);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  /** SHA-256 of the API key. Keys are long random strings, so a fast hash is fine and lets the check run in constant time. */
  apiKeyHash: text("api_key_hash").notNull(),
  /** The first few characters of the key, so people can tell keys apart without ever seeing the key again. */
  keyPrefix: text("key_prefix").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const logs = pgTable(
  "logs",
  {
    /** Growing id: the polling and paging cursor ("everything after / before this id"). Never OFFSET. */
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    severity: severityEnum("severity").notNull(),
    message: text("message").notNull(),
    stack: text("stack"),
    meta: jsonb("meta").$type<Record<string, string | number | boolean>>().notNull().default({}),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("logs_source_ts_idx").on(t.sourceId, t.ts.desc()),
    index("logs_severity_ts_idx").on(t.severity, t.ts.desc()),
    index("logs_source_id_idx").on(t.sourceId, t.id.desc()),
    index("logs_ts_idx").on(t.ts.desc()),
  ],
);

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    severity: severityEnum("severity").notNull(),
    threshold: integer("threshold").notNull(),
    windowSec: integer("window_sec").notNull(),
    /** A secret: stored server-side and only ever returned masked. */
    webhookUrl: text("webhook_url").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alert_rules_source_idx").on(t.sourceId)],
);
