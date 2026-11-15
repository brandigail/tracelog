import { ApiError, readBody, toResponse } from "@/lib/server/errors";
import { ingest } from "@/lib/server/ingest";
import { authenticate } from "@/lib/server/sources";
import { ingestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

function presentedKey(request: Request): string | null {
  const header = request.headers.get("x-api-key");
  if (header) return header.trim();
  const bearer = request.headers.get("authorization");
  return bearer?.toLowerCase().startsWith("bearer ") ? bearer.slice(7).trim() : null;
}

/**
 * POST /api/ingest with an `x-api-key` header (or `Authorization: Bearer <key>`) and a JSON body
 * `{ "logs": [{ "severity": "ERROR", "message": "...", "stack": "...", "meta": {}, "ts": "ISO-8601" }] }`.
 */
export async function POST(request: Request) {
  try {
    // The key is checked before the body is read, so an unauthenticated caller never gets as far as parsing.
    const source = await authenticate(presentedKey(request));
    const input = await readBody(request, ingestSchema);
    return Response.json(await ingest(source.id, input), { status: 202 });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return Response.json({ error: error.message }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    return toResponse(error);
  }
}
