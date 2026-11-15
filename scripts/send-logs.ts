import { generateBatch } from "../lib/sim";

/**
 * Sends simulated traffic to a running TraceLog, the way a real app would: over HTTP with an API key.
 *   npm run simulate -- --url http://localhost:3003 --batches 5 --mode errors
 */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at !== -1 ? (process.argv[at + 1] ?? fallback) : fallback;
}

async function main(): Promise<void> {
  const url = arg("url", "http://localhost:3003").replace(/\/$/, "");
  const batches = Number(arg("batches", "3"));
  const mode = arg("mode", "normal") === "errors" ? "errors" : "normal";
  const key = process.env.INGEST_KEY;
  if (!key) throw new Error("INGEST_KEY is not set (it is in .env.local).");

  for (let i = 0; i < batches; i++) {
    const logs = generateBatch(mode, new Date(), Date.now() % 100_000).map((l) => ({ severity: l.severity, message: l.message, stack: l.stack, meta: l.meta, ts: l.ts.toISOString() }));
    const response = await fetch(`${url}/api/ingest`, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": key }, body: JSON.stringify({ logs }) });
    console.log(`batch ${i + 1}/${batches}: ${response.status} ${await response.text()}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
