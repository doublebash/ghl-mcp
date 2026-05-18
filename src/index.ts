import { Hono } from "hono";
import { corsMiddleware } from "./auth/cors.js";
import { bearerMiddleware } from "./auth/middleware.js";
import { oauthRoutes } from "./auth/oauth.js";
import type { WorkerEnv } from "./env.js";
import { mcpRoutes } from "./mcp/jsonrpc.js";

const app = new Hono<{ Bindings: WorkerEnv }>();

app.use("*", corsMiddleware);
app.use("*", bearerMiddleware);

app.route("/", oauthRoutes);
app.route("/", mcpRoutes);

export default app;
