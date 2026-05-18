import { describe, expect, it } from "vitest";
import { isAllowedRedirectUri } from "../../src/auth/redirect.js";

describe("isAllowedRedirectUri", () => {
  it("accepts the canonical claude.ai hosts", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/callback")).toBe(true);
    expect(isAllowedRedirectUri("https://api.claude.ai/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://claude.com/cb")).toBe(true);
    expect(isAllowedRedirectUri("https://api.claude.com/cb")).toBe(true);
  });

  it("rejects http", () => {
    expect(isAllowedRedirectUri("http://claude.ai/cb")).toBe(false);
  });

  it("rejects unknown hosts", () => {
    expect(isAllowedRedirectUri("https://attacker.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai.attacker.com/cb")).toBe(false);
  });

  it("rejects subdomains that v1 accepted under the .claude.ai wildcard", () => {
    expect(isAllowedRedirectUri("https://preview.claude.ai/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://sandbox.claude.ai/cb")).toBe(false);
  });

  it("rejects malformed URIs", () => {
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("")).toBe(false);
  });
});
