# Phase 0 findings — Social Planner API

**Date:** 2026-08-21
**Run:** `scripts/spike-social.sh` (read-only probes), location `loc123`

## Unknown 1 — does the PIT authenticate against `/social-media-posting/*`?

**Yes.** No `Invalid JWT`. The reported token-type risk did not materialise: the private
integration token is accepted, and failures are per-scope rather than wholesale.

Evidence: `POST /posts/list` reached request validation and returned 422 with field-level errors.
A request that got as far as validating the body was authenticated and authorised for that scope.

**Consequence:** the PIT route stands. No marketplace OAuth app needed.

## Unknown 2 — does the accounts endpoint work under `socialplanner/oauth.readonly`?

**No.** `GET /social-media-posting/{locationId}/accounts` returns:

```
HTTP 401 {"statusCode":401,"message":"The token is not authorized for this scope."}
```

Identical under both `Version: 2021-07-28` and `2021-04-15`, so it is not a version problem.
`socialplanner/oauth.readonly` covers the OAuth *integration* endpoints, not the accounts listing —
that needs `socialplanner/account.readonly`, which this account's private-integration scope picker
does not offer.

Note GHL returns **401**, not 403, for a scope failure. Error mapping must treat 401 as
"scope or account problem", not purely "expired platform token".

**Consequence: Gate B fired — implement Task 3b, not Task 3.** `list_social_accounts` reads
account IDs from a `GHL_SOCIAL_ACCOUNTS` secret. The posting tools are unaffected: they need the
IDs, not the listing endpoint. Nothing else in the design changes.

Worth a later check: whether a private integration created at **agency** level rather than
sub-account level offers `socialplanner/account.readonly`. Not a blocker — the config path works
regardless — but it would let `list_social_accounts` go live.

## Unknown 5 — version header and the `posts/list` contract

**Version header:** `2021-07-28` is correct. The 401 was identical across versions, and the 422
came back under `2021-07-28`, so that version reaches the endpoint's own validation.

**CONFIRMED WORKING** on the second run: `{"type":"recent","skip":"0","limit":"20"}` returns
**HTTP 201** (not 200) with:

```json
{"success":true,"statusCode":201,"message":"Fetched Posts","results":{"posts":[],"count":0}}
```

So: posts live at `results.posts`, and `results.count` carries the total independent of how many
were returned. `count` is what `list_social_posts` should report as `total` — deriving total from
`items.length` would claim a 50-item page was the whole queue, which is the exact failure v2.5.0's
`truncateList` exists to prevent.

**`POST /social-media-posting/{locationId}/posts/list` contract**, from the earlier 422 body:

```
"property accountIds should not exist"
"skip must be a number string"
"limit must be a number string"
```

Three concrete corrections to the planned implementation:

1. `accountIds` is **not** a valid body field on the list endpoint. Filtering by account happens
   client-side, which the plan already does for the platform filter.
2. `skip` must be a **string** — `"0"`, not `0`.
3. `limit` must be a **string** — `"50"`, not `50`.

`type: "recent"` drew no complaint, so it is accepted.

## Unknowns 3 and 4 — external media URLs, and "publish now"

**Not yet answered.** Both need `--create-draft`, which needs a real account ID — and the accounts
endpoint is exactly what 401s.

**The queue is empty** (`posts: [], count: 0`), so there are no existing posts to harvest account
IDs from. Two ways to get them:

1. **Create one draft in the GHL Social Planner UI** targeting all five accounts, then re-run the
   list — the returned post carries every `accountId` at once. Easiest, and it needs no devtools.
2. **Read them from the Network tab** with the Social Planner open: the UI calls the same accounts
   endpoint internally using a session token, which is not scope-limited the way the PIT is.

Path that was tried and did not work — kept so it is not retried:

```bash
curl -sS -X POST "https://services.leadconnectorhq.com/social-media-posting/$GHL_LOCATION_ID/posts/list" \
  -H "Authorization: Bearer $GHL_API_TOKEN" \
  -H "Version: 2021-07-28" \
  -H "Content-Type: application/json" \
  -d '{"type":"recent","skip":"0","limit":"20"}'
```

If the location has no social posts yet, the account IDs must come from the GHL UI instead —
open the Social Planner with browser devtools on the Network tab and read the IDs from the
internal accounts call.

