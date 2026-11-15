export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Turns any thrown error into a JSON response, so route handlers stay short and never leak internals. */
export function toResponse(error: unknown): Response {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Unhandled error:", error instanceof Error ? error.message : "unknown");
  return Response.json({ error: "Something went wrong" }, { status: 500 });
}

interface Parser<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } };
}

export async function readBody<T>(request: Request, schema: Parser<T>): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json")) throw new ApiError(415, "Content-Type must be application/json");
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}

export function readQuery<T>(request: Request, schema: Parser<T>): T {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0]?.message ?? "Invalid request");
  return parsed.data;
}
