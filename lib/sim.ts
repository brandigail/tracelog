import type { LogMeta, Severity } from "@/types";

/** A log before it has a source or an id, as an app would send it. */
export interface GeneratedLog {
  severity: Severity;
  message: string;
  stack: string | null;
  meta: LogMeta;
  ts: Date;
}

/** Small deterministic generator so the seeded data looks the same every time and tests can rely on it. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Service = "api-gateway" | "auth-service" | "payments" | "search" | "worker";

interface Variant {
  message: string;
  meta: LogMeta;
}

const REGIONS = ["eu-west-1", "us-east-1", "af-south-1"];
const ROUTES = ["/api/orders", "/api/orders/:id", "/api/users/me", "/api/search", "/api/cart", "/api/checkout", "/api/products"];

const pick = <T>(rand: () => number, list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
const between = (rand: () => number, low: number, high: number): number => Math.round(low + rand() * (high - low));

const ERRORS: { message: string; error: string; service: Service }[] = [
  { message: "Unhandled exception while creating an order", error: "TypeError: Cannot read properties of undefined (reading 'id')", service: "api-gateway" },
  { message: "Database connection timeout after 5000ms", error: "Error: Connection terminated due to connection timeout", service: "api-gateway" },
  { message: "Payment provider returned 502", error: "PaymentGatewayError: upstream responded 502 Bad Gateway", service: "payments" },
  { message: "Failed to verify session token", error: "JsonWebTokenError: invalid signature", service: "auth-service" },
  { message: "Search index query failed", error: "SearchError: shard 3 unavailable", service: "search" },
  { message: "Job crashed and will be retried", error: "RangeError: Maximum call stack size exceeded", service: "worker" },
];

function stackFor(error: string, service: string, rand: () => number): string {
  const line = () => 10 + Math.floor(rand() * 400);
  return [
    error,
    `    at handle (/srv/${service}/src/handlers/index.ts:${line()}:${between(rand, 3, 40)})`,
    `    at runMiddleware (/srv/${service}/src/server.ts:${line()}:${between(rand, 3, 40)})`,
    `    at processTicksAndRejections (node:internal/process/task_queues:95:5)`,
    `    at async Router.dispatch (/srv/${service}/node_modules/router/index.js:${line()}:${between(rand, 3, 40)})`,
  ].join("\n");
}

function infoLog(rand: () => number, ts: Date): GeneratedLog {
  const route = pick(rand, ROUTES);
  const method = route.includes("checkout") || route.includes("cart") ? "POST" : "GET";
  const duration = between(rand, 8, 220);
  const service = pick<Service>(rand, ["api-gateway", "api-gateway", "auth-service", "search"]);
  const variants: Variant[] = [
    { message: `${method} ${route} 200 in ${duration}ms`, meta: { route, status: 200, durationMs: duration } },
    { message: `Cache hit for ${route}`, meta: { route, cache: "hit" } },
    { message: "User signed in", meta: { userId: `u_${between(rand, 1000, 9999)}`, method: pick(rand, ["password", "google", "magic-link"]) } },
    { message: "Background job completed", meta: { job: pick(rand, ["send-receipts", "sync-inventory", "rebuild-index"]), durationMs: between(rand, 200, 4000) } },
  ];
  const v = pick(rand, variants);
  return { severity: "INFO", message: v.message, stack: null, meta: { service, region: pick(rand, REGIONS), ...v.meta }, ts };
}

function warnLog(rand: () => number, ts: Date): GeneratedLog {
  const duration = between(rand, 600, 2400);
  const variants: (Variant & { service: Service })[] = [
    { message: `Slow query (${duration}ms) on orders`, service: "api-gateway", meta: { table: "orders", durationMs: duration } },
    { message: `Retrying request to inventory (attempt ${between(rand, 1, 3)} of 3)`, service: "worker", meta: { target: "inventory" } },
    { message: "Rate limit approaching for tenant", service: "api-gateway", meta: { tenant: `t_${between(rand, 10, 99)}`, usedPercent: between(rand, 82, 97) } },
    { message: "Cache miss ratio above 40%", service: "search", meta: { missRatio: between(rand, 41, 63) } },
    { message: "Deprecated API version still in use", service: "api-gateway", meta: { version: "v1", client: pick(rand, ["ios-3.1", "android-2.9", "partner-sync"]) } },
  ];
  const v = pick(rand, variants);
  return { severity: "WARN", message: v.message, stack: null, meta: { service: v.service, region: pick(rand, REGIONS), ...v.meta }, ts };
}

function errorLog(rand: () => number, ts: Date): GeneratedLog {
  const e = pick(rand, ERRORS);
  return { severity: "ERROR", message: e.message, stack: stackFor(e.error, e.service, rand), meta: { service: e.service, region: pick(rand, REGIONS), requestId: `req_${between(rand, 100000, 999999)}` }, ts };
}

/** One log of the given severity at a moment in time. */
export function makeLog(rand: () => number, severity: Severity, ts: Date): GeneratedLog {
  return severity === "ERROR" ? errorLog(rand, ts) : severity === "WARN" ? warnLog(rand, ts) : infoLog(rand, ts);
}

export interface Spike {
  /** Minutes before `now` at which the spike starts. */
  startMinutesAgo: number;
  durationMinutes: number;
}

export interface HistoryOptions {
  now: Date;
  hours: number;
  /** Logs per minute at the quietest and busiest points of the day. */
  seed?: number;
  total: number;
  spikes: Spike[];
}

/**
 * A believable stretch of history, oldest first: steady background traffic that is busier by day, plus short error
 * spikes. About 5% of normal traffic is warnings and 3% errors; inside a spike most logs are errors.
 */
export function generateHistory({ now, hours, total, spikes, seed = 11 }: HistoryOptions): GeneratedLog[] {
  const rand = mulberry32(seed);
  const spanMs = hours * 3_600_000;
  const startMs = now.getTime() - spanMs;
  const inSpike = (ms: number): boolean => spikes.some((s) => ms >= now.getTime() - s.startMinutesAgo * 60_000 && ms < now.getTime() - (s.startMinutesAgo - s.durationMinutes) * 60_000);
  const out: GeneratedLog[] = [];

  for (let i = 0; i < total; i++) {
    const ms = startMs + (i / total) * spanMs + rand() * (spanMs / total);
    // Quieter at night: skip some of the logs from the hours around 02:00 UTC.
    const hour = new Date(ms).getUTCHours();
    if ((hour >= 0 && hour < 5) && rand() < 0.5) continue;
    const roll = rand();
    const spike = inSpike(ms);
    const severity: Severity = spike ? (roll < 0.7 ? "ERROR" : roll < 0.85 ? "WARN" : "INFO") : roll < 0.03 ? "ERROR" : roll < 0.08 ? "WARN" : "INFO";
    out.push(makeLog(rand, severity, new Date(ms)));
  }
  return out;
}

/** A small live batch for the "send some traffic" button. `errors` simulates an incident. */
export function generateBatch(mode: "normal" | "errors", now: Date, seed: number): GeneratedLog[] {
  const rand = mulberry32(seed);
  const count = mode === "errors" ? 45 : 24;
  return Array.from({ length: count }, (_, i) => {
    const roll = rand();
    const severity: Severity = mode === "errors" ? (roll < 0.65 ? "ERROR" : roll < 0.85 ? "WARN" : "INFO") : roll < 0.05 ? "ERROR" : roll < 0.15 ? "WARN" : "INFO";
    return makeLog(rand, severity, new Date(now.getTime() - (count - i) * 150));
  });
}
