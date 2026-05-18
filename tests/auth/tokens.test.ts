import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { issueBearer, lookupBearer, revokeBearer } from "../../src/auth/tokens.js";

interface TestEnv {
  GHL_OAUTH_KV: KVNamespace;
}

const testEnv = env as unknown as TestEnv;

async function clearKv(kv: KVNamespace): Promise<void> {
  const list = await kv.list();
  await Promise.all(list.keys.map((k) => kv.delete(k.name)));
}

describe("bearer tokens", () => {
  beforeEach(async () => {
    await clearKv(testEnv.GHL_OAUTH_KV);
  });

  it("issues a token, looks it up, and revokes it", async () => {
    const issued = await issueBearer(testEnv.GHL_OAUTH_KV, { clientId: "client-a" });
    expect(issued.rawToken.length).toBeGreaterThan(20);

    const record = await lookupBearer(testEnv.GHL_OAUTH_KV, issued.rawToken);
    expect(record?.clientId).toBe("client-a");

    await revokeBearer(testEnv.GHL_OAUTH_KV, issued.rawToken);
    const after = await lookupBearer(testEnv.GHL_OAUTH_KV, issued.rawToken);
    expect(after).toBeNull();
  });

  it("two issuances yield distinct tokens (no shared secret)", async () => {
    const a = await issueBearer(testEnv.GHL_OAUTH_KV, { clientId: "client-a" });
    const b = await issueBearer(testEnv.GHL_OAUTH_KV, { clientId: "client-b" });
    expect(a.rawToken).not.toEqual(b.rawToken);
  });

  it("does not store the raw token in KV (only the SHA-256 hash key)", async () => {
    const { rawToken } = await issueBearer(testEnv.GHL_OAUTH_KV, { clientId: "leak-check" });
    const all = await testEnv.GHL_OAUTH_KV.list();
    for (const key of all.keys) {
      expect(key.name.includes(rawToken)).toBe(false);
      const stored = await testEnv.GHL_OAUTH_KV.get(key.name);
      expect((stored ?? "").includes(rawToken)).toBe(false);
    }
  });

  it("treats an expired token as missing", async () => {
    const past = Date.now() - 60_000;
    const issued = await issueBearer(testEnv.GHL_OAUTH_KV, {
      clientId: "client-expiring",
      ttlSeconds: 3600,
      now: past - 3600_000,
    });
    const after = await lookupBearer(testEnv.GHL_OAUTH_KV, issued.rawToken);
    expect(after).toBeNull();
  });

  it("returns null for an unknown token", async () => {
    const result = await lookupBearer(testEnv.GHL_OAUTH_KV, "definitely-not-a-real-token");
    expect(result).toBeNull();
  });

  it("returns null for an empty bearer", async () => {
    const result = await lookupBearer(testEnv.GHL_OAUTH_KV, "");
    expect(result).toBeNull();
  });
});
