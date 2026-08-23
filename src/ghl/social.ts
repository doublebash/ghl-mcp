import {
  createUpstreamClient,
  type UpstreamClient,
  type UpstreamRequestInit,
} from "@bashco/mcp-toolkit";
import { ToolError } from "@bashco/mcp-toolkit";
import {
  GHL_BASE_URL,
  SOCIAL_API_VERSION,
  SOCIAL_PLATFORMS,
  SOCIAL_POST_LIST_LIMIT,
  type AuthorableStatus,
  type SocialPlatform,
} from "../constants.js";
import type { GHLApiEnv } from "../env.js";
import { buildPath } from "./path.js";
import type { MediaItem, SocialAccount, SocialPost } from "./types.js";

// GHL answers 401 for two quite different causes on these endpoints: a private
// integration token missing a socialplanner scope, and a connected social
// account whose platform token has expired. The Phase 0 spike hit the first.
// A summary naming only one sends the reader off to fix the wrong thing, so
// this names both and puts the cheaper check first.
const UNAUTHORISED_SUMMARY =
  "the integration token may be missing a socialplanner scope, or the connected social account " +
  "may need reconnecting in the GoHighLevel Social Planner settings";

// One client per env, matching ghlFetch's approach — a posting tool can issue
// several calls, and there is no reason to rebuild the client for each.
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

/** Single entry point for Social Planner calls. */
export async function socialFetch<T = unknown>(
  env: GHLApiEnv,
  init: UpstreamRequestInit,
): Promise<T> {
  return socialClientFor(env).fetch<T>(init);
}

interface RawAccount {
  id?: unknown;
  _id?: unknown;
  platform?: unknown;
  name?: unknown;
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

function configurationError(detail: string): ToolError {
  return new ToolError({
    userMessage:
      "social accounts are not configured on this server — the operator needs to set the " +
      "GHL_SOCIAL_ACCOUNTS secret to a JSON array of { id, platform, name }",
    internalMessage: `GHL_SOCIAL_ACCOUNTS ${detail}`,
    status: 500,
  });
}

/**
 * The social accounts connected in GoHighLevel, read from configuration.
 *
 * Not from the API: GET /social-media-posting/{locationId}/accounts requires
 * socialplanner/account.readonly, which this location's private integration
 * cannot grant. Swapping back to the live endpoint later is a change to this
 * function alone — every caller, assertAccountsBelongTo included, is unaffected.
 */
export async function listSocialAccounts(env: GHLApiEnv): Promise<SocialAccount[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.GHL_SOCIAL_ACCOUNTS);
  } catch {
    throw configurationError("is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw configurationError("is not a JSON array");
  }

  const accounts: SocialAccount[] = [];
  for (const item of parsed) {
    const account = normaliseAccount(item as RawAccount);
    if (account !== null) accounts.push(account);
  }
  return accounts;
}

/**
 * Guards against posting to the wrong network — a LinkedIn id handed to
 * post_to_youtube would otherwise reach GHL and fail there, or worse, succeed
 * somewhere unintended.
 */
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
        `account ${id} is not configured for location ${env.GHL_LOCATION_ID}`,
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

/**
 * GHL returns posts with a Mongo `_id`. Renaming it to `id` keeps every tool
 * result on one convention, matching what search_tasks already does.
 */
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
      // Required: GHL 422s with "userId must be a string / should not be empty".
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
        "GoHighLevel accepted the request but returned no post — check the Social Planner before retrying, " +
        "so you do not end up posting twice",
      internalMessage: `unexpected create-post response: ${JSON.stringify(data).slice(0, 512)}`,
      status: 502,
    });
  }
  return post;
}

const POST_TEMPLATE = "/social-media-posting/{locationId}/posts/{postId}";

export interface ListPostFilters {
  platform?: SocialPlatform;
  /** Mapped onto GHL's `type` field — see listPosts. */
  status?: "draft" | "scheduled" | "published";
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

export interface ListPostsResult {
  posts: SocialPost[];
  /** GHL's own match count, which is not the same as posts.length. */
  total: number;
}

/**
 * The Social Planner queue.
 *
 * Three things about this endpoint were established by probing it rather than
 * from documentation, and all three are load-bearing:
 *
 * - `skip` and `limit` must be number STRINGS. Numbers return 422.
 * - There is no `status` body field; 422 says "property status should not
 *   exist". Status filtering happens through `type` instead.
 * - `type: "recent"` excludes drafts, so omitting `type` — not passing "recent"
 *   or "all" — is what actually means "everything".
 *
 * `accountIds` is rejected too, which is why the platform filter runs here.
 */
export async function listPosts(
  env: GHLApiEnv,
  filters: ListPostFilters,
): Promise<ListPostsResult> {
  const data = await socialFetch<{
    results?: { posts?: unknown[]; count?: number };
    posts?: unknown[];
  }>(env, {
    method: "POST",
    path: buildPath("/social-media-posting/{locationId}/posts/list", {
      locationId: env.GHL_LOCATION_ID,
    }),
    body: {
      skip: "0",
      limit: String(filters.limit ?? SOCIAL_POST_LIST_LIMIT),
      ...(filters.status !== undefined ? { type: filters.status } : {}),
      ...(filters.fromDate !== undefined ? { fromDate: filters.fromDate } : {}),
      ...(filters.toDate !== undefined ? { toDate: filters.toDate } : {}),
    },
  });

  const raw = data?.results?.posts ?? data?.posts ?? [];
  const posts: SocialPost[] = [];
  for (const item of raw) {
    const post = normalisePost(item);
    if (post !== null) posts.push(post);
  }

  const total = typeof data?.results?.count === "number" ? data.results.count : posts.length;

  if (filters.platform === undefined) return { posts, total };

  // Posts carry account ids, not platform names, and the endpoint will not
  // filter by account — so resolve the platform's accounts and match here.
  // Once filtered, GHL's count no longer describes this result.
  const accounts = await listSocialAccounts(env);
  const ids = new Set(accounts.filter((a) => a.platform === filters.platform).map((a) => a.id));
  const filtered = posts.filter((p) => (p.accountIds ?? []).some((id) => ids.has(id)));
  return { posts: filtered, total: filtered.length };
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

/**
 * Content edits only. Rescheduling belongs to schedulePost, so the two never
 * contend over the same fields and an edit cannot move a post's publish time
 * as a side effect.
 */
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