## Status

| Unknown | Answer | Effect on the plan |
|---|---|---|
| 1 — PIT authenticates | Yes | Route confirmed; no spec change |
| 2 — accounts endpoint | **401, scope unavailable** | **Task 3b replaces Task 3** |
| 3 — external media URLs | Unanswered | Blocks Task 8 schemas being final |
| 4 — publish-now semantics | Unanswered | Blocks Task 4 status mapping being final |
| 5 — version + list contract | `2021-07-28`; `skip`/`limit` are strings; no `accountIds`; returns **201**, posts at `results.posts`, total at `results.count` | Task 5 `listPosts` corrected to return `{ posts, total }` |

## Run 2 (2026-08-21, after correcting the list parameters)

- `posts/list` → **201**, `results.posts: []`, `results.count: 0`. Contract confirmed.
- Accounts endpoint → 401, unchanged. Not a version or parameter problem.
- Social Planner queue is empty, so account IDs must come from the UI (see Unknowns 3 and 4).


---

# Run 4 (2026-08-21) — the sweep that mattered

Probing `type` with an invalid value did not produce an enum error: GHL returned **201 with every
post**. `type` is therefore not validated as an enum — unrecognised values fall through to "no
filter". That accident is what exposed the real data.

## `type` semantics — confirmed by observation

| `type` | Result |
|---|---|
| omitted | all 4 posts |
| `"__invalid__"` | all 4 posts (not validated) |
| `"all"` | all 4 posts |
| `"draft"` | all 4 posts (all are drafts) |
| `"recent"` | **0 posts** |
| `"scheduled"` | 0 posts |
| `"published"` | 0 posts |

`type: "recent"` does not mean "recently created" — it excludes drafts. The first three runs
returned empty not because the queue was empty, but because the query was wrong.

**Consequence:** `list_social_posts` maps its `status` filter onto `type`, and omits `type`
entirely when no status is given. It must **not** send a `status` body field — see below.

## Unknown properties are rejected

The earlier 422 said `"property accountIds should not exist"`. The list endpoint accepts `type`,
`skip`, `limit` and rejects anything it does not know. The plan's `status`, `fromDate` and
`toDate` body fields are therefore **unverified and likely to 422**. They must be probed before
use; until then `list_social_posts` filters by date client-side or not at all.

## FINDING 1 — account ids exceed the GHL id pattern

Account ids are composite, and long:

| Length | Account id |
|---|---|
| 66 | `aaaa0000aaaa0000aaaa0001_loc123_100000000000001_page` |
| 63 | `aaaa0000aaaa0000aaaa0002_loc123_17841000000000002` |
| 89 | `aaaa0000aaaa0000aaaa0003_loc123_0005aaaaaa0000aAaaAa0aAa0aAAAA0AAa0_profile` |
| 78 | `aaaa0000aaaa0000aaaa0004_loc123_UCaaaaaaaaaaaaaaaaaaaaaa_profile` |
| 64 | `aaaa0000aaaa0000aaaa0005_loc123_LiPerson1_profile` |

The shape is `{objectId}_{locationId}_{platformNativeId}_{suffix}`.

`GHL_ID_PATTERN` is `/^[a-zA-Z0-9_-]{1,64}$/`. **Three of the five exceed 64 characters.** Had the
schemas used the existing `ghlId` for `accountIds`, as planned, every posting call to YouTube,
TikTok, and Facebook would have failed validation before leaving the Worker — and the error would
have looked like a caller mistake rather than a schema bug.

**Consequence:** a distinct `socialAccountId` type, same safe charset, 128-character ceiling. Post
ids stay on `ghlId` — they are 24-character Mongo ObjectIds and do travel in URL paths, where the
tighter bound is the point.

## FINDING 2 — the real `*PostDetails` field names

Read off live post objects, correcting several guesses in the plan:

