import { afterEach, describe, expect, it } from "vitest";
import { ToolError } from "@bashco/mcp-toolkit";
import {
  assertAccountsBelongTo,
  createPost,
  listSocialAccounts,
  socialFetch,
} from "../../src/ghl/social.js";
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

// The Phase 0 spike confirmed GET /accounts returns 401: this location's private
// integration cannot grant socialplanner/account.readonly. Account ids therefore
// come from configuration rather than the API. See docs/plans/2026-08-21-phase0-findings.md.
const CONFIGURED_ACCOUNTS = [
  { id: "fb-1", platform: "facebook", name: "Bashco Page" },
  { id: "ig-1", platform: "Instagram", name: "@bashco" },
  { id: "yt-1", platform: "youtube", name: "Bashco" },
  { id: "li-1", platform: "linkedin", name: "Bashco" },
  { id: "tt-1", platform: "tiktok", name: "@bashco" },
  { id: "tw-1", platform: "twitter", name: "@bashco" },
];

const configEnv = { ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: JSON.stringify(CONFIGURED_ACCOUNTS) };

describe("listSocialAccounts", () => {
  it("reads the configured accounts without any upstream call", async () => {
    stub = stubGhl({}); // no routes: any request would throw
    const accounts = await listSocialAccounts(configEnv);

    expect(stub.calls).toHaveLength(0);
    expect(accounts).toHaveLength(6);
  });

  it("lower-cases the platform so casing in config cannot break matching", async () => {
    const accounts = await listSocialAccounts(configEnv);
    expect(accounts.find((a) => a.id === "ig-1")).toMatchObject({
      platform: "instagram",
      supported: true,
      name: "@bashco",
    });
  });

  it("flags platforms this server has no posting tool for", async () => {
    const accounts = await listSocialAccounts(configEnv);
    expect(accounts.find((a) => a.id === "tw-1")?.supported).toBe(false);
  });

  it("drops entries with no usable id rather than yielding a broken account", async () => {
    const env = {
      ...TEST_ENV,
      GHL_SOCIAL_ACCOUNTS: JSON.stringify([{ platform: "facebook" }, { id: "fb-2", platform: "facebook" }]),
    };
    expect((await listSocialAccounts(env)).map((a) => a.id)).toEqual(["fb-2"]);
  });

  it("reports a configuration problem when the secret is unparseable", async () => {
    const err = await listSocialAccounts({ ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: "not json" }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).toContain("GHL_SOCIAL_ACCOUNTS");
  });

  it("reports a configuration problem when the secret is not an array", async () => {
    await expect(
      listSocialAccounts({ ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: '{"id":"fb-1"}' }),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("reports a configuration problem when the secret is missing entirely", async () => {
    await expect(
      listSocialAccounts({ ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: "" }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

describe("assertAccountsBelongTo", () => {
  it("accepts ids that match the platform", async () => {
    await expect(assertAccountsBelongTo(configEnv, "instagram", ["ig-1"])).resolves.toBeUndefined();
  });

  it("rejects an id belonging to another platform", async () => {
    const err = await assertAccountsBelongTo(configEnv, "youtube", ["li-1"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).toContain("linkedin");
  });

  it("rejects an unknown id", async () => {
    await expect(assertAccountsBelongTo(configEnv, "facebook", ["nope"])).rejects.toBeInstanceOf(
      ToolError,
    );
  });

  it("checks every id, not just the first", async () => {
    await expect(
      assertAccountsBelongTo(configEnv, "facebook", ["fb-1", "li-1"]),
    ).rejects.toBeInstanceOf(ToolError);
  });
});

// Shapes below mirror tests/fixtures/social/list-posts-draft.json — real GHL
// responses captured in the Phase 0 spike, not invented ones.
const POSTS_PATH_FULL = "/social-media-posting/loc123/posts";
const FB_ID = "672026bf28227a4ad848c4c9_loc123_110529568590140_page";
const YT_ID = "6760e225ec34a09b7bbe13c3_loc123_UCUUuWuvLIuWlmoztI1CdzBg_profile";

const REAL_ACCOUNTS = JSON.stringify([
  { id: FB_ID, platform: "facebook", name: "Bashco Page" },
  { id: YT_ID, platform: "youtube", name: "Bashco" },
]);
const realEnv = { ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: REAL_ACCOUNTS };

const createdBody = {
  success: true,
  statusCode: 201,
  results: { post: { _id: "6a8ab4a4420254dd183aab3a", status: "draft", summary: "hello" } },
};

describe("createPost", () => {
  it("sends the platform details block and normalises _id to id", async () => {
    stub = stubGhl({ [`POST ${POSTS_PATH_FULL}`]: createdBody });

    const post = await createPost(realEnv, {
      platform: "youtube",
      accountIds: [YT_ID],
      type: "post",
      status: "draft",
      summary: "hello",
      media: [{ url: "https://example.com/v.mp4" }],
      details: { youtubePostDetails: { title: "My video", privacyLevel: "private", type: "video" } },
    });

    expect(post.id).toBe("6a8ab4a4420254dd183aab3a");
    expect(post._id).toBeUndefined();

    const body = stub.only().body as Record<string, unknown>;
    expect(body.accountIds).toEqual([YT_ID]);
    expect(body.status).toBe("draft");
    expect(body.type).toBe("post");
    expect(body.youtubePostDetails).toEqual({
      title: "My video",
      privacyLevel: "private",
      type: "video",
    });
  });

  // GHL rejects a create without one: "userId must be a string / should not be empty".
  it("always sends userId, which GHL requires", async () => {
    stub = stubGhl({ [`POST ${POSTS_PATH_FULL}`]: createdBody });
    await createPost(realEnv, {
      platform: "facebook",
      accountIds: [FB_ID],
      type: "post",
      status: "draft",
      summary: "hi",
      details: {},
    });

    expect((stub.only().body as Record<string, unknown>).userId).toBe("user456");
  });

  it("refuses an account belonging to another platform before calling GHL", async () => {
    stub = stubGhl({});
    await expect(
      createPost(realEnv, {
        platform: "youtube",
        accountIds: [FB_ID],
        type: "post",
        status: "draft",
        details: {},
      }),
    ).rejects.toBeInstanceOf(ToolError);

    expect(stub.calls).toHaveLength(0);
  });

  it("reports a safe error when GHL returns no post object", async () => {
    stub = stubGhl({ [`POST ${POSTS_PATH_FULL}`]: { success: true, results: {} } });
    await expect(
      createPost(realEnv, {
        platform: "facebook",
        accountIds: [FB_ID],
        type: "post",
        status: "draft",
        summary: "hi",
        details: {},
      }),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("omits optional fields rather than sending undefined", async () => {
    stub = stubGhl({ [`POST ${POSTS_PATH_FULL}`]: createdBody });
    await createPost(realEnv, {
      platform: "facebook",
      accountIds: [FB_ID],
      type: "post",
      status: "published",
      summary: "text only",
      details: {},
    });

    const body = stub.only().body as Record<string, unknown>;
    expect("media" in body).toBe(false);
    expect("followUpComment" in body).toBe(false);
  });
});
