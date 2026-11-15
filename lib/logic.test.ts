import { describe, expect, it } from "vitest";
import { bucketSizeFor, fillBuckets, totalsOf } from "./buckets";
import { escapeLike, splitMatches } from "./highlight";
import { generateBatch, generateHistory } from "./sim";
import { generateApiKey, hashKey, keyPrefix, verifyKey } from "./keys";
import { buildPayload, maskWebhook, validateWebhookUrl } from "./webhook";
import { ingestSchema, logQuerySchema, createRuleSchema } from "./schemas";

describe("api keys", () => {
  it("generates long unique keys and verifies only the right one", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).toMatch(/^tl_[\w-]{32}$/);
    expect(a).not.toBe(b);
    const hash = hashKey(a);
    expect(hash).toHaveLength(64);
    expect(verifyKey(a, hash)).toBe(true);
    expect(verifyKey(b, hash)).toBe(false);
    expect(verifyKey("", hash)).toBe(false);
    expect(verifyKey(a, "not-hex")).toBe(false);
    expect(keyPrefix(a)).toBe(a.slice(0, 7));
  });
});

describe("webhook safety", () => {
  const discord = "https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-123";
  const slack = "https://hooks.slack.com/services/T0001/B0002/xyzXYZ123";

  it("accepts real Discord and Slack webhooks", () => {
    expect(validateWebhookUrl(discord)).toEqual({ ok: true, kind: "discord" });
    expect(validateWebhookUrl(slack)).toEqual({ ok: true, kind: "slack" });
  });

  it.each([
    "http://discord.com/api/webhooks/123/abc",
    "https://evil.example/api/webhooks/123/abc",
    "https://discord.com.evil.example/api/webhooks/123/abc",
    "https://discord.com@evil.example/api/webhooks/123/abc",
    "https://discord.com:8443/api/webhooks/123/abc",
    "https://discord.com/api/other/123/abc",
    "https://hooks.slack.com/services/only-two/parts",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/api/webhooks/1/a",
    "ftp://discord.com/api/webhooks/1/a",
    "not a url",
  ])("rejects %s", (url) => {
    expect(validateWebhookUrl(url).ok).toBe(false);
  });

  it("never returns the secret part of a webhook", () => {
    const masked = maskWebhook(discord);
    expect(masked).toBe("https://discord.com/…-123");
    expect(masked).not.toContain("abcDEF");
    expect(masked).not.toContain("123456789012345678");
  });

  it("builds a payload for each service", () => {
    const ctx = { sourceName: "demo-app", severity: "ERROR" as const, count: 31, threshold: 20, windowSec: 120, sample: "Database connection timeout" };
    const d = buildPayload("discord", ctx) as { embeds: { title: string; description: string }[] };
    expect(d.embeds[0]?.title).toBe("ERROR spike on demo-app");
    expect(d.embeds[0]?.description).toContain("31 ERROR logs in the last 2 minutes");
    expect((buildPayload("slack", ctx) as { text: string }).text).toContain("*ERROR spike on demo-app*");
    expect((buildPayload("slack", ctx, true) as { text: string }).text).toContain("TraceLog test alert");
  });
});

describe("search highlighting", () => {
  it("splits on every case-insensitive match", () => {
    expect(splitMatches("Timeout talking to DB, timeout again", "timeout")).toEqual([
      { text: "Timeout", match: true },
      { text: " talking to DB, ", match: false },
      { text: "timeout", match: true },
      { text: " again", match: false },
    ]);
  });

  it("treats the query as plain text, not a pattern", () => {
    expect(splitMatches("cost (usd) is 5.00", "(usd)")).toEqual([
      { text: "cost ", match: false },
      { text: "(usd)", match: true },
      { text: " is 5.00", match: false },
    ]);
    expect(splitMatches("abc", ".*").every((s) => !s.match)).toBe(true);
  });

  it("returns the text untouched for an empty or missing query", () => {
    expect(splitMatches("hello", "")).toEqual([{ text: "hello", match: false }]);
    expect(splitMatches("hello", "   ")).toEqual([{ text: "hello", match: false }]);
    expect(splitMatches("hello", "zzz")).toEqual([{ text: "hello", match: false }]);
  });

  it("escapes LIKE wildcards", () => {
    expect(escapeLike("100%_done\\")).toBe("100\\%\\_done\\\\");
  });
});

describe("time buckets", () => {
  it("gives about 60 points for any range", () => {
    for (const minutes of [15, 60, 360, 1440]) expect((minutes * 60) / bucketSizeFor(minutes)).toBe(60);
  });

  it("fills quiet buckets with zeros and sums rows into the right bucket", () => {
    const series = fillBuckets(
      [
        { t: 120, severity: "ERROR", n: 3 },
        { t: 120, severity: "INFO", n: 10 },
        { t: 240, severity: "WARN", n: 1 },
        { t: 9999, severity: "INFO", n: 99 }, // outside the range
      ],
      100,
      300,
      60,
    );
    expect(series.map((p) => p.t)).toEqual([60, 120, 180, 240]);
    expect(series[1]).toEqual({ t: 120, INFO: 10, WARN: 0, ERROR: 3 });
    expect(series[2]).toEqual({ t: 180, INFO: 0, WARN: 0, ERROR: 0 });
    expect(totalsOf(series)).toEqual({ INFO: 10, WARN: 1, ERROR: 3, total: 14 });
  });
});

