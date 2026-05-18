import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { issueBearer } from "../../src/auth/tokens.js";
import { bearerMiddleware } from "../../src/auth/middleware.js";
import type { WorkerEnv } from "../../src/env.js";
import { mcpRoutes } from "../../src/mcp/jsonrpc.js";

const workerEnv = env as unknown as WorkerEnv;

function makeApp() {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  app.use("*", bearerMiddleware);
  app.route("/", mcpRoutes);
  return app;
}

async function bearer(): Promise<string> {
  const issued = await issueBearer(workerEnv.GHL_OAUTH_KV, { clientId: "test-client" });
  return issued.rawToken;
}

async function mcpCall(token: string, body: unknown): Promise<Response> {
  const app = makeApp();
  return app.fetch(
    new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    }),
    workerEnv,
  );
}

describe("/mcp JSON-RPC plumbing", () => {
  beforeEach(async () => {
    const list = await workerEnv.GHL_OAUTH_KV.list();
    await Promise.all(list.keys.map((k) => workerEnv.GHL_OAUTH_KV.delete(k.name)));
  });

  it("requires a bearer", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      }),
      workerEnv,
    );
    expect(res.status).toBe(401);
  });

  it("responds to initialize with capabilities + Mcp-Session-Id", async () => {
    const token = await bearer();
    const res = await mcpCall(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-03-26" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Mcp-Session-Id")).toBeTruthy();
    const body = (await res.json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2025-03-26");
  });

  it("falls back to default protocol version for unknown values", async () => {
    const token = await bearer();
    const res = await mcpCall(token, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "9999-99-99" },
    });
    const body = (await res.json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2024-11-05");
  });

  it("returns the tool list", async () => {
    const token = await bearer();
    const res = await mcpCall(token, { jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools.length).toBeGreaterThan(15);
    expect(body.result.tools.map((t) => t.name)).toContain("search_contacts");
  });

  it("returns -32601 for unknown methods", async () => {
    const token = await bearer();
    const res = await mcpCall(token, { jsonrpc: "2.0", id: 3, method: "unknown/method" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("returns -32700 for malformed JSON", async () => {
    const token = await bearer();
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: "not json",
      }),
      workerEnv,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32700);
  });

  it("returns -32602 for tools/call with malformed params", async () => {
    const token = await bearer();
    const res = await mcpCall(token, { jsonrpc: "2.0", id: 4, method: "tools/call", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32602);
  });

  it("returns a tool isError result for unknown tool name", async () => {
    const token = await bearer();
    const res = await mcpCall(token, {
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: { name: "no_such_tool", arguments: {} },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { content: { text: string }[]; isError?: boolean };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]!.text).toMatch(/unknown tool/);
  });

  it("returns a tool isError result for bad arguments", async () => {
    const token = await bearer();
    const res = await mcpCall(token, {
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "get_contact", arguments: { contactId: "../workflows" } },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { isError?: boolean } };
    expect(body.result.isError).toBe(true);
  });
});
