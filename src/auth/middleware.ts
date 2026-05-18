import type { MiddlewareHandler } from "hono";
import type { WorkerEnv } from "../env.js";
import { lookupBearer } from "./tokens.js";

const PUBLIC_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/authorize",
  "/approve",
  "/token",
  "/register",
]);

function unauthorized(base: string): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer realm="GHL MCP Server", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
    },
  });
}

export const bearerMiddleware: MiddlewareHandler<{ Bindings: WorkerEnv }> = async (c, next) => {
  const url = new URL(c.req.url);
  if (PUBLIC_PATHS.has(url.pathname)) return next();

  const auth = c.req.header("Authorization") ?? "";
  const prefix = "Bearer ";
  const raw = auth.startsWith(prefix) ? auth.slice(prefix.length).trim() : "";
  if (!raw) return unauthorized(url.origin);

  const record = await lookupBearer(c.env.GHL_OAUTH_KV, raw);
  if (!record) return unauthorized(url.origin);

  c.set("clientId", record.clientId);
  return next();
};

declare module "hono" {
  interface ContextVariableMap {
    clientId: string;
  }
}
