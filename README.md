# GHL MCP Server

A hardened **Model Context Protocol** server bridging Claude to **GoHighLevel CRM**, deployed on **Cloudflare Workers**.

Fork this repo, deploy to your own Cloudflare account, point Claude.ai at your worker, and Claude can read and write your GoHighLevel data through 38 typed tools — CRM (contacts, opportunities, conversations, appointments, workflows, tags, tasks, notes) plus social posting to Facebook, Instagram, YouTube, LinkedIn and TikTok, and social statistics, via the Social Planner.

Built on [`@bashco/mcp-toolkit`](https://github.com/doublebash/mcp-toolkit) — OAuth, per-client bearer tokens, rate limiting, structured logging, and typed tool dispatch are all handled by the shared library.

## What you get

- **38 GHL tools** — 26 CRM (contacts, opportunities, pipelines, conversations, appointments, workflows, tags, tasks, notes), 11 social posting and 1 social statistics. Full live catalogue at the `tools/list` MCP endpoint after deploy.
- **OAuth 2.0 + PKCE** authentication for Claude.ai
- **Per-client bearer tokens** — each Claude connection gets a unique token; compromise of one affects only that client
- **Cloudflare rate limiting** on `/approve`, `/token`, `/register`, `/mcp`
- **CORS pinned** to claude.ai / claude.com origins
- **Zod-validated tool arguments** — JSON Schema for MCP derived from same schemas, cannot drift
- **`ToolError` class** — only safe messages reach the MCP caller; GHL response bodies stay in structured logs
- **Vitest** test suite covering auth, OAuth, JSON-RPC plumbing, schemas, path encoding, handler dispatch

## Setup — deploy your own copy

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free plan works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed and logged in (`wrangler login`)
- Node.js 22+
- A GoHighLevel account with a location-scoped API token

### 1. Fork and clone

```bash
git clone https://github.com/<your-username>/ghl-mcp
cd ghl-mcp
npm install
```

### 2. Create a KV namespace

This stores per-client OAuth state (auth codes + hashed bearer tokens). Run:

```bash
wrangler kv:namespace create GHL_OAUTH_KV
```

Wrangler prints something like:

```
🌀 Creating namespace with title "ghl-mcp-GHL_OAUTH_KV"
✨ Success! Add the following to your configuration file:
[[kv_namespaces]]
binding = "GHL_OAUTH_KV"
id = "abc123def456..."
```

Edit `wrangler.toml` and replace the `id = "..."` value under `[[kv_namespaces]]` with the id wrangler just printed. The repo ships with the upstream maintainer's id committed — useless to anyone else (Cloudflare scopes KV access to your account credentials), but you still need your own to deploy under your own account.

### 3. Set secrets

Generate a fresh approval code (this is what *you* paste at `/authorize` to mint a Claude bearer — never returned to clients):

```bash
openssl rand -base64 32
```

Store it in a password manager, then push the secrets to Cloudflare:

```bash
wrangler secret put MCP_APPROVAL_CODE      # paste the value from above
wrangler secret put GHL_API_TOKEN          # your GoHighLevel API token
wrangler secret put GHL_LOCATION_ID        # your GHL location ID
wrangler secret put GHL_USER_ID            # default assigned-to user ID
wrangler secret put GHL_CALENDAR_ID        # default calendar for appointment tools
```

| Secret                | Purpose |
|---|---|
| `MCP_APPROVAL_CODE`   | One-time code you paste at `/authorize` to mint a Claude bearer. Never returned to clients, never used as a bearer token. |
| `GHL_API_TOKEN`       | GoHighLevel API token (location-scoped, least-privilege). |
| `GHL_LOCATION_ID`     | GoHighLevel location ID. |
| `GHL_USER_ID`         | Default "assigned to" user. |
| `GHL_SOCIAL_ACCOUNTS` | JSON array of the social accounts connected in your Social Planner, e.g. `[{"id":"abc","platform":"facebook","name":"My Page","profileId":"0123456789abcdef01234567"}]`. Only needed for the social tools — see below. |
| `GHL_CALENDAR_ID`     | Default calendar for `add_appointment`. |

### 4. Deploy

```bash
npm run deploy
```

Wrangler prints your worker URL — something like `https://ghl-mcp.<your-account>.workers.dev`. Save it.

### 5. Connect Claude.ai

1. In Claude.ai, go to **Settings → Integrations → Add MCP server**
2. Server URL: `https://ghl-mcp.<your-account>.workers.dev/mcp`
3. Claude.ai redirects you to your worker's `/authorize` page
4. Paste your `MCP_APPROVAL_CODE` and confirm
5. You're connected — Claude now has the 38 GHL tools available

The approval-code step happens **once per Claude.ai client**. Subsequent requests use the per-client bearer issued during this flow.

## Social posting

Eleven of the 38 tools post to the accounts connected in your GoHighLevel **Social Planner**.

- `list_social_accounts` — run first; the posting tools need explicit account IDs
- `post_to_facebook`, `post_to_instagram`, `post_to_youtube`, `post_to_linkedin`, `post_to_tiktok`
- `schedule_social_post`, `list_social_posts`, `get_social_post`, `update_social_post`, `delete_social_post`

### How the posting model works, and why

- **`status` is required, with no default.** Every posting tool takes `draft` or `published`
  explicitly, so an under-specified call cannot publish something by accident.
- **Scheduling is a separate act.** Create a draft, then call `schedule_social_post`. The posting
  tools take no date at all, which keeps the future-date rule in one place and gives you a review
  point before anything is queued.
- **Account IDs are always explicit.** Posting to an account belonging to another platform is
  rejected inside the Worker, before any request goes out.
- **Media is passed as public `https://` URLs.** There is no upload path — GHL accepts externally
  hosted media directly.
- **Queued is not published.** A successful create means GoHighLevel accepted the post, not that
  the platform did. Confirm with `get_social_post`.

### Extra setup for social

**1. Scopes.** Your `GHL_API_TOKEN` needs these Private Integration scopes on top of the CRM ones:

```
socialplanner/post.readonly
socialplanner/post.write
socialplanner/oauth.readonly
```

**2. `GHL_SOCIAL_ACCOUNTS`.** GoHighLevel guards its connected-accounts endpoint with
`socialplanner/account.readonly`, a scope private integrations are not offered — the endpoint
returns `401 "The token is not authorized for this scope."` regardless of API version. The posting
tools only ever needed the account IDs, so they come from a secret instead:

```bash
wrangler secret put GHL_SOCIAL_ACCOUNTS
```

Paste a JSON array:

```json
[
  {"id":"<accountId>","platform":"facebook","name":"My Page"},
  {"id":"<accountId>","platform":"instagram","name":"@myhandle"},
  {"id":"<accountId>","platform":"youtube","name":"My Channel"},
  {"id":"<accountId>","platform":"linkedin","name":"My Company"},
  {"id":"<accountId>","platform":"tiktok","name":"@myhandle"}
]
```

To find the IDs: open the Social Planner in your browser with devtools on the **Network** tab,
reload, and read the response of the request ending in `/accounts`. The UI calls that endpoint
with a session token, which is not scope-limited the way a private integration token is.

Get the `platform` values right — they drive the guard that stops a LinkedIn account ID being
used for a YouTube post.

## Social statistics

`get_social_stats` reports account-level performance from the Social Planner's statistics:
posts, impressions, reach, likes, comments, shares and followers gained, as totals and per
platform, for any period (years back included), optionally compared with the period before and
broken into a time series. It counts posts made directly on the platforms too, not only ones
scheduled through GoHighLevel. There is no per-post breakdown: GoHighLevel's statistics API
returns totals only.

**Setup.**

1. Add the `socialplanner/statistics.readonly` scope to your private integration.
2. Add each account's `profileId` to its `GHL_SOCIAL_ACCOUNTS` entry. This is a 24-character id
   that is **not** part of the account `id`; it appears only in the Social Planner's accounts
   response (the same `/accounts` request described above). In that response it is the
   `profileId` field of each account. Accounts without one are left out of statistics and
   listed under `accountsWithoutStats`.

TikTok only reports statistics for Business accounts.

## Local development

```bash
cp .dev.vars.example .dev.vars   # fill in values; .dev.vars is gitignored
npm test                          # vitest with workers pool
npm run typecheck                 # tsc --noEmit
npm run dev                       # wrangler dev
```

## Stack

- Cloudflare Workers (compatibility_date `2024-11-01`, `nodejs_compat`)
- TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- [Hono](https://hono.dev) v4
- [Zod](https://zod.dev) v4 (single source of truth for tool argument shapes)
- Vitest with `@cloudflare/vitest-pool-workers`
- [`@bashco/mcp-toolkit`](https://github.com/doublebash/mcp-toolkit) — shared OAuth/crypto/rate-limit/dispatch plumbing

## How OAuth state is stored

KV namespace `GHL_OAUTH_KV` holds:

- `code:<authCode>` — one-time OAuth codes (5 min TTL)
- `bearer:<sha256(token)>` — per-client bearer records (30 day TTL)

Raw bearer tokens are never stored — only their SHA-256 hash. Compromise of the KV namespace does not leak bearer tokens.

## Continuous deployment

`.github/workflows/deploy.yml` runs `typecheck` + `test` on every push to `main`, then deploys to Cloudflare. To enable on your fork, set two repository secrets:

- `CLOUDFLARE_API_TOKEN` — create at [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) (use the "Edit Cloudflare Workers" template)
- `CLOUDFLARE_ACCOUNT_ID` — find at the bottom-right of your Cloudflare dashboard

## Contributing

Issues and PRs welcome at [github.com/doublebash/ghl-mcp](https://github.com/doublebash/ghl-mcp).

For changes to the underlying OAuth/crypto/rate-limit code, the toolkit lives at [github.com/doublebash/mcp-toolkit](https://github.com/doublebash/mcp-toolkit) — file issues there.

## Security

Found a vulnerability? Please **don't** open a public issue. Open a [private security advisory](https://github.com/doublebash/ghl-mcp/security/advisories/new) on GitHub.

## License

[MIT](./LICENSE) — Copyright (c) 2026 Bashar Basheer.
