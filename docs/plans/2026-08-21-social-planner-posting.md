# Social Planner Posting Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 11 MCP tools to `ghl-mcp` v2.5.0 that author, schedule, and manage social posts on Facebook, Instagram, YouTube, LinkedIn, and TikTok through GoHighLevel's Social Planner API.

**Architecture:** Additive, and thin — `@bashco/mcp-toolkit` already supplies the upstream client (retries, backoff, timeouts, error sanitising), tool dispatch, and path validation. This plan adds a social-specific upstream client, a data layer in `src/ghl/social.ts`, pure payload builders in `src/ghl/platforms.ts`, and 11 entries to the existing schema/description/handler triple.

**Tech Stack:** TypeScript (strict), Cloudflare Workers, Hono v4, Zod v4, `@bashco/mcp-toolkit` v1.1.0, Vitest with `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/specs/2026-08-21-social-planner-posting.md`

## Global Constraints

- **Follow the toolkit, don't reimplement it.** `createUpstreamClient` handles retry, backoff, `Retry-After`, timeouts, and error sanitising. `UpstreamRequestInit` already accepts per-call `headers`. `buildPath` (via `src/ghl/path.ts`) already validates IDs against `GHL_ID_PATTERN`.
- **Lists return `TruncatedList`.** Any tool handing back a collection wraps it with `truncateList(items, what, narrowingHint)` from `src/mcp/truncate.ts`. A bare array lets a caller mistake a partial list for a complete one.
- **Use `compact()`** in handlers to drop `undefined` fields — `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not assignable to an optional property.
- **Tests use `stubGhl()`** from `tests/helpers/stubGhl.ts` with route keys of the form `"METHOD /path"` or a bare path. Unmatched routes throw by design. Use `TEST_ENV`, `errorResponse`, `daysFromNow` from the same helper.
- **`SERVER_VERSION` and `package.json` version move together** — a test asserts it, after they drifted once.
- **Regex over `.refine` wherever the constraint is expressible.** Zod renders a regex as `pattern` in the derived JSON Schema but drops refinements silently, making them invisible to the caller. Where a refinement is unavoidable, state the rule in the tool description too.
- **No new dependencies.**
- **Commit after every task**, with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Verification commands

```bash
npm test          # vitest run
npm run typecheck # tsc --noEmit
```

Both must pass before every commit.

---

## Task 0: Phase 0 live spike — verify before building

Gates every other task. Writes no production code; produces findings and fixtures the later tasks assert against. `scripts/spike-social.sh` already exists.

**Files:**
- Create: `docs/plans/2026-08-21-phase0-findings.md`
- Create: `tests/fixtures/social/accounts.json`, `create-post.json`, `list-posts.json` (gitignored)

**Interfaces:**
- Produces: confirmed answers to the five unknowns, and recorded response bodies used as fixtures in Tasks 3–5.

- [ ] **Step 1: Run the read-only probes**

```bash
GHL_API_TOKEN='<pit>' GHL_LOCATION_ID='<location id>' bash scripts/spike-social.sh
```

Expected: HTTP 200 and a JSON body listing the connected accounts.

**Gate A — `Invalid JWT` or 401:** stop. The PIT route is dead; the fallback is a marketplace OAuth app, which is a spec change. Report and do not continue.

**Gate B — 401/403 with a scope error:** the accounts endpoint needs `socialplanner/account.readonly`, which this account cannot grant. Record it and implement **Task 3b** instead of Task 3. Everything else proceeds.

> **RUN 2026-08-21 — RESULT:** Gate A passed (the PIT authenticates). **Gate B fired**: the accounts
> endpoint returns `401 "The token is not authorized for this scope."` under both API versions.
> **Implement Task 3b, skip Task 3.** Full detail in `docs/plans/2026-08-21-phase0-findings.md`.
> Unknowns 3 and 4 remain open — see that document for how to unblock them.

- [ ] **Step 2: Run the write probe**

```bash
ACCOUNT_ID='<a facebook or linkedin id from step 1>' GHL_API_TOKEN='<pit>' GHL_LOCATION_ID='<loc>' bash scripts/spike-social.sh --create-draft
```

Expected: a post object with an `_id`, and the draft visible in the Social Planner UI.

**Gate C — external media URL rejected:** the spec's media non-goal is invalid and media-library upload returns to scope. Report before continuing; this changes five schemas.

- [ ] **Step 3: Delete the spike draft**

Use the delete command the script prints, or remove it in the Social Planner UI.

- [ ] **Step 4: Record the findings**

Write `docs/plans/2026-08-21-phase0-findings.md` answering all five unknowns, and stating explicitly:

- the `Version` header that worked
- the JSON path to the accounts array (e.g. `results.accounts`)
- the JSON path to a created post (e.g. `results.post`) and the id field (`_id` vs `id`)
- how "publish now" is expressed
- the request/response field names for `posts/list`
- real per-platform media limits

If the fixtures contain platform OAuth or refresh tokens, replace those values with `"REDACTED"` before saving. The fixtures directory is gitignored, but a redacted fixture is still the right habit.

- [ ] **Step 5: Commit the findings**

```bash
git add docs/plans/2026-08-21-phase0-findings.md
git commit -m "docs: phase 0 Social Planner API findings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 1: Extract tool descriptions

`src/mcp/tools.ts` is 180 lines, almost all prose. Eleven more descriptions would push it past 340. Extract first, so later tasks add to a file built for it. Pure refactor.

**Files:**
- Create: `src/mcp/descriptions.ts`
- Modify: `src/mcp/tools.ts`

**Interfaces:**
- Produces: `TOOL_DESCRIPTIONS: Record<ToolName, string>` exported from `src/mcp/descriptions.ts`.

- [ ] **Step 1: Move the constant**

Create `src/mcp/descriptions.ts`:

```typescript
import type { ToolName } from "./schemas.js";

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  // all 26 existing entries, moved verbatim from tools.ts, unchanged
};
```

- [ ] **Step 2: Import it in tools.ts**

Delete the `TOOL_DESCRIPTIONS` constant from `src/mcp/tools.ts` and add:

```typescript
import { TOOL_DESCRIPTIONS } from "./descriptions.js";
```

The `toolMap` loop and `defineTools` call are unchanged. `tools.ts` should drop to roughly 25 lines.

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck`
Expected: PASS. `tests/mcp/schemas.test.ts` asserts every tool has a description over 20 characters, which covers this refactor.

- [ ] **Step 4: Commit**

```bash
git add src/mcp/descriptions.ts src/mcp/tools.ts
git commit -m "refactor: move tool descriptions into their own module

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: Social constants, types, and the social upstream client

A second `UpstreamClient` rather than a wrapper around `ghlFetch`: it pins the Social Planner version header, overrides the 401/403 summaries with something actionable, and inherits retry and backoff for free.

**Files:**
- Modify: `src/constants.ts`, `src/ghl/types.ts`
- Create: `src/ghl/social.ts`, `tests/ghl/social.test.ts`

**Interfaces:**
- Produces:
  - constants: `SOCIAL_PLATFORMS`, `SocialPlatform`, `AUTHORABLE_POST_STATUSES`, `AuthorableStatus`, `SOCIAL_POST_STATUSES`, `SOCIAL_API_VERSION`, `MAX_MEDIA_ITEMS`, `MAX_SUMMARY_LENGTH`, `MAX_MEDIA_URL_LENGTH`, `MAX_YOUTUBE_TITLE_LENGTH`, `SOCIAL_POST_LIST_LIMIT`
  - types: `SocialAccount`, `MediaItem`, `SocialPost`
  - `socialFetch<T>(env: GHLApiEnv, init: UpstreamRequestInit): Promise<T>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ghl/social.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { ToolError } from "@bashco/mcp-toolkit";
import { socialFetch } from "../../src/ghl/social.js";
import { errorResponse, stubGhl, TEST_ENV } from "../helpers/stubGhl.js";

let stub: ReturnType<typeof stubGhl>;
afterEach(() => stub?.restore());

const ACCOUNTS_PATH = "/social-media-posting/loc123/accounts";

describe("socialFetch", () => {
  it("pins the Social Planner API version", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: { ok: true } });
    await socialFetch(TEST_ENV, { method: "GET", path: ACCOUNTS_PATH });

    // stubGhl records url/method/body; assert the version via a header probe route
    expect(stub.only().path).toBe(ACCOUNTS_PATH);
  });

  it("maps 401 to a message naming both scope and reconnection", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: errorResponse(401, { message: "expired" }) });
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
    stub = stubGhl({
      [`POST /social-media-posting/loc123/posts`]: errorResponse(422, {
        message: "secret internal detail",
      }),
    });
    const err = await socialFetch(TEST_ENV, {
      method: "POST",
      path: "/social-media-posting/loc123/posts",
      body: {},
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ToolError);
    expect((err as ToolError).userMessage).not.toContain("secret internal detail");
    expect((err as ToolError).internalMessage).toContain("secret internal detail");
  });
});
```

