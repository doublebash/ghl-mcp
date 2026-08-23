import { afterEach, describe, expect, it } from "vitest";
import { ToolError } from "@bashco/mcp-toolkit";
import {
  assertAccountsBelongTo,
  createPost,
  deletePost,
  getPost,
  listPosts,
  listSocialAccounts,
  schedulePost,
  socialFetch,
  updatePost,
} from "../../src/ghl/social.js";
import { daysFromNow, errorResponse, stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

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
const FB_ID = "aaaa0000aaaa0000aaaa0001_loc123_100000000000001_page";
const YT_ID = "aaaa0000aaaa0000aaaa0004_loc123_UCaaaaaaaaaaaaaaaaaaaaaa_profile";

const REAL_ACCOUNTS = JSON.stringify([
  { id: FB_ID, platform: "facebook", name: "Bashco Page" },
  { id: YT_ID, platform: "youtube", name: "Bashco" },
]);
const realEnv = { ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: REAL_ACCOUNTS };

const createdBody = {
  success: true,
  statusCode: 201,
  results: { post: { _id: "6a8a000000000000000aaa3a", status: "draft", summary: "hello" } },
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

    expect(post.id).toBe("6a8a000000000000000aaa3a");
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

const LIST_PATH = "/social-media-posting/loc123/posts/list";
const ONE_POST_PATH = "/social-media-posting/loc123/posts/6a8a000000000000000aaa3a";
const POST_ID = "6a8a000000000000000aaa3a";

describe("listPosts", () => {
  it("normalises _id to id and reports GHL's own count as the total", async () => {
    stub = stubGhl({
      [`POST ${LIST_PATH}`]: {
        results: { posts: [{ _id: "p1" }, { _id: "p2" }], count: 380 },
      },
    });

    const { posts, total } = await listPosts(realEnv, {});

    expect(posts.map((p) => p.id)).toEqual(["p1", "p2"]);
    // Not posts.length: a page of 2 out of 380 must not read as the whole queue.
    expect(total).toBe(380);
  });

  // GHL 422s on a `status` body field ("property status should not exist") and
  // requires skip/limit as number strings. Both confirmed in the Phase 0 spike.
  it("maps status onto type and sends skip/limit as number strings", async () => {
    stub = stubGhl({ [`POST ${LIST_PATH}`]: { results: { posts: [], count: 0 } } });
    await listPosts(realEnv, { status: "draft", limit: 5 });

    const body = stub.only().body as Record<string, unknown>;
    expect(body.type).toBe("draft");
    expect(body.skip).toBe("0");
    expect(body.limit).toBe("5");
    expect("status" in body).toBe(false);
    expect("accountIds" in body).toBe(false);
  });

  // type: "recent" excludes drafts, so omitting type is what "everything" means.
  it("omits type entirely when no status filter is given", async () => {
    stub = stubGhl({ [`POST ${LIST_PATH}`]: { results: { posts: [], count: 0 } } });
    await listPosts(realEnv, {});

    expect("type" in (stub.only().body as Record<string, unknown>)).toBe(false);
  });

  it("passes a date window through", async () => {
    stub = stubGhl({ [`POST ${LIST_PATH}`]: { results: { posts: [], count: 0 } } });
    const from = daysFromNow(-7);
    const to = daysFromNow(7);
    await listPosts(realEnv, { fromDate: from, toDate: to });

    const body = stub.only().body as Record<string, unknown>;
    expect(body.fromDate).toBe(from);
    expect(body.toDate).toBe(to);
  });

  // The endpoint rejects accountIds outright, so platform filtering is ours to do.
  it("filters by platform client-side using the configured account ids", async () => {
    stub = stubGhl({
      [`POST ${LIST_PATH}`]: {
        results: {
          posts: [
            { _id: "p1", accountIds: [YT_ID] },
            { _id: "p2", accountIds: [FB_ID] },
          ],
          count: 2,
        },
      },
    });

    const { posts, total } = await listPosts(realEnv, { platform: "youtube" });

    expect(posts.map((p) => p.id)).toEqual(["p1"]);
    // Filtering client-side makes GHL's count wrong for this result.
    expect(total).toBe(1);
  });
});

describe("getPost", () => {
  it("returns the post", async () => {
    stub = stubGhl({ [`GET ${ONE_POST_PATH}`]: { results: { post: { _id: POST_ID, summary: "hi" } } } });
    expect(await getPost(realEnv, POST_ID)).toMatchObject({ id: POST_ID, summary: "hi" });
  });

  it("reports not found when GHL returns no post", async () => {
    stub = stubGhl({ [`GET ${ONE_POST_PATH}`]: { results: {} } });
    await expect(getPost(realEnv, POST_ID)).rejects.toBeInstanceOf(ToolError);
  });

  it("rejects a post id that fails the GHL id pattern before calling out", async () => {
    stub = stubGhl({});
    await expect(getPost(realEnv, "../accounts")).rejects.toBeInstanceOf(ToolError);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("updatePost", () => {
  it("sends only the fields provided, and never touches the schedule", async () => {
    stub = stubGhl({ [`PUT ${ONE_POST_PATH}`]: { results: { post: { _id: POST_ID, summary: "new" } } } });
    await updatePost(realEnv, POST_ID, { summary: "new" });

    const call = stub.only();
    expect(call.method).toBe("PUT");
    const body = call.body as Record<string, unknown>;
    expect(body.summary).toBe("new");
    expect("media" in body).toBe(false);
    expect("scheduleDate" in body).toBe(false);
    expect("status" in body).toBe(false);
  });
});

describe("schedulePost", () => {
  it("sets status and scheduleDate together", async () => {
    stub = stubGhl({
      [`PUT ${ONE_POST_PATH}`]: { results: { post: { _id: POST_ID, status: "scheduled" } } },
    });
    const when = daysFromNow(2);
    await schedulePost(realEnv, POST_ID, when);

    const body = stub.only().body as Record<string, unknown>;
    expect(body.status).toBe("scheduled");
    expect(body.scheduleDate).toBe(when);
  });
});

describe("deletePost", () => {
  it("deletes and reports the id back", async () => {
    stub = stubGhl({ [`DELETE ${ONE_POST_PATH}`]: { success: true } });

    expect(await deletePost(realEnv, POST_ID)).toEqual({ deleted: true, postId: POST_ID });
    expect(stub.only().method).toBe("DELETE");
  });
});
