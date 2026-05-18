import type { MiddlewareHandler } from "hono";
import { ALLOWED_CORS_ORIGINS } from "../constants.js";

const ALLOWED_METHODS = "GET, POST, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, Accept, Mcp-Session-Id";
const EXPOSE_HEADERS = "WWW-Authenticate";
const MAX_AGE = "86400";

export const corsMiddleware: MiddlewareHandler = async (c, next) => {
  const origin = c.req.header("Origin");
  const isAllowed = origin !== undefined && ALLOWED_CORS_ORIGINS.has(origin);

  if (c.req.method === "OPTIONS") {
    if (!isAllowed) {
      return new Response(null, { status: 403 });
    }
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
        "Access-Control-Expose-Headers": EXPOSE_HEADERS,
        "Access-Control-Max-Age": MAX_AGE,
        Vary: "Origin",
      },
    });
  }

  await next();

  if (isAllowed) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
    c.res.headers.set("Access-Control-Expose-Headers", EXPOSE_HEADERS);
    c.res.headers.append("Vary", "Origin");
  }
};
