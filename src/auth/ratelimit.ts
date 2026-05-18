import type { Context, MiddlewareHandler } from "hono";
import type { RateLimiter, WorkerEnv } from "../env.js";

type LimiterKey = "RATE_LIMIT_APPROVE" | "RATE_LIMIT_TOKEN" | "RATE_LIMIT_REGISTER" | "RATE_LIMIT_MCP";

function clientKey(c: Context): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return "unknown";
}

function tooManyRequests(): Response {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60" },
  });
}

export function rateLimit(binding: LimiterKey): MiddlewareHandler<{ Bindings: WorkerEnv }> {
  return async (c, next) => {
    const limiter = c.env[binding] as RateLimiter | undefined;
    if (!limiter) {
      await next();
      return;
    }
    const key = `${binding}:${clientKey(c)}`;
    try {
      const { success } = await limiter.limit({ key });
      if (!success) return tooManyRequests();
    } catch {
      // If the limiter is unavailable, fail open rather than 500.
    }
    await next();
  };
}
