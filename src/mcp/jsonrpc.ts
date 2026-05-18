import { Hono } from "hono";
import { z } from "zod";
import {
  DEFAULT_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "../constants.js";
import { ghlEnvFrom, type WorkerEnv } from "../env.js";
import { ToolError } from "../errors.js";
import { log } from "../logger.js";
import { rateLimit } from "../auth/ratelimit.js";
import { handleToolCall } from "./handlers.js";
import { toolDefinitions } from "./tools.js";

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.unknown().optional(),
});

const toolsCallParamsSchema = z.object({
  name: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

const initializeParamsSchema = z
  .object({
    protocolVersion: z.string().optional(),
  })
  .partial();

function negotiateProtocol(clientVersion: string | undefined): (typeof SUPPORTED_PROTOCOL_VERSIONS)[number] {
  if (!clientVersion) return DEFAULT_PROTOCOL_VERSION;
  for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
    if (v === clientVersion) return v;
  }
  return DEFAULT_PROTOCOL_VERSION;
}

export const mcpRoutes = new Hono<{ Bindings: WorkerEnv }>();

mcpRoutes.post("/mcp", rateLimit("RATE_LIMIT_MCP"), async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400,
    );
  }

  const parsed = jsonRpcRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } },
      400,
    );
  }

  const { id, method, params } = parsed.data;
  const respondId = id ?? null;
  const ok = (result: unknown) => c.json({ jsonrpc: "2.0", id: respondId, result });

  switch (method) {
    case "initialize": {
      const ip = initializeParamsSchema.safeParse(params);
      const clientVersion = ip.success ? ip.data.protocolVersion : undefined;
      const negotiated = negotiateProtocol(clientVersion);
      const responseBody = JSON.stringify({
        jsonrpc: "2.0",
        id: respondId,
        result: {
          protocolVersion: negotiated,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
      return new Response(responseBody, {
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": crypto.randomUUID(),
        },
      });
    }

    case "notifications/initialized":
    case "ping":
      return ok({});

    case "tools/list":
      return ok({ tools: toolDefinitions });

    case "tools/call": {
      const cp = toolsCallParamsSchema.safeParse(params);
      if (!cp.success) {
        return c.json(
          {
            jsonrpc: "2.0",
            id: respondId,
            error: { code: -32602, message: "Invalid params" },
          },
          400,
        );
      }
      const startedAt = Date.now();
      try {
        const result = await handleToolCall(ghlEnvFrom(c.env), cp.data.name, cp.data.arguments ?? {});
        log.info("tool_call", {
          tool: cp.data.name,
          ok: true,
          duration_ms: Date.now() - startedAt,
        });
        return ok({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (e) {
        const isTool = e instanceof ToolError;
        const userMessage = isTool ? e.userMessage : "tool execution failed";
        const internalMessage = isTool ? e.internalMessage : e instanceof Error ? e.message : String(e);
        log.error("tool_call", {
          tool: cp.data.name,
          ok: false,
          duration_ms: Date.now() - startedAt,
          status: isTool ? e.status ?? null : null,
          internal: internalMessage.slice(0, 512),
        });
        return ok({
          content: [{ type: "text", text: `Error: ${userMessage}` }],
          isError: true,
        });
      }
    }

    default:
      return c.json(
        {
          jsonrpc: "2.0",
          id: respondId,
          error: { code: -32601, message: `Method not found: ${method}` },
        },
        404,
      );
  }
});
