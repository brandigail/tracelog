import { readQuery, toResponse } from "@/lib/server/errors";
import { queryLogs } from "@/lib/server/logs";
import { logQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** GET /api/logs?sourceId&severity=ERROR,WARN&q=text&since=<id> (live) or &before=<id> (older page). */
export async function GET(request: Request) {
  try {
    return Response.json(await queryLogs(readQuery(request, logQuerySchema)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toResponse(error);
  }
}
