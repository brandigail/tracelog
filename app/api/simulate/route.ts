import { readBody, toResponse } from "@/lib/server/errors";
import { simulate } from "@/lib/server/ingest";
import { simulateSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** POST /api/simulate {"mode":"normal"|"errors"}: sends a burst of realistic traffic for the demo source. */
export async function POST(request: Request) {
  try {
    const { mode } = await readBody(request, simulateSchema);
    return Response.json(await simulate(mode), { status: 202 });
  } catch (error) {
    return toResponse(error);
  }
}
