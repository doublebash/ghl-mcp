import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { bearerMiddleware } from "../../src/auth/middleware.js";
import { issueBearer } from "../../src/auth/tokens.js";
import type { WorkerEnv } from "../../src/env.js";

const workerEnv = env as unknown as WorkerEnv;

function makeApp() {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  app.use("*", bearerMiddleware);
  app.get("/private", (c) => c.json({ ok: true, clientId: c.get("clientId") }));
  app.get("/authorize", (c) => c.text("public-page"));
  return app;
}

async function clearKv() {
  const list = await workerEnv.GHL_OAUTH_KV.list();
  await Promise.all(list.keys.map((k) => workerEnv.GHL_OAUTH_KV.delete(k.name)));
}

describe("bearer middleware", () => {
  beforeEach(async () => {
    await clearKv();
  });

  it("rejects requests with no Authorization header", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/private"),
      workerEnv,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/Bearer realm/);
  });

  it("rejects unknown bearer tokens", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/private", {
        headers: { Authorization: "Bearer not-a-real-token" },
      }),
      workerEnv,
    );
    expect(res.status).toBe(401);
  });

  it("accepts a freshly-issued bearer", async () => {
    const { rawToken } = await issueBearer(workerEnv.GHL_OAUTH_KV, { clientId: "client-a" });
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/private", {
        headers: { Authorization: `Bearer ${rawToken}` },
      }),
      workerEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { clientId: string };
    expect(body.clientId).toBe("client-a");
  });

  it("lets public OAuth paths through without a bearer", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/authorize"),
      workerEnv,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("public-page");
  });
});