| Block | Actual fields | Plan had |
|---|---|---|
| `tiktokPostDetails` | `privacyLevel`, `enableComment`, `enableDuet`, `enableStitch`, `promoteOtherBrand`, `promoteYourBrand`, `videoDisclosure` | `allowComment`, `allowDuet`, `allowStitch` — **wrong** |
| `linkedinPostDetails` | `postAsPdf`, `pdfTitle` | `documentPost` — **wrong** |
| `instagramPostDetails` | `type`, `collaborators` (an **object**, not an array), `publishViaPushNotification`, `publisherNote`, `showOnFeed` | `collaborators: []` — **wrong shape** |
| `youtubePostDetails` | `privacyLevel`, `title`, `type: "video"` | correct |
| `facebookPostDetails` | `type: "post"` | empty object — incomplete |

Post-level fields confirmed present: `status`, `type`, `summary`, `scheduleDate`, `publishedAt`,
`followUpComment`, `accountIds`, `media[{url,type,thumbnail}]`, `tags`.

## FINDING 3 — post `platform` is not a reliable account→platform map

All four drafts report `platform: "google"` while carrying account ids that are plainly YouTube
(`UC…`), Instagram (`17841…`), TikTok (`0005…`), Facebook (`…_page`) and one more. The post-level
`platform` field cannot be used to derive which platform an account belongs to.

Mapping inferred from the platform-native id embedded in each account id, **pending confirmation
by the operator**:

| Account id fragment | Inferred platform | Reasoning |
|---|---|---|
| `…_100000000000001_page` | Facebook | numeric Page id with a `_page` suffix |
| `…_17841000000000002` | Instagram | `17841…` is the Instagram Business account id prefix |
| `…_0005lhkjde…IbEZ6JSu3Nd_profile` | TikTok | TikTok `open_id` format |
| `…_UCaaaaaaaaaaaaaaaaaaaaaa_profile` | YouTube | `UC` prefix is a YouTube channel id |
| `…_LiPerson1_profile` | LinkedIn | short alphanumeric member id; the only platform left |

This mapping feeds `GHL_SOCIAL_ACCOUNTS` and drives `assertAccountsBelongTo`. A wrong entry would
either block a legitimate post or let one through aimed at the wrong network, so it is confirmed
with the operator rather than assumed.

## Still open

Unknowns 3 (external media URLs) and 4 (publish-now semantics) remain. An account id is now
available, so `--create-draft` can finally run.


---

# Run 5 (2026-08-21) — filter fields and the create contract

## `posts/list` filter fields — settled

| Field | Result |
|---|---|
| `status` | **422 — "property status should not exist"** |
| `fromDate` + `toDate` | **201, accepted** (ISO 8601 with `Z`) |
| `type`, `skip`, `limit` | accepted (`skip`/`limit` as number strings) |

So `list_social_posts` maps its `status` argument onto `type` — `draft` → `type: "draft"`,
`scheduled` → `"scheduled"`, `published` → `"published"`, and omits `type` when no status is
given, which returns everything. It must never send a `status` body field.

`fromDate`/`toDate` pass validation. Whether they actually filter is not yet proven — the only
posts in this location fall inside the window that was tested, so a non-filtering implementation
would look identical. Not worth another probe: the client-side platform filter already runs, and
a date window that silently fails open would only ever return *more* than asked, which
`truncateList` reports honestly.

## Create requires `userId`

```
HTTP 422 ["userId must be a string", "userId should not be empty"]
```

`POST /posts` rejects a body without `userId`. The planned `createPost` already sends
`userId: env.GHL_USER_ID`, so the implementation was right and only the spike script was wrong.
Confirms `GHL_USER_ID` is load-bearing for social posting, not merely a CRM default.

Note this 422 is also further proof the token is authorised for `socialplanner/post.write` —
the request reached body validation.

## Still open

Unknowns 3 (external media URL) and 4 (publish-now semantics) — one run away, now that the script
sends `userId`.


---

# Run 6 (2026-08-21) — draft created, unknown 3 closed

## UNKNOWN 3 — ANSWERED: external media URLs are accepted

`POST /posts` with `media: [{ "url": "https://picsum.photos/1080" }]` returned **201** and the
created post echoes that URL back unchanged. GHL does **not** require media to be hosted in its own
library.

**Consequence:** the spec's media non-goal stands on evidence rather than assumption. No
`medias.write` scope, no upload path, no change to the five posting schemas. Callers pass public
`https://` URLs.

## Create contract — confirmed working

Request that succeeded:

