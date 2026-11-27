// lib/api/handler.ts
// Wrapper every route handler goes through: same-origin check, error mapping,
// params resolution (Next 15+ passes params as a Promise), JSON parsing with Zod.

import type { NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { ApiError, toErrorResponse } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth for cookie-authenticated requests: a state-changing request that
 * carries an Origin header must come from this site. (Set APP_ORIGIN if you run behind a
 * proxy that changes the host, e.g. https://academy.example.com)
 */
function assertSameOrigin(req: NextRequest) {
  if (SAFE_METHODS.has(req.method)) return;

  const origin = req.headers.get("origin");
  if (!origin) return;

  const allowedOrigins = [
    "http://localhost:3000",
    "https://menhal.org",
    process.env.APP_ORIGIN,
  ].filter((value): value is string => Boolean(value));

  if (!allowedOrigins.includes(origin)) {
    throw new ApiError(403, "BAD_ORIGIN");
  }
}

export function route<P extends Record<string, string> = Record<string, never>>(
  fn: (req: NextRequest, ctx: { params: P }) => Promise<Response>,
) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<P> },
  ): Promise<Response> => {
    try {
      assertSameOrigin(req);
      return await fn(req, { params: await ctx.params });
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export async function parseJson<S extends ZodType>(
  req: NextRequest,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON");
  }
  return schema.parse(raw);
}

const uuidSchema = z.string().uuid();
/** Validate a route parameter; a malformed id is a 400, not a database error. */
export const uuidParam = (value: string): string => uuidSchema.parse(value);

/** Responses that depend on who is asking must never be stored by a shared cache. */
export const PRIVATE = { "Cache-Control": "private, no-store" } as const;

export const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(data, { status, headers });

/** Validate ?query=string parameters (all values arrive as strings, so use z.coerce). */
export function parseQuery<S extends ZodType>(
  req: NextRequest,
  schema: S,
): z.infer<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
