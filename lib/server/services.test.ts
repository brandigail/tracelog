import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db";
import { alertRules, sources } from "@/db/schema";
import { generateApiKey, hashKey, keyPrefix } from "@/lib/keys";
import { MAX_LOGS_PER_MINUTE } from "@/lib/schemas";
import { createRule, deleteRule, evaluateRules, listRules, setRuleEnabled, testRule } from "./alerts";
import { ApiError } from "./errors";
import { ingest } from "./ingest";
import { queryLogs, queryStats } from "./logs";
import { authenticate, createSource, listSources, MAX_SOURCES } from "./sources";

const hasDb = Boolean(process.env.DATABASE_URL);
const stamp = Date.now().toString(36);
const SLACK = "https://hooks.slack.com/services/TTESTTEST/BTESTTEST/secretSECRETsecret123";

async function fixtureSource(name: string): Promise<{ source: { id: string; name: string } }> {
  const key = generateApiKey();
  const [row] = await getDb().insert(sources).values({ name, apiKeyHash: hashKey(key), keyPrefix: keyPrefix(key) }).returning({ id: sources.id, name: sources.name });
  if (!row) throw new Error("could not create fixture source");
  return { source: row };
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error.status;
    throw error;
  }
  return 200;
}

const log = (severity: "INFO" | "WARN" | "ERROR", message: string, extra: Record<string, unknown> = {}) => ({ severity, message, meta: {}, ...extra }) as { severity: "INFO" | "WARN" | "ERROR"; message: string; meta: Record<string, string | number | boolean>; stack?: string | null; ts?: string };

