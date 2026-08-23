# Phase 0 findings — Social Planner API

**Date:** 2026-08-21
**Run:** `scripts/spike-social.sh` (read-only probes), location `fLBMWEE3c8MDKYcRUrkT`

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
