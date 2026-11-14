import type { z } from "zod";
import { errorResponse, HttpError, toErrorResponse } from "./http-error";

export type Handler = (req: Bun.BunRequest) => Response | Promise<Response>;
export type Method = "GET" | "POST";

/** Route table in `Bun.serve` format: path → method → handler. Each module exports one. */
export type Routes = Record<string, Partial<Record<Method | "OPTIONS", Handler>>>;

// ---------- Request validation ----------

/** Validates `data` against `schema`, or throws a 400 in our standard error shape. */
export function parse<Schema extends z.ZodType>(schema: Schema, data: unknown): z.infer<Schema> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const path = issue?.path.join(".");
  const message = issue?.message ?? "Invalid request";
  throw new HttpError(400, "validation_error", path ? `${path}: ${message}` : message);
}

export async function parseJson<Schema extends z.ZodType>(req: Request, schema: Schema) {
  const body: unknown = await req.json().catch(() => {
    throw new HttpError(400, "validation_error", "Request body must be valid JSON");
  });
  return parse(schema, body);
}

export function parseQuery<Schema extends z.ZodType>(req: Request, schema: Schema) {
  return parse(schema, Object.fromEntries(new URL(req.url).searchParams));
}

// ---------- Middleware: CORS, error handling, logging ----------

interface MiddlewareOptions {
  corsOrigin: string;
}

function corsHeaders(corsOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function wrap(handler: Handler, { corsOrigin }: MiddlewareOptions): Handler {
  return async (req) => {
    const started = performance.now();
    const res = await Promise.resolve()
      .then(() => handler(req))
      .catch(toErrorResponse);

    for (const [name, value] of Object.entries(corsHeaders(corsOrigin))) {
      res.headers.set(name, value);
    }
    const ms = Math.round(performance.now() - started);
    console.log(`${req.method} ${new URL(req.url).pathname} ${res.status} ${ms}ms`);
    return res;
  };
}

/** Wraps every handler with CORS, error handling and logging, and answers preflights. */
export function withMiddleware(routes: Routes, options: MiddlewareOptions): Routes {
  const preflight = wrap(() => new Response(null, { status: 204 }), options);
  const wrapped: Routes = {};
  for (const [path, methods] of Object.entries(routes)) {
    wrapped[path] = { OPTIONS: preflight };
    for (const [method, handler] of Object.entries(methods)) {
      wrapped[path][method as Method] = wrap(handler, options);
    }
  }
  return wrapped;
}

/** Fallback for anything the route table does not match. */
export function notFound(options: MiddlewareOptions) {
  return wrap(() => errorResponse(404, "not_found", "Route not found"), options);
}