```json
{"accountIds":["…_100000000000001_page"],"userId":"user456",
 "type":"post","status":"draft","summary":"…","media":[{"url":"https://picsum.photos/1080"}]}
```

- `status: "draft"` is accepted on create and the post comes back `status: "draft"` — it stages in
  the Social Planner and does not publish.
- The created post id is `6a8a000000000000000aaa3b` — a 24-character Mongo ObjectId, which fits
  `GHL_ID_PATTERN`. Post ids stay on `ghlId`; only account ids need the wider type.
- Response nests the post at `results.post`, matching what `createPost` already parses.

## UNKNOWN 4 — publish semantics, deliberately still open

`status: "published"` is untested and will stay that way for now: the only way to test it is to
publish something real to a live Facebook page. Not worth burning a genuine post on.

A safer proxy exists — schedule a post a few minutes out, confirm GHL accepts
`status: "scheduled"` plus `scheduleDate`, then delete it before it fires. That exercises the
scheduling path, which is the one `schedule_social_post` actually uses, without publishing
anything. `status: "published"` follows GHL's documented behaviour and gets its first real
exercise when the operator chooses to make a real post.

## FINDING 3 revisited — `platform` is junk, and my inference is weaker than it looked

The draft was created against the account id I had inferred as **Facebook**
(`…_100000000000001_page`). GHL labelled the resulting post `platform: "google"`.

Two readings:

1. The `platform` field is a default that does not reflect the target account — supported by
   every other post carrying `"google"` too, including ones targeting a `17841…` Instagram id and
   a `UC…` YouTube id. Instagram is Meta, not Google, so the field cannot be per-account truth.
2. That account genuinely is a Google Business Profile. Numeric ids with a `_page` suffix are
   plausible for GMB as well as for Facebook Pages.

Reading 1 is more likely, but reading 2 is not excluded, and the two differ on which platform that
account belongs to. **The mapping must be confirmed from the accounts endpoint via the Social
Planner UI's own network call** — the operator opening devtools once and reading id → platform
directly. Guessing here risks `assertAccountsBelongTo` either blocking valid posts or approving
one aimed at the wrong network.

Until confirmed, `GHL_SOCIAL_ACCOUNTS` stays unset and `list_social_accounts` reports a
configuration error rather than a wrong answer.


---

# Run 7 (2026-08-21) — account → platform mapping RESOLVED

`GET /social-media-posting/oauth/{locationId}/{platform}/accounts/{connectionId}` is covered by
`socialplanner/oauth.readonly`, which this token has. Probing each connection id against each
platform returns that platform's own view of the connection — and where it succeeds, the native id
it reports matches the id embedded in the account id exactly.

Note the endpoints answer **200 even on failure**, with `success: false` and an error code in the
body. Status codes are not the discriminator here; the body is.

| Platform | Evidence | Confidence |
|---|---|---|
| Facebook | FB endpoint returned the same Page id embedded in the account id, with the page name | **Confirmed** |
| Instagram | IG endpoint returned the same Instagram Business account id, with the handle | **Confirmed** |
| LinkedIn | LinkedIn endpoint returned `urn:li:person:<id>` matching the embedded id, with the profile name | **Confirmed** |
| YouTube | GHL's YouTube endpoint returns `YOUTUBE_API_ERROR` for every connection, so nothing contradicts it; the embedded id is `UC` + 22 characters, which is definitively a YouTube channel id | Strong |
| TikTok | GHL's TikTok endpoint returns an empty profile list for every connection; the embedded id is TikTok `open_id` format, and it is the only account unaccounted for | Strong |

Three are confirmed by exact cross-reference against each platform's own API. The remaining two
rest on unambiguous id formats plus elimination, with no contradicting evidence — GHL's endpoints
for those two are broken for every connection, not just these.

FINDING 3's earlier doubt is resolved: post-level `platform` really is junk. One post targeting an
Instagram Business account reported `platform: "google"`, and Instagram is Meta — the field cannot
be per-account truth.

## Note on identifiers

Real location, user, and account identifiers appear only in `tests/fixtures/social/`, which is
gitignored. Tracked files — tests, docs, scripts — use synthetic values of the same shape. The
account-mapping script reads ids from those fixtures or from `SOCIAL_ACCOUNT_IDS` rather than
carrying any.
