import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { getDb } from "@/db";
import { alertRules, logs, sources } from "@/db/schema";
import type { createRuleSchema } from "@/lib/schemas";
import { buildPayload, maskWebhook, sendWebhook, validateWebhookUrl } from "@/lib/webhook";
import type { AlertRule } from "@/types";
import { ApiError } from "./errors";

/** Anyone can add rules on this public demo, so the total is capped. */
export const MAX_RULES = 12;
type RuleRow = typeof alertRules.$inferSelect;

function toRule(row: RuleRow, sourceName: string): AlertRule {
  const check = validateWebhookUrl(row.webhookUrl);
  return {
    id: row.id,
    sourceId: row.sourceId,
    sourceName,
    severity: row.severity,
    threshold: row.threshold,
    windowSec: row.windowSec,
    // The URL is a secret: only a masked copy ever leaves the server.
    webhookMasked: maskWebhook(row.webhookUrl),
    webhookKind: check.ok ? check.kind : "discord",
    enabled: row.enabled,
    lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
  };
}

export async function listRules(): Promise<AlertRule[]> {
  const rows = await getDb().select({ rule: alertRules, sourceName: sources.name }).from(alertRules).innerJoin(sources, eq(sources.id, alertRules.sourceId)).orderBy(asc(alertRules.createdAt));
  return rows.map((r) => toRule(r.rule, r.sourceName));
}

export async function createRule(input: z.infer<typeof createRuleSchema>): Promise<AlertRule> {
  const check = validateWebhookUrl(input.webhookUrl);
  if (!check.ok) throw new ApiError(400, check.error);
  const db = getDb();
  const [source] = await db.select().from(sources).where(eq(sources.id, input.sourceId)).limit(1);
  if (!source) throw new ApiError(404, "That source does not exist.");
  const existing = await db.select({ id: alertRules.id }).from(alertRules);
  if (existing.length >= MAX_RULES) throw new ApiError(409, `This demo allows up to ${MAX_RULES} alert rules.`);
  const [created] = await db.insert(alertRules).values(input).returning();
  if (!created) throw new ApiError(500, "Could not create the rule");
  return toRule(created, source.name);
}

export async function setRuleEnabled(id: string, enabled: boolean): Promise<void> {
  const updated = await getDb().update(alertRules).set({ enabled }).where(eq(alertRules.id, id)).returning({ id: alertRules.id });
  if (updated.length === 0) throw new ApiError(404, "Rule not found");
}

export async function deleteRule(id: string): Promise<void> {
  const removed = await getDb().delete(alertRules).where(eq(alertRules.id, id)).returning({ id: alertRules.id });
  if (removed.length === 0) throw new ApiError(404, "Rule not found");
}

const TEST_COOLDOWN_SEC = 30;

/** Sends a clearly labelled test message. A rule can only be tested every 30 seconds, so the button can't be used to spam a webhook. */
export async function testRule(id: string): Promise<{ ok: boolean; status: number }> {
  const db = getDb();
  const [row] = await db.select({ rule: alertRules, sourceName: sources.name }).from(alertRules).innerJoin(sources, eq(sources.id, alertRules.sourceId)).where(eq(alertRules.id, id)).limit(1);
  if (!row) throw new ApiError(404, "Rule not found");
  const claimed = await db
    .update(alertRules)
    .set({ lastFiredAt: sql`now()` })
    .where(and(eq(alertRules.id, id), sql`(${alertRules.lastFiredAt} is null or ${alertRules.lastFiredAt} < now() - make_interval(secs => ${TEST_COOLDOWN_SEC}))`))
    .returning({ id: alertRules.id });
  if (claimed.length === 0) throw new ApiError(429, `Wait ${TEST_COOLDOWN_SEC} seconds between tests.`);
  const check = validateWebhookUrl(row.rule.webhookUrl);
  if (!check.ok) throw new ApiError(400, check.error);
  return sendWebhook(row.rule.webhookUrl, buildPayload(check.kind, { sourceName: row.sourceName, severity: row.rule.severity, count: row.rule.threshold, threshold: row.rule.threshold, windowSec: row.rule.windowSec }, true));
}

/**
 * Called after logs are stored. A rule fires when its source has logged at least `threshold` entries of its severity
 * inside `windowSec`, and at most once per window: the rule is claimed with a single conditional UPDATE, so two
 * overlapping requests can never both send the alert.
 */
export async function evaluateRules(sourceId: string): Promise<number> {
  const db = getDb();
  const rules = await db.select({ rule: alertRules, sourceName: sources.name }).from(alertRules).innerJoin(sources, eq(sources.id, alertRules.sourceId)).where(and(eq(alertRules.sourceId, sourceId), eq(alertRules.enabled, true)));
  let fired = 0;

  for (const { rule, sourceName } of rules) {
    const [counted] = await db
      .select({ n: sql<number>`count(*)::int`, latest: sql<string | null>`(array_agg(${logs.message} order by ${logs.id} desc))[1]` })
      .from(logs)
      .where(and(eq(logs.sourceId, sourceId), eq(logs.severity, rule.severity), sql`${logs.ts} >= now() - make_interval(secs => ${rule.windowSec})`));
    if (!counted || counted.n < rule.threshold) continue;

    const claimed = await db
      .update(alertRules)
      .set({ lastFiredAt: sql`now()` })
      .where(and(eq(alertRules.id, rule.id), sql`(${alertRules.lastFiredAt} is null or ${alertRules.lastFiredAt} < now() - make_interval(secs => ${rule.windowSec}))`))
      .returning({ id: alertRules.id });
    if (claimed.length === 0) continue;

    const check = validateWebhookUrl(rule.webhookUrl);
    if (!check.ok) continue;
    fired += 1;
    await sendWebhook(rule.webhookUrl, buildPayload(check.kind, { sourceName, severity: rule.severity, count: counted.n, threshold: rule.threshold, windowSec: rule.windowSec, sample: counted.latest ?? undefined }));
  }
  return fired;
}
