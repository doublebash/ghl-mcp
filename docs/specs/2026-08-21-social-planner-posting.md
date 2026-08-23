# Social Planner posting — design

**Date:** 2026-08-21
**Status:** Design approved; implementation plan pending
**Target:** `ghl-mcp` v2.5.0 → v2.6.0

---

## 1. Context

`ghl-mcp` v2.5.0 exposes 26 CRM tools over MCP from a Cloudflare Worker, built on
[`@bashco/mcp-toolkit`](https://github.com/doublebash/mcp-toolkit) v1.1.0. The toolkit owns OAuth,
per-client bearer tokens, rate limiting, structured logging, the MCP router, and the upstream HTTP
client. This repo owns only GHL specifics: schemas, descriptions, handlers, and the `src/ghl/*`
data layer.

Conventions this upgrade must follow, all of them load-bearing:

- **`src/ghl/client.ts`** wraps `createUpstreamClient` in a `WeakMap` keyed by env, so one client
  serves many calls. `UpstreamRequestInit` already accepts per-call `headers`, and the client
  already handles retries, backoff, timeouts, and `Retry-After`.
- **`src/mcp/tools.ts`** builds a `ToolMap` and hands it to `defineTools`, which derives the JSON
  Schema and the dispatcher together. Schemas cannot drift from what is advertised.
- **`src/mcp/handlers.ts`** exports `HANDLERS`, keyed exhaustively by tool name, and uses
  `compact()` to drop `undefined` fields — `exactOptionalPropertyTypes` makes that necessary.
- **`src/mcp/truncate.ts`** — every list-returning tool returns `TruncatedList<T>`:
  `{ items, returned, total, truncated, note? }`. A bare array lets a caller mistake a partial
  list for a complete one; v2.5.0 exists largely to close that.
- **`tests/helpers/stubGhl.ts`** — tests stub fetch with a route table keyed `"METHOD /path"`.
  Unmatched requests throw, so no test passes against a call it did not intend.
- **`SERVER_VERSION` and `package.json` version must match** — asserted by a test, after they
  drifted once and Claude was told the wrong version at `initialize`.

No social capability exists today: no `/social-media-posting/*` calls, no media handling, and the
API token carries CRM scopes plus the four `socialplanner/*` scopes added for this work.

## 2. Goals

Post to the five social accounts already connected in the GHL Social Planner — Facebook,
Instagram, YouTube, LinkedIn, TikTok — from Claude, without opening the GHL UI. Cover the full
lifecycle: author, schedule, review the queue, edit, delete.

## 3. Non-goals

- **Direct platform APIs.** GHL owns the platform OAuth, token refresh, and app review.
- **Media upload.** Posting tools take public `https://` URLs. `medias.write` on Private
  Integration Tokens has a documented 403 problem; the tool surface should not rest on it.
- **Category queues / best-time scheduling.** `scheduleDate` is always an explicit timestamp.
- **Cross-post fan-out.** No "post everywhere" tool. Posting to all five is five calls.
- **Analytics.** Post insights (likes, shares, comments) are out of scope for this pass.

## 4. Decisions and rationale

| Decision | Rationale |
|---|---|
| Route through GHL Social Planner | Accounts are already connected there. One API, one token, five platforms. |
| One tool per platform, no cross-post tool | Each platform gets a tight schema and honest validation. Five calls to post everywhere is the accepted cost. |
| Explicit `status`, no default | An under-specified call must never publish. Schema-enforced. |
| Scheduling is a separate tool | `schedule_social_post` promotes an existing draft. `scheduleDate` validation lives in one schema instead of five. |
| `accountIds` always explicit | No defaulting to "all accounts on this platform". Mirrors `get_pipelines` → `create_opportunity`. |
| Media by URL only | See non-goals. |
| A second upstream client for social | `createUpstreamClient` takes `statusSummaries`; a social-specific client maps 401/403 to a reconnect message and pins the API version, while inheriting retry and backoff. Cleaner than wrapping `ghlFetch` in try/catch. |

**Consequence of the separate schedule tool:** posting tools accept `status: "draft" | "published"`
only. Scheduling a new post is two calls — author as draft, then schedule. This is deliberate: it
creates a review point before anything is queued. If the extra round trip annoys in practice,
adding `"scheduled"` back to the posting tools is a contained change.

## 5. Tool surface

11 new tools, 26 → 37 total.

### 5.1 Discovery

**`list_social_accounts`** — no arguments. Returns `TruncatedList<SocialAccount>` where each
account carries `id`, `platform`, `name`, and `supported` (false for connected platforms this
server has no posting tool for, e.g. Twitter or GMB). Must run before any posting tool.

### 5.2 Posting (five tools)

All five share: `accountIds` (required, non-empty, validated against `GHL_ID_PATTERN` **and**
confirmed to belong to that platform), `summary`, `media` (public `https://` URLs with optional
`caption` / `altText`), `status` (required, `"draft" | "published"`), optional `followUpComment`.

| Tool | Platform-specific arguments | Media |
|---|---|---|
| `post_to_facebook` | — | Optional; text-only allowed |
| `post_to_instagram` | `postType: "post" \| "reel" \| "story"`, `collaborators` | **Required** |
| `post_to_youtube` | `title` (required), `privacy` (required) | **Required**, exactly one video |
| `post_to_linkedin` | `documentPost` (PDF carousel) | Optional; text-only allowed |
| `post_to_tiktok` | `privacyLevel`, `allowComments`, `allowDuet`, `allowStitch` (all required) | **Required**, exactly one video |

Each maps to `POST /social-media-posting/{locationId}/posts` with the matching
`facebookPostDetails` / `instagramPostDetails` / `youtubePostDetails` / `linkedinPostDetails` /
`tiktokPostDetails` block.

`privacy` on YouTube and the four TikTok settings are required rather than defaulted: they decide
who can see the post and cannot be changed after publish. A silent default there is the same class
of mistake as a silent publish.

Exact per-platform media counts and durations are **provisional** until confirmed against the live
API (§10). Until then validation enforces only what is certain: YouTube and TikTok take exactly
one item, Instagram requires at least one, all URLs are `https://`.

### 5.3 Lifecycle (five tools)

| Tool | Arguments | Notes |
|---|---|---|
| `schedule_social_post` | `postId`, `scheduleDate` | Promotes a draft, or reschedules. `scheduleDate` must parse **and** be in the future. |
| `list_social_posts` | `platform?`, `status?`, `fromDate?`, `toDate?`, `limit?` | Returns `TruncatedList<SocialPost>`. |
| `get_social_post` | `postId` | Full detail including platform acceptance. |
| `update_social_post` | `postId`, `summary?`, `media?` | Content only. Rescheduling belongs to `schedule_social_post`; the two do not overlap. |
| `delete_social_post` | `postId` | Irreversible; the description says so. |

### 5.4 Queued is not published

A successful posting call means GHL *queued* the post, not that the platform accepted it.
Rejections (expired platform token, media rejected, policy) surface asynchronously. Every posting
description instructs the caller to confirm with `get_social_post` when it matters.

## 6. Architecture

### New files

| File | Contents |
|---|---|
| `src/ghl/social.ts` | Social upstream client, accounts, post CRUD |
| `src/ghl/platforms.ts` | Per-platform `*PostDetails` builders — pure functions |
| `src/mcp/descriptions.ts` | All tool descriptions, moved out of `tools.ts` |
| `tests/ghl/social.test.ts` | Route-stubbed data-layer tests |
| `tests/ghl/platforms.test.ts` | Pure builder tests |

### Modified files

| File | Change |
|---|---|
| `src/mcp/schemas.ts` | 11 schemas (242 → ~430 lines) |
| `src/mcp/tools.ts` | Descriptions extracted; returns to being pure `ToolMap` assembly |
| `src/mcp/handlers.ts` | 11 `HANDLERS` entries using `compact()` |
| `src/ghl/types.ts` | `SocialAccount`, `MediaItem`, `SocialPost` |
| `src/constants.ts` | Platform enum, statuses, media limits, `SERVER_VERSION` → 2.6.0 |
| `package.json` | version → 2.6.0, in lockstep |
| `README.md` | Tool count, social section, scope table |

`src/ghl/client.ts` is **unchanged** — no per-call version plumbing is needed, because
`UpstreamRequestInit` already carries `headers` and the social module gets its own client.

No change to auth, CORS, rate limiting, or MCP routing: all of that lives in the toolkit.

## 7. Validation

- **Account IDs** — `GHL_ID_PATTERN` via the toolkit's `buildPath`, plus a platform-match check
  against `list_social_accounts` so a LinkedIn ID cannot reach `post_to_youtube`.
- **Media URLs** — `https://` enforced by regex, not `.refine`. Zod renders a regex into the
  derived JSON Schema as `pattern`; refinements are dropped silently, so a `.refine` constraint is
  invisible to the model. Verified against the installed zod 4.4.3.
- **`scheduleDate`** — extends the existing `isoDateTime` (which already refines on `Date.parse`)
  with a future check. That refinement *is* invisible in JSON Schema, so the description states
  the rule in prose as well.
- **`status`** — required enum. No default anywhere in the posting path.

## 8. Error handling

The social upstream client supplies `statusSummaries` overriding 401 and 403 with a message naming
reconnection in the Social Planner, since an expired platform token is the likeliest real failure
and "unauthorized" tells the caller nothing actionable. Everything else inherits the toolkit's
behaviour: safe summary out, upstream body confined to structured logs.

## 9. Auth and scopes

`GHL_API_TOKEN` is a Private Integration Token. Four Social Planner scopes have been added:

| Scope | Covers |
|---|---|
| `socialplanner/post.readonly` | `list_social_posts`, `get_social_post` |
| `socialplanner/post.write` | the five posting tools, schedule, update, delete |
| `socialplanner/oauth.readonly` | connected-integration reads — **presumed** to cover `list_social_accounts` |
| `socialplanner/oauth.write` | not required by this design; granted but unused |

**Scope gap to verify.** GHL also publishes `socialplanner/account.readonly` / `.write`, and the
accounts endpoint may be guarded by those. They were **not offered** in this account's
private-integration scope picker. If the accounts endpoint demands them, `list_social_accounts`
returns 403 and no token change fixes it. Fallback: configure the account IDs as a
`GHL_SOCIAL_ACCOUNTS` secret read from the Social Planner UI; `list_social_accounts` then serves
from config and the posting tools are unaffected, since they need only the IDs. That costs one
manual step and delays nothing.

**Token-type risk.** Sub-account Private Integration Tokens are reported to return `Invalid JWT`
against Social Planner endpoints specifically while working fine for CRM. This is tested first.

## 10. Phase 0 — verify before building

A throwaway spike answering five unknowns, before any implementation:

1. Does the PIT authenticate against `/social-media-posting/*` at all?
2. Does the accounts endpoint succeed under `socialplanner/oauth.readonly`?
3. Is an external `https://` media URL accepted, or must media be GHL-hosted?
4. How is "publish now" expressed — `status: "published"`, or a `scheduleDate` of now?
5. What `Version` header do these endpoints want, and what are the real media limits?

Unknowns 1 and 3 can change the design. Unknown 2 selects between the API and config paths for
accounts. The spike records real response bodies as test fixtures so the implementation asserts
observed shapes rather than assumed ones.

## 11. Testing

Follows `tests/` conventions: `stubGhl()` route tables, `TEST_ENV`, `errorResponse`, `daysFromNow`.

- `tests/mcp/schemas.test.ts` — extended: 37 tools; `status` required; `"scheduled"` rejected on
  posting tools; past and unparseable `scheduleDate` rejected; non-`https` media rejected;
  YouTube title bounded.
- `tests/ghl/social.test.ts` — one create case per platform asserting the right `*PostDetails`
  block; account/platform mismatch rejected before any post is attempted; 401 mapped to the
  reconnect message; list results wrapped by `truncateList`.
- `tests/ghl/platforms.test.ts` — the five builders, pure, no network.
- `tests/mcp/handlers.test.ts` — extended: all 37 dispatch; unknown tool rejected.

## 12. Risks

| Risk | Mitigation |
|---|---|
| PIT returns `Invalid JWT` on Social Planner endpoints | Tested first in Phase 0; fallback is a marketplace OAuth app, which is a spec change |
| Accounts endpoint needs a scope this account cannot grant | §9 config fallback; design survives intact |
| External media URLs rejected | Phase 0, before implementation |
| Platform token expiry reads as a server bug | Dedicated 401/403 summary naming reconnection |
| Async platform rejection read as success | Stated in descriptions; `get_social_post` is the confirmation path |
| 37 tools crowds tool selection | Descriptions state prerequisites explicitly, as the CRM tools already do |

## 13. Open questions

One item to verify rather than assume: Instagram API posting requires a Business or Creator
account. The account is confirmed connected in Social Planner, which strongly implies the right
type since GHL will not connect a personal account, but Phase 0 confirms it with a real draft.
