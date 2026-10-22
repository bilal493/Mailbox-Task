import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError } from "@/domain/errors";
import { createLogger } from "./logger";

const logger = createLogger("api");

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    const message = err.issues[0]?.message ?? "Invalid request";
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message, details } }, { status: 400 });
  }
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  logger.error("Unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
    { status: 500 },
  );
}

type Handler<P> = (req: NextRequest, ctx: { params: P }) => Promise<Response | { status?: number; body: unknown }>;

/** Wraps a route handler so every error leaves the API in the same JSON shape. */
export function apiHandler<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: P }): Promise<Response> => {
    try {
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result.body, { status: result.status ?? 200 });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "Request body must be valid JSON" }]);
  }
}
