import { vi } from "vitest";
import type { GHLApiEnv } from "../../src/env.js";

export const TEST_ENV: GHLApiEnv = {
  GHL_API_TOKEN: "test-token",
  GHL_LOCATION_ID: "loc123",
  GHL_USER_ID: "user456",
  GHL_CALENDAR_ID: "cal789",
  GHL_SOCIAL_ACCOUNTS: "[]",
};

export interface RecordedCall {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
}

export interface GhlStub {
  calls: RecordedCall[];
  /** Convenience: the single call made, asserting exactly one happened. */
  only(): RecordedCall;
  restore(): void;
}

/** A canned body, a ready-made Response, or a function that picks one per call. */
export type Route =
  | Response
  | Record<string, unknown>
  | ((call: RecordedCall) => Response | Record<string, unknown>);

/**
 * Replaces global fetch with a router keyed on "METHOD /path" (or a bare path
 * for any method). Values are returned as JSON; a function is invoked with the
 * recorded call so a route can vary its answer per request.
 *
 * Unmatched requests throw, so a test can never silently pass against a call it
 * did not intend to make.
 */
export function stubGhl(routes: Record<string, Route>): GhlStub {
  const calls: RecordedCall[] = [];

  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const call: RecordedCall = {
      method,
      url: url.toString(),
      path: url.pathname,
      query: url.searchParams,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);

    const match = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
    if (match === undefined) {
      throw new Error(`stubGhl: no route for ${method} ${url.pathname}`);
    }

    const value = typeof match === "function" ? match(call) : match;
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  return {
    calls,
    only() {
      if (calls.length !== 1) {
        throw new Error(`expected exactly 1 upstream call, saw ${calls.length}`);
      }
      return calls[0]!;
    },
    restore: () => vi.unstubAllGlobals(),
  };
}

/** An error response for a route, e.g. `errorResponse(404)`. */
export function errorResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** ISO timestamp `days` from now — negative for the past. */
export function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
