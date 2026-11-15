import { readQuery, toResponse } from "@/lib/server/errors";
import { queryStats } from "@/lib/server/logs";
import { statsQuerySchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { minutes, sourceId } = readQuery(request, statsQuerySchema);
    return Response.json(await queryStats(minutes, sourceId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return toResponse(error);
  }
}
