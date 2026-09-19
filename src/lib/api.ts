import "server-only";
import { NextResponse } from "next/server";
import { UnauthorizedError } from "@/lib/auth/session";

/**
 * One place for route-handler error handling.
 *
 * Unauthorised access is a 401 with its own message; everything else is logged
 * in full on the server and answered with a short sentence, so an internal
 * error never leaks a query or a stack trace to a browser.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[mendly] Request failed:", error);
    return NextResponse.json({ error: "Something went wrong on our side." }, { status: 500 });
  }
}

/** An error with an intended status code, safe to show to the caller. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function badRequest(message: string): never {
  throw new HttpError(400, message);
}

export function notFound(message: string): never {
  throw new HttpError(404, message);
}

export function forbidden(message: string): never {
  throw new HttpError(403, message);
}
