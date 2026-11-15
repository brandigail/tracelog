import { createRule, listRules } from "@/lib/server/alerts";
import { readBody, toResponse } from "@/lib/server/errors";
import { createRuleSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** Rules are returned with their webhook masked: the URL is a secret and never leaves the server. */
export async function GET() {
  try {
    return Response.json({ rules: await listRules() });
  } catch (error) {
    return toResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    return Response.json({ rule: await createRule(await readBody(request, createRuleSchema)) }, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