Note: a 401 is not retried by the toolkit (only 429, and 5xx/network on idempotent methods), so these tests do not wait out backoff. If a test ever needs a retried status, pass `sleep: async () => {}` when constructing the client.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ghl/social.test.ts`
Expected: FAIL — `src/ghl/social.js` does not exist.

- [ ] **Step 3: Add the constants**

Append to `src/constants.ts`:

```typescript
export const SOCIAL_PLATFORMS = ["facebook", "instagram", "youtube", "linkedin", "tiktok"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

/** Statuses a posting tool may set. "scheduled" is reachable only via schedule_social_post. */
export const AUTHORABLE_POST_STATUSES = ["draft", "published"] as const;
export type AuthorableStatus = (typeof AUTHORABLE_POST_STATUSES)[number];

export const SOCIAL_POST_STATUSES = ["draft", "scheduled", "published"] as const;

/** Confirmed against the live API in the Phase 0 spike. */
export const SOCIAL_API_VERSION = "2021-07-28";

export const MAX_MEDIA_ITEMS = 10;
export const MAX_SUMMARY_LENGTH = 5000;
export const MAX_MEDIA_URL_LENGTH = 2048;
export const MAX_YOUTUBE_TITLE_LENGTH = 100;
export const SOCIAL_POST_LIST_LIMIT = 50;
```

Use whatever `Version` the Phase 0 findings recorded, and update the comment if it differs.

- [ ] **Step 4: Add the types**

Append to `src/ghl/types.ts`:

```typescript
export interface SocialAccount {
  id: string;
  platform: string;
  /** False for platforms connected in GHL that this server has no posting tool for. */
  supported: boolean;
  name?: string;
}

export interface MediaItem {
  url: string;
  caption?: string;
  altText?: string;
}

export interface SocialPost {
  id: string;
  status?: string;
  summary?: string;
  scheduleDate?: string;
  accountIds?: string[];
  [key: string]: unknown;
}
```

- [ ] **Step 5: Create the social client**

```typescript
// src/ghl/social.ts
import {
  createUpstreamClient,
  type UpstreamClient,
  type UpstreamRequestInit,
} from "@bashco/mcp-toolkit";
import { GHL_BASE_URL, SOCIAL_API_VERSION } from "../constants.js";
import type { GHLApiEnv } from "../env.js";

// GHL returns 401 for BOTH causes here: a private-integration token missing a
// socialplanner scope, and a connected social account whose platform token has
// expired. The spike hit the first. A summary naming only one would send the
// caller down the wrong path, so it names both and puts the cheaper check first.
const UNAUTHORISED_SUMMARY =
  "the integration token may be missing a socialplanner scope, or the connected social account " +
  "may need reconnecting in the GoHighLevel Social Planner settings";

const clients = new WeakMap<GHLApiEnv, UpstreamClient>();

function socialClientFor(env: GHLApiEnv): UpstreamClient {
  const existing = clients.get(env);
  if (existing) return existing;

  const client = createUpstreamClient({
    upstreamName: "GHL Social",
    baseUrl: GHL_BASE_URL,
    buildHeaders: async () => ({
      Authorization: `Bearer ${env.GHL_API_TOKEN}`,
      Version: SOCIAL_API_VERSION,
    }),
    statusSummaries: {
      401: UNAUTHORISED_SUMMARY,
      403: UNAUTHORISED_SUMMARY,
    },
  });
  clients.set(env, client);
  return client;
}

export async function socialFetch<T = unknown>(
  env: GHLApiEnv,
  init: UpstreamRequestInit,
): Promise<T> {
  return socialClientFor(env).fetch<T>(init);
}
```

- [ ] **Step 6: Run tests**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/constants.ts src/ghl/types.ts src/ghl/social.ts tests/ghl/social.test.ts
git commit -m "feat: add social constants, types, and the Social Planner upstream client

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: List connected accounts and validate ownership — SUPERSEDED

> **DO NOT IMPLEMENT.** The 2026-08-21 spike returned 401 from the accounts endpoint: this account
> cannot grant `socialplanner/account.readonly`. **Implement Task 3b instead.** This task is kept
> for the day the scope becomes available (e.g. via an agency-level private integration), at which
> point swapping `listSocialAccounts` back is a one-function change — `assertAccountsBelongTo` and
> every caller are unaffected.

**Files:**
- Modify: `src/ghl/social.ts`, `tests/ghl/social.test.ts`

**Interfaces:**
- Produces:
  - `listSocialAccounts(env): Promise<SocialAccount[]>`
  - `assertAccountsBelongTo(env, platform: SocialPlatform, accountIds: string[]): Promise<void>` — throws `ToolError.validation` for an unknown ID or a platform mismatch

- [ ] **Step 1: Write the failing test**

Append to `tests/ghl/social.test.ts`, replacing `accountsBody` with the real shape from `tests/fixtures/social/accounts.json` if it differs:

```typescript
import { assertAccountsBelongTo, listSocialAccounts } from "../../src/ghl/social.js";

export const accountsBody = {
  success: true,
  results: {
    accounts: [
      { id: "fb-1", platform: "facebook", name: "Bashco Page" },
      { id: "ig-1", platform: "instagram", name: "@bashco" },
      { id: "yt-1", platform: "youtube", name: "Bashco" },
      { id: "li-1", platform: "linkedin", name: "Bashco" },
      { id: "tt-1", platform: "tiktok", name: "@bashco" },
      { id: "tw-1", platform: "twitter", name: "@bashco" },
    ],
  },
};

describe("listSocialAccounts", () => {
  it("normalises accounts and flags platforms with no posting tool", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody });
    const accounts = await listSocialAccounts(TEST_ENV);

    expect(accounts).toHaveLength(6);
    expect(accounts.find((a) => a.id === "yt-1")).toMatchObject({
      platform: "youtube",
      supported: true,
      name: "Bashco",
    });
    expect(accounts.find((a) => a.id === "tw-1")?.supported).toBe(false);
  });

  it("returns an empty list rather than throwing when nothing is connected", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: { success: true, results: { accounts: [] } } });
    expect(await listSocialAccounts(TEST_ENV)).toEqual([]);
  });

  it("drops entries with no usable id", async () => {
    stub = stubGhl({
      [`GET ${ACCOUNTS_PATH}`]: {
        results: { accounts: [{ platform: "facebook" }, { id: "fb-2", platform: "facebook" }] },
      },
    });
    expect((await listSocialAccounts(TEST_ENV)).map((a) => a.id)).toEqual(["fb-2"]);
  });
});

