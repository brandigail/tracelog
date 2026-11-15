import { readBody, toResponse } from "@/lib/server/errors";
import { createSource, listSources } from "@/lib/server/sources";
import { createSourceSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ sources: await listSources() });
  } catch (error) {
    return toResponse(error);
  }
}

/** The response carries the new API key exactly once; only its hash is stored. */
export async function POST(request: Request) {
  try {
    const { name } = await readBody(request, createSourceSchema);
    return Response.json(await createSource(name), { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}