describe("log generator", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("is deterministic and oldest first", () => {
    const options = { now, hours: 24, total: 400, spikes: [{ startMinutesAgo: 90, durationMinutes: 10 }], seed: 5 };
    const a = generateHistory(options);
    const b = generateHistory(options);
    expect(a.map((l) => l.message)).toEqual(b.map((l) => l.message));
    expect(a.map((l) => l.ts.getTime())).toEqual([...a.map((l) => l.ts.getTime())].sort((x, y) => x - y));
  });

  it("stays inside the window and mostly INFO, with errors carrying stack traces", () => {
    const logs = generateHistory({ now, hours: 24, total: 1500, spikes: [], seed: 7 });
    expect(logs.every((l) => l.ts <= now && l.ts >= new Date(now.getTime() - 24 * 3_600_000))).toBe(true);
    const info = logs.filter((l) => l.severity === "INFO").length / logs.length;
    expect(info).toBeGreaterThan(0.85);
    const errors = logs.filter((l) => l.severity === "ERROR");
    expect(errors.length).toBeGreaterThan(5);
    expect(errors.every((l) => (l.stack ?? "").includes("\n    at "))).toBe(true);
    expect(logs.filter((l) => l.severity !== "ERROR").every((l) => l.stack === null)).toBe(true);
  });

  it("makes an error spike visible", () => {
    const logs = generateHistory({ now, hours: 24, total: 3000, spikes: [{ startMinutesAgo: 120, durationMinutes: 15 }], seed: 9 });
    const from = now.getTime() - 120 * 60_000;
    const inside = logs.filter((l) => l.ts.getTime() >= from && l.ts.getTime() < from + 15 * 60_000);
    const share = inside.filter((l) => l.severity === "ERROR").length / Math.max(1, inside.length);
    expect(share).toBeGreaterThan(0.4);
  });

  it("makes a live batch, with more errors in incident mode, that every schema accepts", () => {
    const normal = generateBatch("normal", now, 1);
    const incident = generateBatch("errors", now, 1);
    expect(incident.filter((l) => l.severity === "ERROR").length).toBeGreaterThan(normal.filter((l) => l.severity === "ERROR").length);
    const parsed = ingestSchema.safeParse({ logs: incident.map((l) => ({ severity: l.severity, message: l.message, stack: l.stack, meta: l.meta, ts: l.ts.toISOString() })) });
    expect(parsed.success).toBe(true);
  });
});

describe("request schemas", () => {
  it("limits batch size, message length and meta keys", () => {
    expect(ingestSchema.safeParse({ logs: [] }).success).toBe(false);
    expect(ingestSchema.safeParse({ logs: Array.from({ length: 501 }, () => ({ severity: "INFO", message: "x" })) }).success).toBe(false);
    expect(ingestSchema.safeParse({ logs: [{ severity: "INFO", message: "x".repeat(2001) }] }).success).toBe(false);
    expect(ingestSchema.safeParse({ logs: [{ severity: "LOUD", message: "x" }] }).success).toBe(false);
    const manyKeys = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i]));
    expect(ingestSchema.safeParse({ logs: [{ severity: "INFO", message: "x", meta: manyKeys }] }).success).toBe(false);
    expect(ingestSchema.safeParse({ logs: [{ severity: "INFO", message: "ok", meta: { a: 1, b: "two", c: true } }] }).success).toBe(true);
  });

  it("parses comma separated severities and rejects unknown ones", () => {
    expect(logQuerySchema.parse({ severity: "error, warn" }).severity).toEqual(["ERROR", "WARN"]);
    expect(logQuerySchema.safeParse({ severity: "debug" }).success).toBe(false);
    expect(logQuerySchema.safeParse({ before: "0" }).success).toBe(false);
    expect(logQuerySchema.parse({}).limit).toBe(50);
  });

  it("bounds alert rules", () => {
    const base = { sourceId: "3f0e2f2a-6b3c-4f43-9d3f-0a3f5bde1a11", severity: "ERROR", threshold: 20, windowSec: 120, webhookUrl: "https://hooks.slack.com/services/A/B/C" };
    expect(createRuleSchema.safeParse(base).success).toBe(true);
    expect(createRuleSchema.safeParse({ ...base, threshold: 0 }).success).toBe(false);
    expect(createRuleSchema.safeParse({ ...base, windowSec: 5 }).success).toBe(false);
  });
});