describe("assertAccountsBelongTo", () => {
  it("accepts ids that match the platform", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody });
    await expect(assertAccountsBelongTo(TEST_ENV, "instagram", ["ig-1"])).resolves.toBeUndefined();
  });

  it("rejects an id belonging to another platform", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody });
    await expect(assertAccountsBelongTo(TEST_ENV, "youtube", ["li-1"])).rejects.toBeInstanceOf(
      ToolError,
    );
  });

  it("rejects an unknown id", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody });
    await expect(assertAccountsBelongTo(TEST_ENV, "facebook", ["nope"])).rejects.toBeInstanceOf(
      ToolError,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ghl/social.test.ts`
Expected: FAIL — `listSocialAccounts` is not exported.

- [ ] **Step 3: Implement**

Append to `src/ghl/social.ts` (merge the imports with those already at the top):

```typescript
import { ToolError } from "@bashco/mcp-toolkit";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "../constants.js";
import { buildPath } from "./path.js";
import type { SocialAccount } from "./types.js";

interface RawAccount {
  id?: unknown;
  _id?: unknown;
  platform?: unknown;
  name?: unknown;
}

interface AccountsResponse {
  results?: { accounts?: RawAccount[] };
  accounts?: RawAccount[];
}

function normaliseAccount(raw: RawAccount): SocialAccount | null {
  const id = typeof raw.id === "string" ? raw.id : typeof raw._id === "string" ? raw._id : "";
  if (id === "") return null;
  const platform = typeof raw.platform === "string" ? raw.platform.toLowerCase() : "unknown";
  return {
    id,
    platform,
    supported: (SOCIAL_PLATFORMS as readonly string[]).includes(platform),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
  };
}

export async function listSocialAccounts(env: GHLApiEnv): Promise<SocialAccount[]> {
  const data = await socialFetch<AccountsResponse>(env, {
    method: "GET",
    path: buildPath("/social-media-posting/{locationId}/accounts", {
      locationId: env.GHL_LOCATION_ID,
    }),
  });

  const raw = data?.results?.accounts ?? data?.accounts ?? [];
  const accounts: SocialAccount[] = [];
  for (const item of raw) {
    const account = normaliseAccount(item);
    if (account !== null) accounts.push(account);
  }
  return accounts;
}

export async function assertAccountsBelongTo(
  env: GHLApiEnv,
  platform: SocialPlatform,
  accountIds: string[],
): Promise<void> {
  const accounts = await listSocialAccounts(env);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const id of accountIds) {
    const account = byId.get(id);
    if (account === undefined) {
      throw ToolError.validation(
        "unknown social account id — run list_social_accounts for the valid ids",
        `account ${id} not connected in location ${env.GHL_LOCATION_ID}`,
      );
    }
    if (account.platform !== platform) {
      throw ToolError.validation(
        `account ${id} is a ${account.platform} account, not ${platform}`,
        `platform mismatch: ${id} is ${account.platform}, expected ${platform}`,
      );
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ghl/social.ts tests/ghl/social.test.ts
git commit -m "feat: list connected social accounts and validate ownership

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3b: Config-sourced accounts — CONFIRMED PATH

Replaces Task 3. The 2026-08-21 spike confirmed the accounts endpoint returns 401 because this
private integration cannot grant `socialplanner/account.readonly`. The exported signatures are
identical to Task 3's, so Tasks 4–10 are unaffected by the swap.

`normaliseAccount`, `RawAccount`, and `assertAccountsBelongTo` are still needed — take them from
Task 3 Step 3 verbatim, minus `listSocialAccounts`, which this task defines instead.

**Files:**
- Modify: `src/env.ts`, `src/ghl/social.ts`, `vitest.config.ts`, `wrangler.toml` (secrets comment), `README.md`
- Modify: `tests/helpers/stubGhl.ts` (add the field to `TEST_ENV`), `tests/ghl/social.test.ts`

- [ ] **Step 1: Define the secret**

`GHL_SOCIAL_ACCOUNTS` is a JSON array read once from the Social Planner UI:

```json
[{"id":"fb-1","platform":"facebook","name":"Bashco Page"},{"id":"ig-1","platform":"instagram","name":"@bashco"}]
```

- [ ] **Step 2: Write the failing test**

```typescript
describe("listSocialAccounts from config", () => {
  const configEnv = {
    ...TEST_ENV,
    GHL_SOCIAL_ACCOUNTS: JSON.stringify([
      { id: "fb-1", platform: "facebook", name: "Bashco Page" },
      { id: "yt-1", platform: "youtube", name: "Bashco" },
    ]),
  };

  it("parses configured accounts without any upstream call", async () => {
    stub = stubGhl({}); // any request would throw: no routes registered
    const accounts = await listSocialAccounts(configEnv);

    expect(stub.calls).toHaveLength(0);
    expect(accounts[0]).toMatchObject({ id: "fb-1", platform: "facebook", supported: true });
  });

  it("throws a configuration error when the secret is unparseable", async () => {
    await expect(
      listSocialAccounts({ ...TEST_ENV, GHL_SOCIAL_ACCOUNTS: "not json" }),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
```

- [ ] **Step 3: Add the binding**

In `src/env.ts` add `GHL_SOCIAL_ACCOUNTS: string;` to `GHLApiEnv` and copy it through `ghlEnvFrom`. Add `GHL_SOCIAL_ACCOUNTS: "[]"` to the miniflare `bindings` in `vitest.config.ts`, add the field to `TEST_ENV` in `tests/helpers/stubGhl.ts`, and document it in the `wrangler.toml` secrets comment and the README secrets table.

- [ ] **Step 4: Implement**

```typescript
export async function listSocialAccounts(env: GHLApiEnv): Promise<SocialAccount[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.GHL_SOCIAL_ACCOUNTS);
  } catch {
    throw new ToolError({
      userMessage:
        "social accounts are not configured on this server — the operator must set GHL_SOCIAL_ACCOUNTS",
      internalMessage: "GHL_SOCIAL_ACCOUNTS is not valid JSON",
      status: 500,
    });
  }
  if (!Array.isArray(parsed)) {
    throw new ToolError({
      userMessage: "social accounts are not configured on this server",
      internalMessage: "GHL_SOCIAL_ACCOUNTS is not an array",
      status: 500,
    });
  }

  const accounts: SocialAccount[] = [];
  for (const item of parsed) {
    const account = normaliseAccount(item as RawAccount);
    if (account !== null) accounts.push(account);
  }
  return accounts;
}
```

`assertAccountsBelongTo` is unchanged — it calls `listSocialAccounts` and does not care where the list came from.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run typecheck`

```bash
git add src/env.ts src/ghl/social.ts tests/ vitest.config.ts wrangler.toml README.md
git commit -m "feat: source social accounts from config where the API scope is unavailable

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Create a post

**Files:**
- Modify: `src/ghl/social.ts`, `tests/ghl/social.test.ts`

**Interfaces:**
- Produces:
  - `CreatePostInput { platform: SocialPlatform; accountIds: string[]; type: "post" | "story" | "reel"; status: AuthorableStatus; summary?: string; media?: MediaItem[]; followUpComment?: string; details: Record<string, unknown> }`
  - `createPost(env, input): Promise<SocialPost>`
  - `normalisePost(raw: unknown): SocialPost | null` (module-internal; reused in Task 5)

- [ ] **Step 1: Write the failing test**

```typescript
import { createPost } from "../../src/ghl/social.js";

const POSTS_PATH = "/social-media-posting/loc123/posts";
const createdBody = { results: { post: { _id: "post-1", status: "draft", summary: "hello" } } };

describe("createPost", () => {
  it("sends the platform details block and returns a normalised post", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody, [`POST ${POSTS_PATH}`]: createdBody });

    const post = await createPost(TEST_ENV, {
      platform: "youtube",
      accountIds: ["yt-1"],
      type: "post",
      status: "draft",
      summary: "hello",
      media: [{ url: "https://example.com/v.mp4" }],
      details: { youtubePostDetails: { title: "My video", privacyLevel: "private" } },
    });

    expect(post.id).toBe("post-1");
    const created = stub.calls.find((c) => c.method === "POST");
    const body = created?.body as Record<string, unknown>;
    expect(body.accountIds).toEqual(["yt-1"]);
    expect(body.status).toBe("draft");
    expect(body.type).toBe("post");
    expect(body.userId).toBe("user456");
    expect(body.youtubePostDetails).toEqual({ title: "My video", privacyLevel: "private" });
  });

  it("validates account ownership before sending anything", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody });

    await expect(
      createPost(TEST_ENV, {
        platform: "youtube",
        accountIds: ["li-1"],
        type: "post",
        status: "draft",
        details: {},
      }),
    ).rejects.toBeInstanceOf(ToolError);

    // No POST route is registered: reaching one would throw a different error.
    expect(stub.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("throws a safe error when GHL returns no post object", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody, [`POST ${POSTS_PATH}`]: { results: {} } });

    await expect(
      createPost(TEST_ENV, {
        platform: "facebook",
        accountIds: ["fb-1"],
        type: "post",
        status: "draft",
        summary: "hi",
        details: {},
      }),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("omits optional fields rather than sending undefined", async () => {
    stub = stubGhl({ [`GET ${ACCOUNTS_PATH}`]: accountsBody, [`POST ${POSTS_PATH}`]: createdBody });

    await createPost(TEST_ENV, {
      platform: "facebook",
      accountIds: ["fb-1"],
      type: "post",
      status: "published",
      summary: "text only",
      details: {},
    });

    const body = stub.calls.find((c) => c.method === "POST")?.body as Record<string, unknown>;
    expect("media" in body).toBe(false);
    expect("followUpComment" in body).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ghl/social.test.ts`
Expected: FAIL — `createPost` is not exported.

- [ ] **Step 3: Implement**

```typescript
import type { AuthorableStatus } from "../constants.js";
import type { MediaItem, SocialPost } from "./types.js";

export interface CreatePostInput {
  platform: SocialPlatform;
  accountIds: string[];
  type: "post" | "story" | "reel";
  status: AuthorableStatus;
  summary?: string;
  media?: MediaItem[];
  followUpComment?: string;
  /** Platform-specific block, e.g. { youtubePostDetails: {...} }, built in platforms.ts. */
  details: Record<string, unknown>;
}

function normalisePost(raw: unknown): SocialPost | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const id =
    typeof record._id === "string" ? record._id : typeof record.id === "string" ? record.id : "";
  if (id === "") return null;

  const rest = { ...record };
  delete rest._id;
  return { ...rest, id };
}

export async function createPost(env: GHLApiEnv, input: CreatePostInput): Promise<SocialPost> {
  await assertAccountsBelongTo(env, input.platform, input.accountIds);

  const data = await socialFetch<{ results?: { post?: unknown } }>(env, {
    method: "POST",
    path: buildPath("/social-media-posting/{locationId}/posts", {
      locationId: env.GHL_LOCATION_ID,
    }),
    body: {
      accountIds: input.accountIds,
      type: input.type,
      status: input.status,
      userId: env.GHL_USER_ID,
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.media !== undefined ? { media: input.media } : {}),
      ...(input.followUpComment !== undefined ? { followUpComment: input.followUpComment } : {}),
      ...input.details,
    },
  });

  const post = normalisePost(data?.results?.post);
  if (post === null) {
    throw new ToolError({
      userMessage:
        "GoHighLevel accepted the request but returned no post — check the Social Planner before retrying",
      internalMessage: `unexpected create-post response: ${JSON.stringify(data).slice(0, 512)}`,
      status: 502,
    });
  }
  return post;
}
```

If Phase 0 found that "publish now" is not `status: "published"`, translate it in one place here with a `toGhlStatus(status: AuthorableStatus)` helper, and record the mapping in the findings doc.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck`

```bash
git add src/ghl/social.ts tests/ghl/social.test.ts
git commit -m "feat: create Social Planner posts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: Post lifecycle data layer

**Files:**
- Modify: `src/ghl/social.ts`, `tests/ghl/social.test.ts`

**Interfaces:**
- Produces:
  - `listPosts(env, filters: { platform?: SocialPlatform; status?: string; fromDate?: string; toDate?: string; limit?: number }): Promise<SocialPost[]>`
  - `getPost(env, postId): Promise<SocialPost>`
  - `updatePost(env, postId, patch: { summary?: string; media?: MediaItem[] }): Promise<SocialPost>`
  - `schedulePost(env, postId, scheduleDate): Promise<SocialPost>`
  - `deletePost(env, postId): Promise<{ deleted: true; postId: string }>`

- [ ] **Step 1: Write the failing test**

```typescript
import { deletePost, getPost, listPosts, schedulePost, updatePost } from "../../src/ghl/social.js";

const LIST_PATH = "/social-media-posting/loc123/posts/list";
const POST_PATH = "/social-media-posting/loc123/posts/p1";

describe("post lifecycle", () => {
  it("lists posts, normalising _id to id", async () => {
    stub = stubGhl({ [`POST ${LIST_PATH}`]: { posts: [{ _id: "p1" }, { _id: "p2" }] } });
    expect((await listPosts(TEST_ENV, { limit: 10 })).map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("sends the list filters in the body", async () => {
    stub = stubGhl({ [`POST ${LIST_PATH}`]: { posts: [] } });
    await listPosts(TEST_ENV, { fromDate: daysFromNow(-7), toDate: daysFromNow(7), limit: 5 });

    const body = stub.only().body as Record<string, unknown>;
    // Number strings, not numbers — GHL 422s on numeric skip/limit.
    expect(body.limit).toBe("5");
    expect(body.skip).toBe("0");
    expect(body.fromDate).toBeDefined();
    expect("accountIds" in body).toBe(false);
  });

  it("filters by platform using that platform's account ids", async () => {
    stub = stubGhl({
      [`POST ${LIST_PATH}`]: { posts: [{ _id: "p1", accountIds: ["ig-1"] }, { _id: "p2", accountIds: ["fb-1"] }] },
      [`GET ${ACCOUNTS_PATH}`]: accountsBody,
    });
    expect((await listPosts(TEST_ENV, { platform: "instagram" })).map((p) => p.id)).toEqual(["p1"]);
  });

  it("gets a single post", async () => {
    stub = stubGhl({ [`GET ${POST_PATH}`]: { results: { post: { _id: "p1", summary: "hi" } } } });
    expect(await getPost(TEST_ENV, "p1")).toMatchObject({ id: "p1", summary: "hi" });
  });

  it("throws not-found when the post is missing", async () => {
    stub = stubGhl({ [`GET ${POST_PATH}`]: { results: {} } });
    await expect(getPost(TEST_ENV, "p1")).rejects.toBeInstanceOf(ToolError);
  });

  it("updates only the fields provided", async () => {
    stub = stubGhl({ [`PUT ${POST_PATH}`]: { results: { post: { _id: "p1", summary: "new" } } } });
    await updatePost(TEST_ENV, "p1", { summary: "new" });

    const body = stub.only().body as Record<string, unknown>;
    expect(body.summary).toBe("new");
    expect("media" in body).toBe(false);
    expect("scheduleDate" in body).toBe(false);
  });

  it("schedules by setting status and scheduleDate together", async () => {
    stub = stubGhl({ [`PUT ${POST_PATH}`]: { results: { post: { _id: "p1", status: "scheduled" } } } });
    const when = daysFromNow(2);
    await schedulePost(TEST_ENV, "p1", when);

    const body = stub.only().body as Record<string, unknown>;
    expect(body.status).toBe("scheduled");
    expect(body.scheduleDate).toBe(when);
  });

  it("deletes a post and reports the id back", async () => {
    stub = stubGhl({ [`DELETE ${POST_PATH}`]: { success: true } });
    expect(await deletePost(TEST_ENV, "p1")).toEqual({ deleted: true, postId: "p1" });
  });

  it("rejects a post id that fails the GHL id pattern", async () => {
    stub = stubGhl({});
    await expect(getPost(TEST_ENV, "../accounts")).rejects.toBeInstanceOf(ToolError);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ghl/social.test.ts`
Expected: FAIL — none of the five are exported.

- [ ] **Step 3: Implement**

Adjust the list request/response field names to match `tests/fixtures/social/list-posts.json`.

```typescript
import { SOCIAL_POST_LIST_LIMIT } from "../constants.js";

export interface ListPostFilters {
  platform?: SocialPlatform;
  status?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

const POST_TEMPLATE = "/social-media-posting/{locationId}/posts/{postId}";

export async function listPosts(env: GHLApiEnv, filters: ListPostFilters): Promise<SocialPost[]> {
  const data = await socialFetch<{ posts?: unknown[]; results?: { posts?: unknown[] } }>(env, {
    method: "POST",
    path: buildPath("/social-media-posting/{locationId}/posts/list", {
      locationId: env.GHL_LOCATION_ID,
    }),
    // Confirmed by the Phase 0 422: skip and limit must be NUMBER STRINGS, and
    // accountIds is rejected outright ("property accountIds should not exist"),
    // which is why the platform filter below is applied client-side.
    body: {
      type: "recent",
      skip: "0",
      limit: String(filters.limit ?? SOCIAL_POST_LIST_LIMIT),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.fromDate !== undefined ? { fromDate: filters.fromDate } : {}),
      ...(filters.toDate !== undefined ? { toDate: filters.toDate } : {}),
    },
  });

  const raw = data?.posts ?? data?.results?.posts ?? [];
  const posts: SocialPost[] = [];
  for (const item of raw) {
    const post = normalisePost(item);
    if (post !== null) posts.push(post);
  }

  if (filters.platform === undefined) return posts;

  // Posts carry account ids, not platform names, so resolve the platform's
  // accounts and keep posts targeting at least one of them.
  const accounts = await listSocialAccounts(env);
  const ids = new Set(accounts.filter((a) => a.platform === filters.platform).map((a) => a.id));
  return posts.filter((p) => (p.accountIds ?? []).some((id) => ids.has(id)));
}

export async function getPost(env: GHLApiEnv, postId: string): Promise<SocialPost> {
  const data = await socialFetch<{ results?: { post?: unknown } }>(env, {
    method: "GET",
    path: buildPath(POST_TEMPLATE, { locationId: env.GHL_LOCATION_ID, postId }),
  });
  const post = normalisePost(data?.results?.post);
  if (post === null) throw ToolError.notFound("social post", postId);
  return post;
}

export async function updatePost(
  env: GHLApiEnv,
  postId: string,
  patch: { summary?: string; media?: MediaItem[] },
): Promise<SocialPost> {
  const data = await socialFetch<{ results?: { post?: unknown } }>(env, {
    method: "PUT",
    path: buildPath(POST_TEMPLATE, { locationId: env.GHL_LOCATION_ID, postId }),
    body: {
      ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
      ...(patch.media !== undefined ? { media: patch.media } : {}),
    },
  });
  const post = normalisePost(data?.results?.post);
  if (post === null) throw ToolError.notFound("social post", postId);
  return post;
}

export async function schedulePost(
  env: GHLApiEnv,
  postId: string,
  scheduleDate: string,
): Promise<SocialPost> {
  const data = await socialFetch<{ results?: { post?: unknown } }>(env, {
    method: "PUT",
    path: buildPath(POST_TEMPLATE, { locationId: env.GHL_LOCATION_ID, postId }),
    body: { status: "scheduled", scheduleDate },
  });
  const post = normalisePost(data?.results?.post);
  if (post === null) throw ToolError.notFound("social post", postId);
  return post;
}

export async function deletePost(
  env: GHLApiEnv,
  postId: string,
): Promise<{ deleted: true; postId: string }> {
  await socialFetch(env, {
    method: "DELETE",
    path: buildPath(POST_TEMPLATE, { locationId: env.GHL_LOCATION_ID, postId }),
  });
  return { deleted: true, postId };
}
```

- [ ] **Step 4: Check file size**

Run: `wc -l src/ghl/social.ts`
Expected: under 400. If it passes 450, split accounts into `src/ghl/social-accounts.ts` and re-export.

- [ ] **Step 5: Run tests and commit**

Run: `npm test && npm run typecheck`

```bash
git add src/ghl/social.ts tests/ghl/social.test.ts
git commit -m "feat: list, get, update, schedule, and delete social posts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: Per-platform payload builders

Pure functions — no network, no env — so the per-platform mapping is exhaustively testable on its own.

**Files:**
- Create: `src/ghl/platforms.ts`, `tests/ghl/platforms.test.ts`

**Interfaces:**
- Produces: `buildFacebookPost`, `buildInstagramPost`, `buildYoutubePost`, `buildLinkedinPost`, `buildTiktokPost` — each returning a `CreatePostInput`, plus the arg interfaces `InstagramArgs`, `YoutubeArgs`, `LinkedinArgs`, `TiktokArgs`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/ghl/platforms.test.ts
import { describe, expect, it } from "vitest";
import {
  buildFacebookPost,
  buildInstagramPost,
  buildLinkedinPost,
  buildTiktokPost,
  buildYoutubePost,
} from "../../src/ghl/platforms.js";

const media = [{ url: "https://example.com/a.jpg" }];

describe("buildFacebookPost", () => {
  it("produces a text-only post with no media key", () => {
    const input = buildFacebookPost({ accountIds: ["fb-1"], summary: "hi", status: "draft" });
    expect(input.platform).toBe("facebook");
    expect(input.type).toBe("post");
    expect(input.media).toBeUndefined();
    expect(input.details).toEqual({ facebookPostDetails: {} });
  });

  it("carries media and a follow-up comment through", () => {
    const input = buildFacebookPost({
      accountIds: ["fb-1"],
      summary: "hi",
      status: "published",
      media,
      followUpComment: "first!",
    });
    expect(input.media).toEqual(media);
    expect(input.followUpComment).toBe("first!");
  });
});

describe("buildInstagramPost", () => {
  it("maps postType reel onto type reel", () => {
    const input = buildInstagramPost({
      accountIds: ["ig-1"],
      summary: "hi",
      status: "draft",
      media,
      postType: "reel",
    });
    expect(input.type).toBe("reel");
    expect(input.platform).toBe("instagram");
  });

  it("includes collaborators when given", () => {
    const input = buildInstagramPost({
      accountIds: ["ig-1"],
      summary: "hi",
      status: "draft",
      media,
      postType: "post",
      collaborators: ["@someone"],
    });
    expect(input.details).toEqual({ instagramPostDetails: { collaborators: ["@someone"] } });
  });
});

describe("buildYoutubePost", () => {
  it("puts title and privacy in youtubePostDetails", () => {
    const input = buildYoutubePost({
      accountIds: ["yt-1"],
      title: "My video",
      status: "draft",
      privacy: "unlisted",
      media,
    });
    expect(input.details).toEqual({
      youtubePostDetails: { title: "My video", privacyLevel: "unlisted" },
    });
  });
});

describe("buildLinkedinPost", () => {
  it("marks a document post when requested", () => {
    const input = buildLinkedinPost({
      accountIds: ["li-1"],
      summary: "deck",
      status: "draft",
      media,
      documentPost: true,
    });
    expect(input.details).toEqual({ linkedinPostDetails: { documentPost: true } });
  });

  it("omits documentPost when not requested", () => {
    const input = buildLinkedinPost({ accountIds: ["li-1"], summary: "text", status: "draft" });
    expect(input.details).toEqual({ linkedinPostDetails: {} });
  });
});

describe("buildTiktokPost", () => {
  it("maps the interaction toggles", () => {
    const input = buildTiktokPost({
      accountIds: ["tt-1"],
      summary: "hi",
      status: "draft",
      media,
      privacyLevel: "PUBLIC_TO_EVERYONE",
      allowComments: true,
      allowDuet: false,
      allowStitch: false,
    });
    expect(input.details).toEqual({
      tiktokPostDetails: {
        privacyLevel: "PUBLIC_TO_EVERYONE",
        allowComment: true,
        allowDuet: false,
        allowStitch: false,
      },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/ghl/platforms.test.ts`
Expected: FAIL — `src/ghl/platforms.js` does not exist.

- [ ] **Step 3: Implement**

```typescript
// src/ghl/platforms.ts
import type { AuthorableStatus } from "../constants.js";
import type { CreatePostInput } from "./social.js";
import type { MediaItem } from "./types.js";

interface CommonArgs {
  accountIds: string[];
  status: AuthorableStatus;
  summary?: string;
  media?: MediaItem[];
  followUpComment?: string;
}

function common(args: CommonArgs): Omit<CreatePostInput, "platform" | "type" | "details"> {
  return {
    accountIds: args.accountIds,
    status: args.status,
    ...(args.summary !== undefined ? { summary: args.summary } : {}),
    ...(args.media !== undefined ? { media: args.media } : {}),
    ...(args.followUpComment !== undefined ? { followUpComment: args.followUpComment } : {}),
  };
}

export function buildFacebookPost(args: CommonArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "facebook",
    type: "post",
    details: { facebookPostDetails: {} },
  };
}

export interface InstagramArgs extends CommonArgs {
  media: MediaItem[];
  postType: "post" | "reel" | "story";
  collaborators?: string[];
}

export function buildInstagramPost(args: InstagramArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "instagram",
    type: args.postType,
    details: {
      instagramPostDetails: {
        ...(args.collaborators !== undefined ? { collaborators: args.collaborators } : {}),
      },
    },
  };
}

export interface YoutubeArgs extends CommonArgs {
  media: MediaItem[];
  title: string;
  privacy: "public" | "unlisted" | "private";
}

export function buildYoutubePost(args: YoutubeArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "youtube",
    type: "post",
    details: { youtubePostDetails: { title: args.title, privacyLevel: args.privacy } },
  };
}

export interface LinkedinArgs extends CommonArgs {
  documentPost?: boolean;
}

export function buildLinkedinPost(args: LinkedinArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "linkedin",
    type: "post",
    details: {
      linkedinPostDetails: {
        ...(args.documentPost !== undefined ? { documentPost: args.documentPost } : {}),
      },
    },
  };
}

export interface TiktokArgs extends CommonArgs {
  media: MediaItem[];
  privacyLevel: "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY";
  allowComments: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
}

export function buildTiktokPost(args: TiktokArgs): CreatePostInput {
  return {
    ...common(args),
    platform: "tiktok",
    type: "post",
    details: {
      tiktokPostDetails: {
        privacyLevel: args.privacyLevel,
        allowComment: args.allowComments,
        allowDuet: args.allowDuet,
        allowStitch: args.allowStitch,
      },
    },
  };
}
```

If Phase 0 recorded different key names inside a `*PostDetails` block, use the recorded names and update the test expectations to match.

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck`

```bash
git add src/ghl/platforms.ts tests/ghl/platforms.test.ts
git commit -m "feat: add per-platform Social Planner payload builders

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire up `list_social_accounts`

One tool end to end — schema, description, handler, catalogue — proving the wiring before ten more ride on it.

**Files:**
- Modify: `src/mcp/schemas.ts`, `src/mcp/descriptions.ts`, `src/mcp/handlers.ts`, `tests/mcp/schemas.test.ts`

**Interfaces:**
- Produces: tool `list_social_accounts`, returning `TruncatedList<SocialAccount>`. Tool count 26 → 27.

- [ ] **Step 1: Write the failing test**

In `tests/mcp/schemas.test.ts`, add `"list_social_accounts"` to `expectedTools` and update the count in the test name to 27.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/mcp/schemas.test.ts`
Expected: FAIL — 26 declared, 27 expected.

- [ ] **Step 3: Add schema, description, handler**

`src/mcp/schemas.ts`:

```typescript
  list_social_accounts: z.object({}),
```

`src/mcp/descriptions.ts`:

```typescript
  list_social_accounts:
    "List the social media accounts connected to GoHighLevel's Social Planner — Facebook, " +
    "Instagram, YouTube, LinkedIn and TikTok — each with its account ID, platform and name. " +
    "ALWAYS run this first before any post_to_* tool: those tools require explicit account IDs " +
    "and reject an ID that belongs to a different platform. " +
    "Accounts with supported: false are connected to GoHighLevel but have no posting tool here. " +
    "Returns { items, returned, total, truncated }.",
```

`src/mcp/handlers.ts`:

```typescript
import { listSocialAccounts } from "../ghl/social.js";
```

```typescript
  list_social_accounts: async (env) =>
    truncateList(
      await listSocialAccounts(env),
      "connected social accounts",
      "Disconnect unused accounts in the Social Planner if this list is unwieldy.",
    ),
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test && npm run typecheck`

```bash
git add src/mcp/schemas.ts src/mcp/descriptions.ts src/mcp/handlers.ts tests/mcp/schemas.test.ts
git commit -m "feat: add list_social_accounts tool

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: The five posting tools

**Files:**
- Modify: `src/mcp/schemas.ts`, `src/mcp/descriptions.ts`, `src/mcp/handlers.ts`, `tests/mcp/schemas.test.ts`

**Interfaces:**
- Produces: `post_to_facebook`, `post_to_instagram`, `post_to_youtube`, `post_to_linkedin`, `post_to_tiktok`. Tool count 27 → 32.

- [ ] **Step 1: Write the failing validation tests**

Add the five names to `expectedTools`, update the count to 32, and append:

```typescript
describe("social posting schemas", () => {
  const media = [{ url: "https://example.com/a.jpg" }];

  it("requires an explicit status on every posting tool", () => {
    expect(toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi" }).success).toBe(false);
    expect(
      toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi", status: "draft" }).success,
    ).toBe(true);
  });

  it("does not accept 'scheduled' as an authoring status", () => {
    expect(
      toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi", status: "scheduled" }).success,
    ).toBe(false);
  });

  it("rejects non-https media urls", () => {
    for (const url of ["http://example.com/a.jpg", "data:image/png;base64,AAAA", "/local/a.jpg"]) {
      expect(
        toolSchemas.post_to_instagram.safeParse({
          accountIds: ["ig-1"],
          summary: "hi",
          status: "draft",
          postType: "post",
          media: [{ url }],
        }).success,
      ).toBe(false);
    }
  });

  it("requires media on instagram, youtube and tiktok but not facebook or linkedin", () => {
    expect(
      toolSchemas.post_to_instagram.safeParse({ accountIds: ["ig-1"], summary: "hi", status: "draft", postType: "post" }).success,
    ).toBe(false);
    expect(toolSchemas.post_to_facebook.safeParse({ accountIds: ["fb-1"], summary: "hi", status: "draft" }).success).toBe(true);
    expect(toolSchemas.post_to_linkedin.safeParse({ accountIds: ["li-1"], summary: "hi", status: "draft" }).success).toBe(true);
  });

  it("requires exactly one video and a bounded title for youtube", () => {
    const base = { accountIds: ["yt-1"], status: "draft" as const, privacy: "private" as const };
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, title: "t", media }).success).toBe(true);
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, title: "t", media: [...media, ...media] }).success).toBe(false);
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, media }).success).toBe(false);
    expect(toolSchemas.post_to_youtube.safeParse({ ...base, title: "x".repeat(101), media }).success).toBe(false);
  });

  it("rejects an empty account list", () => {
    expect(toolSchemas.post_to_facebook.safeParse({ accountIds: [], summary: "hi", status: "draft" }).success).toBe(false);
  });

  it("requires tiktok interaction settings to be explicit", () => {
    expect(
      toolSchemas.post_to_tiktok.safeParse({
        accountIds: ["tt-1"],
        summary: "hi",
        status: "draft",
        media,
        privacyLevel: "SELF_ONLY",
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/mcp/schemas.test.ts`
Expected: FAIL — the five schemas do not exist.

- [ ] **Step 3: Add the shared schema pieces**

In `src/mcp/schemas.ts`, extend the constants import with `AUTHORABLE_POST_STATUSES`, `MAX_MEDIA_ITEMS`, `MAX_MEDIA_URL_LENGTH`, `MAX_SUMMARY_LENGTH`, `MAX_YOUTUBE_TITLE_LENGTH`, then add beside the existing helpers:

```typescript
const socialAccountIds = z.array(ghlId).min(1).max(10);

// A regex rather than a .refine: zod renders `pattern` into the derived JSON
// Schema, so the caller can see the rule. Refinements are dropped silently.
const mediaItem = z.object({
  url: z.string().max(MAX_MEDIA_URL_LENGTH).regex(/^https:\/\//, "media url must start with https://"),
  caption: limitedString(2200).optional(),
  altText: limitedString(420).optional(),
});

const mediaList = z.array(mediaItem).min(1).max(MAX_MEDIA_ITEMS);
const singleMedia = z.array(mediaItem).length(1);
const socialSummary = limitedString(MAX_SUMMARY_LENGTH);
const authorableStatus = z.enum(AUTHORABLE_POST_STATUSES);
const followUpComment = limitedString(2200);
```

- [ ] **Step 4: Add the five schemas**

```typescript
  post_to_facebook: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: mediaList.optional(),
    followUpComment: followUpComment.optional(),
  }),

  post_to_instagram: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: mediaList,
    postType: z.enum(["post", "reel", "story"]),
    collaborators: z.array(limitedString(64)).max(3).optional(),
    followUpComment: followUpComment.optional(),
  }),

  post_to_youtube: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    title: limitedString(MAX_YOUTUBE_TITLE_LENGTH),
    summary: socialSummary.optional(),
    media: singleMedia,
    privacy: z.enum(["public", "unlisted", "private"]),
  }),

  post_to_linkedin: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: mediaList.optional(),
    documentPost: z.boolean().optional(),
    followUpComment: followUpComment.optional(),
  }),

  post_to_tiktok: z.object({
    accountIds: socialAccountIds,
    status: authorableStatus,
    summary: socialSummary,
    media: singleMedia,
    privacyLevel: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"]),
    allowComments: z.boolean(),
    allowDuet: z.boolean(),
    allowStitch: z.boolean(),
  }),
```

- [ ] **Step 5: Add the five descriptions**

```typescript
  post_to_facebook:
    "Post to a connected Facebook Page through GoHighLevel's Social Planner. " +
    "Accepts text alone, or text with up to 10 images or one video as public https:// URLs. " +
    "Run list_social_accounts first to get Facebook account IDs. " +
    "status is REQUIRED and explicit: 'draft' stages the post in the Social Planner for review, " +
    "'published' posts it immediately and cannot be undone. To schedule for later, create it as a " +
    "draft and then call schedule_social_post. " +
    "A successful response means GoHighLevel queued the post, not that Facebook accepted it — " +
    "call get_social_post to confirm.",

  post_to_instagram:
    "Post to a connected Instagram Business or Creator account through GoHighLevel's Social Planner. " +
    "Media is REQUIRED — Instagram rejects text-only posts. Pass public https:// URLs. " +
    "postType selects the format: 'post' for a feed post or carousel, 'reel' for a Reel, 'story' for a Story. " +
    "Run list_social_accounts first to get Instagram account IDs. " +
    "status is REQUIRED and explicit: 'draft' stages the post, 'published' posts immediately and cannot " +
    "be undone. To schedule for later, create a draft then call schedule_social_post. " +
    "A successful response means the post was queued, not that Instagram accepted it — confirm with get_social_post.",

  post_to_youtube:
    "Upload a video to a connected YouTube channel through GoHighLevel's Social Planner. " +
    "Requires exactly one video as a public https:// URL and a title of 100 characters or fewer; " +
    "summary becomes the video description. " +
    "privacy is REQUIRED — 'public', 'unlisted' or 'private' — because it decides whether the whole " +
    "internet can see the video, and it is not something to guess a default for. " +
    "Run list_social_accounts first to get the YouTube account ID. " +
    "status is REQUIRED: 'draft' stages it, 'published' uploads immediately. " +
    "To schedule for later, create a draft then call schedule_social_post. " +
    "Video processing is asynchronous — call get_social_post to confirm the upload succeeded.",

  post_to_linkedin:
    "Post to a connected LinkedIn profile or company page through GoHighLevel's Social Planner. " +
    "Accepts text alone, text with images, or a PDF document carousel (set documentPost: true and pass " +
    "the PDF as the single media item). All media must be public https:// URLs. " +
    "Run list_social_accounts first to get LinkedIn account IDs. " +
    "status is REQUIRED and explicit: 'draft' stages the post, 'published' posts immediately and cannot " +
    "be undone. To schedule for later, create a draft then call schedule_social_post. " +
    "A successful response means the post was queued, not that LinkedIn accepted it.",

  post_to_tiktok:
    "Post a video to a connected TikTok account through GoHighLevel's Social Planner. " +
    "Requires exactly one video as a public https:// URL. " +
    "privacyLevel, allowComments, allowDuet and allowStitch are all REQUIRED and explicit — TikTok " +
    "applies them at publish time and they cannot be changed afterwards. " +
    "privacyLevel 'PUBLIC_TO_EVERYONE' is visible to anyone; 'SELF_ONLY' stays private on TikTok. " +
    "Run list_social_accounts first to get the TikTok account ID. " +
    "status is REQUIRED: 'draft' stages it, 'published' posts immediately. " +
    "To schedule for later, create a draft then call schedule_social_post.",
```

- [ ] **Step 6: Add the five handlers**

`compact()` handles the optional fields, so no conditional spreads are needed:

```typescript
import {
  buildFacebookPost,
  buildInstagramPost,
  buildLinkedinPost,
  buildTiktokPost,
  buildYoutubePost,
} from "../ghl/platforms.js";
import { createPost, listSocialAccounts } from "../ghl/social.js";
```

```typescript
  post_to_facebook: (env, args) =>
    createPost(env, buildFacebookPost({ ...compact(args), accountIds: args.accountIds, status: args.status })),

  post_to_instagram: (env, args) =>
    createPost(
      env,
      buildInstagramPost({
        ...compact(args),
        accountIds: args.accountIds,
        status: args.status,
        media: args.media,
        postType: args.postType,
      }),
    ),

  post_to_youtube: (env, args) =>
    createPost(
      env,
      buildYoutubePost({
        ...compact(args),
        accountIds: args.accountIds,
        status: args.status,
        media: args.media,
        title: args.title,
        privacy: args.privacy,
      }),
    ),

  post_to_linkedin: (env, args) =>
    createPost(env, buildLinkedinPost({ ...compact(args), accountIds: args.accountIds, status: args.status })),

  post_to_tiktok: (env, args) =>
    createPost(
      env,
      buildTiktokPost({
        ...compact(args),
        accountIds: args.accountIds,
        status: args.status,
        media: args.media,
        privacyLevel: args.privacyLevel,
        allowComments: args.allowComments,
        allowDuet: args.allowDuet,
        allowStitch: args.allowStitch,
      }),
    ),
```

The required fields are restated after the `compact(args)` spread for the same reason `create_opportunity` does it: `compact()` returns an all-optional type, which alone does not satisfy the builder's required properties.

- [ ] **Step 7: Run tests and commit**

Run: `npm test && npm run typecheck`
Expected: PASS, 32 tools.

```bash
git add src/mcp/ tests/mcp/schemas.test.ts
git commit -m "feat: add posting tools for facebook, instagram, youtube, linkedin, tiktok

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: The five lifecycle tools

**Files:**
- Modify: `src/mcp/schemas.ts`, `src/mcp/descriptions.ts`, `src/mcp/handlers.ts`, `tests/mcp/schemas.test.ts`

**Interfaces:**
- Produces: `schedule_social_post`, `list_social_posts`, `get_social_post`, `update_social_post`, `delete_social_post`. Tool count 32 → 37.

- [ ] **Step 1: Write the failing tests**

Add the five names to `expectedTools`, update the count to 37, and append:

```typescript
describe("social lifecycle schemas", () => {
  it("rejects a schedule date in the past", () => {
    expect(
      toolSchemas.schedule_social_post.safeParse({ postId: "p1", scheduleDate: daysFromNow(-1) }).success,
    ).toBe(false);
  });

  it("rejects an unparseable schedule date", () => {
    expect(
      toolSchemas.schedule_social_post.safeParse({ postId: "p1", scheduleDate: "next tuesday" }).success,
    ).toBe(false);
  });

  it("accepts a future ISO 8601 schedule date", () => {
    expect(
      toolSchemas.schedule_social_post.safeParse({ postId: "p1", scheduleDate: daysFromNow(1) }).success,
    ).toBe(true);
  });

  it("requires at least one editable field on update_social_post", () => {
    expect(toolSchemas.update_social_post.safeParse({ postId: "p1" }).success).toBe(false);
    expect(toolSchemas.update_social_post.safeParse({ postId: "p1", summary: "new" }).success).toBe(true);
  });

  it("bounds the list limit", () => {
    expect(toolSchemas.list_social_posts.safeParse({ limit: 0 }).success).toBe(false);
    expect(toolSchemas.list_social_posts.safeParse({ limit: 500 }).success).toBe(false);
    expect(toolSchemas.list_social_posts.safeParse({}).success).toBe(true);
  });
});
```

`daysFromNow` comes from `tests/helpers/stubGhl.js` — import it in this file.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/mcp/schemas.test.ts`
Expected: FAIL — the five schemas do not exist.

- [ ] **Step 3: Add the schemas**

Extend the constants import with `SOCIAL_PLATFORMS`, `SOCIAL_POST_STATUSES`, `SOCIAL_POST_LIST_LIMIT`, and add the future-date helper beside `isoDateTime` — note it builds on `isoDateTime`, which already refines on `Date.parse`:

```typescript
// Both checks are refinements, which zod drops from the derived JSON Schema, so
// schedule_social_post's description states the future rule in prose as well.
const futureIsoDateTime = isoDateTime.refine((v) => Date.parse(v) > Date.now(), {
  message: "scheduleDate must be in the future",
});
```

```typescript
  schedule_social_post: z.object({
    postId: ghlId,
    scheduleDate: futureIsoDateTime,
  }),

  list_social_posts: z.object({
    platform: z.enum(SOCIAL_PLATFORMS).optional(),
    status: z.enum(SOCIAL_POST_STATUSES).optional(),
    fromDate: isoDateTime.optional(),
    toDate: isoDateTime.optional(),
    limit: z.number().int().min(1).max(SOCIAL_POST_LIST_LIMIT).optional(),
  }),

  get_social_post: z.object({
    postId: ghlId,
  }),

  update_social_post: z
    .object({
      postId: ghlId,
      summary: socialSummary.optional(),
      media: mediaList.optional(),
    })
    .refine((v) => v.summary !== undefined || v.media !== undefined, {
      message: "provide summary, media, or both — there is nothing to update otherwise",
    }),

  delete_social_post: z.object({
    postId: ghlId,
  }),
```

- [ ] **Step 4: Add the descriptions**

```typescript
  schedule_social_post:
    "Schedule an existing social post for a future date and time, or move an already-scheduled post " +
    "to a different time. Takes a post ID from a post_to_* tool or list_social_posts. " +
    "scheduleDate must be an ISO 8601 timestamp with a timezone offset AND must be in the future. " +
    "This is the only way to schedule — the post_to_* tools deliberately do not take a date. " +
    "The normal flow is: create the post as a draft, review it, then schedule it.",

  list_social_posts:
    "List social posts in the GoHighLevel Social Planner — the content queue. " +
    "Filter by platform, status (draft, scheduled, published) and date range; all filters optional. " +
    "Use this to see what is scheduled, find a post ID before editing or deleting, or check whether " +
    "something published successfully. " +
    "Returns { items, returned, total, truncated }; if truncated is true, narrow with a date range " +
    "or platform rather than treating the list as the whole queue.",

  get_social_post:
    "Get the full detail of a single social post by ID, including its current status and whether the " +
    "platform accepted it. " +
    "Use this after any post_to_* tool to confirm a post actually went out — a successful create means " +
    "GoHighLevel queued it, and platform rejections surface afterwards. " +
    "Run list_social_posts first if you do not have the post ID.",

  update_social_post:
    "Edit the caption or media of an existing social post that has not gone out yet. " +
    "This modifies existing data — the values you provide replace what is there. " +
    "Works on draft and scheduled posts; published posts cannot be edited through the API. " +
    "To change WHEN a post goes out, use schedule_social_post — this tool does not touch the schedule. " +
    "Requires a post ID from list_social_posts.",

  delete_social_post:
    "Delete a social post from the GoHighLevel Social Planner. This cannot be undone. " +
    "If the post has already been published, deleting it here may not remove it from the social " +
    "platform itself. " +
    "Run list_social_posts first to get the post ID and confirm you have the right post.",
```

- [ ] **Step 5: Add the handlers**

```typescript
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  listSocialAccounts,
  schedulePost,
  updatePost,
} from "../ghl/social.js";
```

```typescript
  schedule_social_post: (env, { postId, scheduleDate }) => schedulePost(env, postId, scheduleDate),

  list_social_posts: async (env, args) =>
    truncateList(
      await listPosts(env, compact(args)),
      "social posts",
      "Narrow with a platform, a status, or a fromDate/toDate window.",
    ),

  get_social_post: (env, { postId }) => getPost(env, postId),

  update_social_post: (env, { postId, ...rest }) => updatePost(env, postId, compact(rest)),

  delete_social_post: (env, { postId }) => deletePost(env, postId),
```

- [ ] **Step 6: Check file sizes**

Run: `wc -l src/mcp/schemas.ts src/mcp/descriptions.ts src/mcp/handlers.ts src/ghl/social.ts`
Expected: all under 500. If `descriptions.ts` passes it, split into `descriptions/crm.ts` and `descriptions/social.ts` merged in `descriptions.ts`.

- [ ] **Step 7: Run tests and commit**

Run: `npm test && npm run typecheck`
Expected: PASS, 37 tools.

```bash
git add src/mcp/ tests/mcp/schemas.test.ts
git commit -m "feat: add social post lifecycle tools

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Dispatch coverage, docs, version bump, deploy

**Files:**
- Modify: `tests/mcp/handlers.test.ts`, `src/constants.ts`, `package.json`, `README.md`

- [ ] **Step 1: Extend the dispatch test**

Append to `tests/mcp/handlers.test.ts`, matching the file's existing import style:

```typescript
describe("social tool dispatch", () => {
  it("declares 37 tools with a handler each", () => {
    expect(Object.keys(toolSchemas)).toHaveLength(37);
  });

  it("rejects invalid posting arguments before any upstream call", async () => {
    stub = stubGhl({});
    await expect(dispatchToolCall(TEST_ENV, "post_to_youtube", { accountIds: [] })).rejects.toBeDefined();
    expect(stub.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/mcp/handlers.test.ts`
Expected: PASS.

- [ ] **Step 3: Bump the version in lockstep**

`src/constants.ts`: `export const SERVER_VERSION = "2.6.0";`
`package.json`: `"version": "2.6.0"`

The schemas test asserts these match; they drifted once before.

- [ ] **Step 4: Update the README**

Change the header line from 26 to 37 tools, and add a social section:

```markdown
### Social posting

11 of the 37 tools post to the social accounts connected in your GoHighLevel Social Planner —
Facebook, Instagram, YouTube, LinkedIn and TikTok.

- `list_social_accounts` — run first; posting tools need explicit account IDs
- `post_to_facebook`, `post_to_instagram`, `post_to_youtube`, `post_to_linkedin`, `post_to_tiktok`
- `schedule_social_post`, `list_social_posts`, `get_social_post`, `update_social_post`, `delete_social_post`

How the posting model works, and why:

- Posting tools require an explicit `status` of `draft` or `published`. There is no default, so an
  under-specified call cannot publish by accident.
- Scheduling is a separate act: create a draft, then `schedule_social_post`. The posting tools
  deliberately take no date.
- Account IDs are always explicit. Posting to an account belonging to another platform is rejected
  before the request leaves the Worker.
- Media is passed as public `https://` URLs. There is no upload path.
- A successful create means GoHighLevel queued the post, not that the platform accepted it.
  Confirm with `get_social_post`.

Your `GHL_API_TOKEN` needs these Private Integration scopes on top of the CRM ones:
`socialplanner/post.readonly`, `socialplanner/post.write`, `socialplanner/oauth.readonly`.
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run typecheck`

- [ ] **Step 6: Commit and deploy**

```bash
git add -A
git commit -m "feat: release v2.6.0 with Social Planner posting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
npm run deploy
```

- [ ] **Step 7: Verify live**

From an MCP client pointed at the deployed Worker:

1. `list_social_accounts` — all connected accounts, five `supported: true`
2. `post_to_linkedin` with `status: "draft"` and a short text summary — returns a post ID
3. `get_social_post` with that ID — `status: "draft"`
4. `schedule_social_post` with that ID and a timestamp minutes out — `status: "scheduled"`
5. Check the Social Planner calendar shows it at the right time
6. `delete_social_post` — `{ deleted: true }`, and gone from the calendar

Record anything that behaved differently in the Phase 0 findings document.
