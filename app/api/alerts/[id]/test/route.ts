import { z } from "zod";
import { testRule } from "@/lib/server/alerts";
import { ApiError, toResponse } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

/** Sends a labelled test message to the rule's webhook (at most once every 30 seconds per rule). */
export async function POST(_request: Request, ctx: RouteContext<"/api/alerts/[id]/test">) {
  try {
    const parsed = z.uuid().safeParse((await ctx.params).id);
    if (!parsed.success) throw new ApiError(400, "Invalid rule id");
    return Response.json(await testRule(parsed.data));
  } catch (error) {
    return toResponse(error);
  }
}
