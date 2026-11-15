import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logs, sources } from "../db/schema";
import { generateApiKey, hashKey, keyPrefix } from "../lib/keys";
import { generateHistory, type Spike } from "../lib/sim";

interface SourcePlan {
  name: string;
  total: number;
  seed: number;
  spikes: Spike[];
}

// The demo app has a spike only minutes ago, so the dashboard shows something interesting on first load.
const PLANS: SourcePlan[] = [
  { name: "demo-app", total: 1400, seed: 21, spikes: [{ startMinutesAgo: 14, durationMinutes: 7 }, { startMinutesAgo: 190, durationMinutes: 12 }, { startMinutesAgo: 560, durationMinutes: 9 }] },
  { name: "billing-worker", total: 420, seed: 22, spikes: [{ startMinutesAgo: 360, durationMinutes: 15 }] },
  { name: "web-frontend", total: 260, seed: 23, spikes: [{ startMinutesAgo: 95, durationMinutes: 6 }] },
];

/** Wipes and reseeds the demo workspace: three sources and about 2,000 logs across the last 24 hours. */
async function main(): Promise<void> {
  const db = getDb();
  const demoKey = process.env.INGEST_KEY;
  if (!demoKey) throw new Error("INGEST_KEY is not set. Put one in .env.local first.");
  await db.execute(sql`truncate table alert_rules, logs, sources restart identity cascade`);

  const now = new Date();
  let total = 0;
  for (const plan of PLANS) {
    const key = plan.name === "demo-app" ? demoKey : generateApiKey();
    const [source] = await db.insert(sources).values({ name: plan.name, apiKeyHash: hashKey(key), keyPrefix: keyPrefix(key) }).returning({ id: sources.id });
    if (!source) throw new Error("source insert failed");

    const history = generateHistory({ now, hours: 24, total: plan.total, spikes: plan.spikes, seed: plan.seed });
    for (let i = 0; i < history.length; i += 250) {
      // created_at follows the event time, so seeded history never counts against a source's per-minute rate limit.
      await db.insert(logs).values(history.slice(i, i + 250).map((l) => ({ sourceId: source.id, severity: l.severity, message: l.message, stack: l.stack, meta: l.meta, ts: l.ts, createdAt: l.ts })));
    }
    total += history.length;
  }
  console.log(`Seeded ${PLANS.length} sources and ${total} logs.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
