import { afterEach, describe, expect, it } from "vitest";
import { ToolError } from "@bashco/mcp-toolkit";
import { socialFetch } from "../../src/ghl/social.js";
import { errorResponse, stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

const ACCOUNTS_PATH = "/social-media-posting/loc123/accounts";
const POSTS_PATH = "/social-media-posting/loc123/posts";

describe("socialFetch", () => {
  it("reaches the Social Planner namespace", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: { ok: true } });
    await socialFetch(TEST_ENV, { method: "GET", path: ACCOUNTS_PATH });

    expect(stub.only().path).toBe(ACCOUNTS_PATH);
  });

  // GHL returns 401 for BOTH a missing socialplanner scope (confirmed in the
  // Phase 0 spike) and an expired platform token. The message must name both,
  // or it sends the caller to fix the wrong thing.
  it("maps 401 to a message naming both scope and reconnection", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: errorResponse(401, { message: "not authorized for this scope" }) });
    const err = await socialFetch(TEST_ENV, { method: "GET", path: ACCOUNTS_PATH }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).toContain("socialplanner scope");
    expect((err as ToolError).userMessage).toContain("reconnecting");
  });

  it("maps 403 to the same message", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: errorResponse(403, { message: "forbidden" }) });
    const err = await socialFetch(TEST_ENV, { method: "GET", path: ACCOUNTS_PATH }).catch(
      (e: unknown) => e,
    );

    expect((err as ToolError).userMessage).toContain("socialplanner scope");
  });

  it("keeps the upstream body out of the user-facing message", async () => {
    stub = stubGhl({ [`POST ${POSTS_PATH}`]: errorResponse(422, { message: "secret internal detail" }) });
    const err = await socialFetch(TEST_ENV, { method: "POST", path: POSTS_PATH, body: {} }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).not.toContain("secret internal detail");
    expect((err as ToolError).internalMessage).toContain("secret internal detail");
  });
});
