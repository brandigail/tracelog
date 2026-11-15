import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sources } from "@/db/schema";
import { generateApiKey, hashKey, keyPrefix, verifyKey } from "@/lib/keys";
import type { Source } from "@/types";
import { ApiError } from "./errors";

export const DEMO_SOURCE_NAME = "demo-app";
/** Anyone can create a source on this public demo, so the total is capped to keep the database healthy. */
export const MAX_SOURCES = 6;

type SourceRow = typeof sources.$inferSelect;

const toSource = (row: SourceRow): Source => ({ id: row.id, name: row.name, keyPrefix: row.keyPrefix, createdAt: row.createdAt.toISOString() });

export async function listSources(): Promise<Source[]> {
  const rows = await getDb().select().from(sources).orderBy(asc(sources.createdAt));
  return rows.map(toSource);
}

/** Creates a source and returns its key once. Only a hash is stored, so the key can never be shown again. */
export async function createSource(name: string): Promise<{ source: Source; apiKey: string }> {
  const db = getDb();
  const existing = await db.select({ id: sources.id, name: sources.name }).from(sources);
  if (existing.length >= MAX_SOURCES) throw new ApiError(409, `This demo allows up to ${MAX_SOURCES} sources.`);
  if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new ApiError(409, `There is already a source called ${name}.`);
  const apiKey = generateApiKey();
  const [created] = await db.insert(sources).values({ name, apiKeyHash: hashKey(apiKey), keyPrefix: keyPrefix(apiKey) }).returning();
  if (!created) throw new ApiError(500, "Could not create the source");
  return { source: toSource(created), apiKey };
}

/** Finds the source a presented key belongs to. Every stored hash is checked in constant time. */
export async function authenticate(presented: string | null): Promise<SourceRow> {
  if (!presented) throw new ApiError(401, "Send your API key in the x-api-key header.");
  const rows = await getDb().select().from(sources);
  let match: SourceRow | undefined;
  for (const row of rows) if (verifyKey(presented, row.apiKeyHash) && !match) match = row;
  if (!match) throw new ApiError(401, "That API key is not valid.");
  return match;
}

export async function findDemoSource(): Promise<SourceRow> {
  const [row] = await getDb().select().from(sources).where(eq(sources.name, DEMO_SOURCE_NAME)).limit(1);
  if (!row) throw new ApiError(404, "The demo data has not been set up. Run npm run db:seed.");
  return row;
}
