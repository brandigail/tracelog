import { deleteRule, setRuleEnabled } from "@/lib/server/alerts";
import { readBody, toResponse } from "@/lib/server/errors";
import { updateRuleSchema } from "@/lib/schemas";
import { z } from "zod";
import { ApiError } from "@/lib/server/errors";

export const dynamic = "force-dynamic";

const idSchema = z.uuid();

async function ruleId(ctx: RouteContext<"/api/alerts/[id]">): Promise<string> {
  const parsed = idSchema.safeParse((await ctx.params).id);
  if (!parsed.success) throw new ApiError(400, "Invalid rule id");
  return parsed.data;
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/alerts/[id]">) {
  try {
    const id = await ruleId(ctx);
    await setRuleEnabled(id, (await readBody(request, updateRuleSchema)).enabled);
    return Response.json({ ok: true });
  } catch (error) {
    return toResponse(error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/alerts/[id]">) {
  try {
    await deleteRule(await ruleId(ctx));
    return Response.json({ ok: true });
  } catch (error) {
    return toResponse(error);
  }
}