describe.skipIf(!hasDb)("TraceLog services (real database)", () => {
  let sourceId = "";
  let apiKey = "";
  const names: string[] = [];
  const realFetch = globalThis.fetch;
  const webhookCalls: [string, RequestInit][] = [];
  // Only the webhook host is faked. Everything else (including the database driver, which uses fetch) goes through for real.
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://hooks.slack.com/")) {
      webhookCalls.push([url, init ?? {}]);
      return new Response("ok", { status: 200 });
    }
    return realFetch(input, init);
  };

  beforeAll(async () => {
    vi.stubGlobal("fetch", fakeFetch);
    const created = await createSource(`t-${stamp}`);
    sourceId = created.source.id;
    apiKey = created.apiKey;
    names.push(created.source.name);
  });

  afterEach(() => {
    webhookCalls.length = 0;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await getDb().delete(sources).where(inArray(sources.name, names));
  });

  describe("API keys", () => {
    it("identifies a source by its key and refuses anything else", async () => {
      expect((await authenticate(apiKey)).id).toBe(sourceId);
      expect(await status(authenticate("tl_wrong"))).toBe(401);
      expect(await status(authenticate(null))).toBe(401);
      expect(await status(authenticate(""))).toBe(401);
    });

    it("stores only a hash, never the key", async () => {
      const [row] = await getDb().select().from(sources).where(eq(sources.id, sourceId));
      expect(row?.apiKeyHash).not.toContain(apiKey);
      expect(row?.apiKeyHash).toHaveLength(64);
      expect(apiKey.startsWith(row?.keyPrefix ?? "?")).toBe(true);
    });

    it("refuses a duplicate source name", async () => {
      expect(await status(createSource(`T-${stamp}`))).toBe(409);
    });

    it("caps the number of sources so a public demo cannot be filled up", async () => {
      const made: string[] = [];
      try {
        for (let i = (await listSources()).length; i < MAX_SOURCES; i++) made.push((await createSource(`cap-${stamp}-${i}`)).source.name);
        expect(await status(createSource(`cap-${stamp}-over`))).toBe(409);
      } finally {
        names.push(...made);
        await getDb().delete(sources).where(inArray(sources.name, made));
      }
    });
  });

  describe("ingestion", () => {
    it("stores a batch with stack traces and meta, and reports what it accepted", async () => {
      const result = await ingest(sourceId, { logs: [log("INFO", "hello world"), log("ERROR", "boom", { stack: "Error: boom\n    at x (a.ts:1:1)", meta: { route: "/x", status: 500, retry: false } })] });
      expect(result.accepted).toBe(2);
      const found = await queryLogs({ sourceId, q: "boom", limit: 50 });
      expect(found.logs).toHaveLength(1);
      expect(found.logs[0]).toMatchObject({ severity: "ERROR", sourceName: `t-${stamp}`, meta: { route: "/x", status: 500, retry: false } });
      expect(found.logs[0]?.stack).toContain("at x");
    });

    it("rejects timestamps in the future and older than a week", async () => {
      const future = new Date(Date.now() + 10 * 60_000).toISOString();
      const old = new Date(Date.now() - 8 * 24 * 3_600_000).toISOString();
      expect(await status(ingest(sourceId, { logs: [log("INFO", "from the future", { ts: future })] }))).toBe(400);
      expect(await status(ingest(sourceId, { logs: [log("INFO", "ancient", { ts: old })] }))).toBe(400);
    });

    it("rate limits a source that sends too much in a minute", async () => {
      const burst = await fixtureSource(`burst-${stamp}`);
      names.push(burst.source.name);
      const batch = (n: number) => ({ logs: Array.from({ length: n }, (_, i) => log("INFO", `bulk ${i}`)) });
      for (let sent = 0; sent < MAX_LOGS_PER_MINUTE; sent += 500) await ingest(burst.source.id, batch(500));
      expect(await status(ingest(burst.source.id, batch(10)))).toBe(429);
    });
  });

  describe("querying", () => {
    it("pages with cursors, newest first, with no overlap and no skips", async () => {
      const paged = await fixtureSource(`paged-${stamp}`);
      names.push(paged.source.name);
      await ingest(paged.source.id, { logs: Array.from({ length: 12 }, (_, i) => log("INFO", `row ${String(i).padStart(2, "0")}`)) });
      const first = await queryLogs({ sourceId: paged.source.id, limit: 5 });
      expect(first.logs.map((l) => l.message)).toEqual(["row 11", "row 10", "row 09", "row 08", "row 07"]);
      const second = await queryLogs({ sourceId: paged.source.id, limit: 5, before: first.olderCursor ?? 0 });
      expect(second.logs.map((l) => l.message)).toEqual(["row 06", "row 05", "row 04", "row 03", "row 02"]);
      const third = await queryLogs({ sourceId: paged.source.id, limit: 5, before: second.olderCursor ?? 0 });
      expect(third.logs.map((l) => l.message)).toEqual(["row 01", "row 00"]);
      expect(third.olderCursor).toBeNull();
    });

    it("returns only newer logs when polling with since", async () => {
      const live = await fixtureSource(`live-${stamp}`);
      names.push(live.source.name);
      await ingest(live.source.id, { logs: [log("INFO", "before")] });
      const newest = (await queryLogs({ sourceId: live.source.id, limit: 1 })).logs[0]?.id ?? 0;
      expect((await queryLogs({ sourceId: live.source.id, since: newest, limit: 50 })).logs).toHaveLength(0);
      await ingest(live.source.id, { logs: [log("WARN", "after one"), log("ERROR", "after two")] });
      const polled = await queryLogs({ sourceId: live.source.id, since: newest, limit: 50 });
      expect(polled.logs.map((l) => l.message)).toEqual(["after two", "after one"]);
    });

    it("filters by severity and searches case-insensitively as plain text", async () => {
      const f = await fixtureSource(`filter-${stamp}`);
      names.push(f.source.name);
      await ingest(f.source.id, { logs: [log("INFO", "Cache HIT for /api/a"), log("WARN", "Slow query 100%_done"), log("ERROR", "Database Timeout"), log("ERROR", "other failure")] });
      expect((await queryLogs({ sourceId: f.source.id, severity: ["ERROR"], limit: 50 })).logs).toHaveLength(2);
      expect((await queryLogs({ sourceId: f.source.id, severity: ["ERROR", "WARN"], limit: 50 })).logs).toHaveLength(3);
      expect((await queryLogs({ sourceId: f.source.id, q: "database timeout", limit: 50 })).logs.map((l) => l.message)).toEqual(["Database Timeout"]);
      expect((await queryLogs({ sourceId: f.source.id, q: "100%_done", limit: 50 })).logs).toHaveLength(1);
      expect((await queryLogs({ sourceId: f.source.id, q: "%", limit: 50 })).logs).toHaveLength(1); // a literal %, not a wildcard
    });

    it("buckets the last hour by severity with quiet minutes as zeros", async () => {
      const stats = await queryStats(60, sourceId);
      expect(stats.buckets).toHaveLength(61);
      expect(stats.totals.total).toBeGreaterThanOrEqual(2);
      expect(stats.totals.ERROR).toBeGreaterThanOrEqual(1);
      expect(stats.buckets.some((b) => b.INFO + b.WARN + b.ERROR === 0)).toBe(true);
    });
  });

  describe("alert rules", () => {
    it("accepts only Discord and Slack webhooks and never returns the secret", async () => {
      expect(await status(createRule({ sourceId, severity: "ERROR", threshold: 5, windowSec: 60, webhookUrl: "https://evil.example/hook" }))).toBe(400);
      expect(await status(createRule({ sourceId, severity: "ERROR", threshold: 5, windowSec: 60, webhookUrl: "http://169.254.169.254/latest" }))).toBe(400);
      const rule = await createRule({ sourceId, severity: "ERROR", threshold: 5, windowSec: 60, webhookUrl: SLACK });
      const listed = (await listRules()).find((r) => r.id === rule.id);
      expect(JSON.stringify(listed)).not.toContain("secretSECRET");
      expect(listed?.webhookMasked).toBe("https://hooks.slack.com/…t123");
      expect(listed?.webhookKind).toBe("slack");
      await deleteRule(rule.id);
    });

    it("fires once when the threshold is crossed, not again inside the window, and respects enabled", async () => {
      const alerted = await fixtureSource(`alert-${stamp}`);
      names.push(alerted.source.name);
      const id = alerted.source.id;
      const rule = await createRule({ sourceId: id, severity: "ERROR", threshold: 4, windowSec: 120, webhookUrl: SLACK });

      await ingest(id, { logs: Array.from({ length: 3 }, (_, i) => log("ERROR", `below ${i}`)) });
      expect(webhookCalls).toHaveLength(0); // 3 < 4

      const crossing = await ingest(id, { logs: [log("ERROR", "the fourth error"), log("INFO", "noise")] });
      expect(crossing.alertsFired).toBe(1);
      expect(webhookCalls).toHaveLength(1);
      const [calledUrl, init] = webhookCalls[0] as [string, RequestInit];
      expect(calledUrl).toBe(SLACK);
      expect(init.redirect).toBe("manual");
      expect(String(init.body)).toContain("ERROR spike on");
      expect(String(init.body)).toContain("the fourth error");

      await ingest(id, { logs: Array.from({ length: 5 }, (_, i) => log("ERROR", `more ${i}`)) });
      expect(webhookCalls).toHaveLength(1); // still inside the 120s window

      // Two overlapping evaluations after the window must still send exactly one alert.
      await getDb().update(alertRules).set({ lastFiredAt: new Date(Date.now() - 200_000) }).where(eq(alertRules.id, rule.id));
      const both = await Promise.all([evaluateRules(id), evaluateRules(id)]);
      expect(both[0] + both[1]).toBe(1);
      expect(webhookCalls).toHaveLength(2);

      await setRuleEnabled(rule.id, false);
      await getDb().update(alertRules).set({ lastFiredAt: null }).where(eq(alertRules.id, rule.id));
      expect(await evaluateRules(id)).toBe(0);
    });

    it("limits test sends to one per 30 seconds", async () => {
      const t = await fixtureSource(`test-${stamp}`);
      names.push(t.source.name);
      const rule = await createRule({ sourceId: t.source.id, severity: "WARN", threshold: 2, windowSec: 60, webhookUrl: SLACK });
      expect((await testRule(rule.id)).ok).toBe(true);
      expect(String((webhookCalls[0] as [string, RequestInit])[1].body)).toContain("TraceLog test alert");
      expect(await status(testRule(rule.id))).toBe(429);
      expect(webhookCalls).toHaveLength(1);
    });
  });

});
