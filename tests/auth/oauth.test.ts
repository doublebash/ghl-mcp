import { env } from "cloudflare:test";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { oauthRoutes } from "../../src/auth/oauth.js";
import { lookupBearer } from "../../src/auth/tokens.js";
import { sha256Base64Url } from "../../src/crypto/encoding.js";
import type { WorkerEnv } from "../../src/env.js";

const workerEnv = env as unknown as WorkerEnv;

function makeApp() {
  const app = new Hono<{ Bindings: WorkerEnv }>();
  app.route("/", oauthRoutes);
  return app;
}

async function clearKv() {
  const list = await workerEnv.GHL_OAUTH_KV.list();
  await Promise.all(list.keys.map((k) => workerEnv.GHL_OAUTH_KV.delete(k.name)));
}

interface PkcePair {
  verifier: string;
  challenge: string;
}

async function makePkce(): Promise<PkcePair> {
  const verifier = "x".repeat(64);
  const challenge = await sha256Base64Url(verifier);
  return { verifier, challenge };
}

describe("OAuth metadata", () => {
  it("advertises authorization_code only (no client_credentials)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/.well-known/oauth-authorization-server"),
      workerEnv,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.grant_types_supported).toEqual(["authorization_code"]);
    expect(body.code_challenge_methods_supported).toEqual(["S256"]);
  });
});

describe("OAuth /authorize", () => {
  it("rejects non-S256 challenge methods", async () => {
    const app = makeApp();
    const url = new URL("https://example.com/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client-a");
    url.searchParams.set("redirect_uri", "https://claude.ai/cb");
    url.searchParams.set("code_challenge", "abc");
    url.searchParams.set("code_challenge_method", "plain");
    const res = await app.fetch(new Request(url.toString()), workerEnv);
    expect(res.status).toBe(400);
  });

  it("rejects redirect_uris not in the allowlist", async () => {
    const app = makeApp();
    const url = new URL("https://example.com/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client-a");
    url.searchParams.set("redirect_uri", "https://attacker.com/cb");
    url.searchParams.set("code_challenge", "abc");
    url.searchParams.set("code_challenge_method", "S256");
    const res = await app.fetch(new Request(url.toString()), workerEnv);
    expect(res.status).toBe(400);
  });

  it("returns the HTML form for valid params", async () => {
    const app = makeApp();
    const url = new URL("https://example.com/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "client-a");
    url.searchParams.set("redirect_uri", "https://claude.ai/cb");
    url.searchParams.set("code_challenge", "abc");
    url.searchParams.set("code_challenge_method", "S256");
    const res = await app.fetch(new Request(url.toString()), workerEnv);
    expect(res.status).toBe(200);
    expect((await res.text()).includes("Approval code")).toBe(true);
  });
});

describe("OAuth /approve + /token end-to-end", () => {
  beforeEach(async () => {
    await clearKv();
  });

  it("issues a per-client bearer through the full PKCE flow", async () => {
    const app = makeApp();
    const { verifier, challenge } = await makePkce();

    const approveRes = await app.fetch(
      new Request("https://example.com/approve", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: "test-approval-code",
          params: JSON.stringify({
            redirect_uri: "https://claude.ai/cb",
            client_id: "client-a",
            state: "state-1",
            code_challenge: challenge,
          }),
        }),
        redirect: "manual",
      }),
      workerEnv,
    );
    expect(approveRes.status).toBe(302);
    const location = approveRes.headers.get("Location");
    expect(location).not.toBeNull();
    const authCode = new URL(location!).searchParams.get("code");
    expect(authCode).toBeTruthy();

    const tokenRes = await app.fetch(
      new Request("https://example.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode!,
          code_verifier: verifier,
          redirect_uri: "https://claude.ai/cb",
        }),
      }),
      workerEnv,
    );
    expect(tokenRes.status).toBe(200);
    const tokenBody = (await tokenRes.json()) as Record<string, unknown>;
    expect(tokenBody.token_type).toBe("Bearer");
    expect(typeof tokenBody.access_token).toBe("string");
    expect((tokenBody.access_token as string).length).toBeGreaterThan(20);
    expect(tokenBody.access_token).not.toBe("test-approval-code");

    const record = await lookupBearer(workerEnv.GHL_OAUTH_KV, tokenBody.access_token as string);
    expect(record?.clientId).toBe("client-a");
  });

  it("rejects an incorrect approval code", async () => {
    const app = makeApp();
    const { challenge } = await makePkce();
    const res = await app.fetch(
      new Request("https://example.com/approve", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: "wrong",
          params: JSON.stringify({
            redirect_uri: "https://claude.ai/cb",
            client_id: "client-a",
            code_challenge: challenge,
          }),
        }),
      }),
      workerEnv,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a wrong PKCE verifier", async () => {
    const app = makeApp();
    const { challenge } = await makePkce();

    const approveRes = await app.fetch(
      new Request("https://example.com/approve", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: "test-approval-code",
          params: JSON.stringify({
            redirect_uri: "https://claude.ai/cb",
            client_id: "client-a",
            code_challenge: challenge,
          }),
        }),
        redirect: "manual",
      }),
      workerEnv,
    );
    const authCode = new URL(approveRes.headers.get("Location")!).searchParams.get("code")!;

    const tokenRes = await app.fetch(
      new Request("https://example.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          code_verifier: "y".repeat(64),
          redirect_uri: "https://claude.ai/cb",
        }),
      }),
      workerEnv,
    );
    expect(tokenRes.status).toBe(400);
    const body = (await tokenRes.json()) as Record<string, unknown>;
    expect(body.error).toBe("invalid_grant");
  });

  it("rejects auth code re-use", async () => {
    const app = makeApp();
    const { verifier, challenge } = await makePkce();

    const approveRes = await app.fetch(
      new Request("https://example.com/approve", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: "test-approval-code",
          params: JSON.stringify({
            redirect_uri: "https://claude.ai/cb",
            client_id: "client-a",
            code_challenge: challenge,
          }),
        }),
        redirect: "manual",
      }),
      workerEnv,
    );
    const authCode = new URL(approveRes.headers.get("Location")!).searchParams.get("code")!;

    const first = await app.fetch(
      new Request("https://example.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          code_verifier: verifier,
          redirect_uri: "https://claude.ai/cb",
        }),
      }),
      workerEnv,
    );
    expect(first.status).toBe(200);

    const second = await app.fetch(
      new Request("https://example.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: authCode,
          code_verifier: verifier,
          redirect_uri: "https://claude.ai/cb",
        }),
      }),
      workerEnv,
    );
    expect(second.status).toBe(400);
  });
});

describe("OAuth /register", () => {
  it("accepts an empty body and returns a client_id", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      workerEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.client_id).toBe("string");
  });

  it("rejects more than the redirect_uri cap", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://example.com/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: Array.from({ length: 10 }, (_, i) => `https://claude.ai/cb${i}`),
        }),
      }),
      workerEnv,
    );
    expect(res.status).toBe(400);
  });
});
