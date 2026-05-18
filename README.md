# GHL MCP Server

A hardened **Model Context Protocol** server bridging Claude to **GoHighLevel CRM**, deployed on **Cloudflare Workers**.

Fork this repo, deploy to your own Cloudflare account, point Claude.ai at your worker, and Claude can read and write your GoHighLevel data through 20 typed tools (contacts, opportunities, conversations, appointments, workflows, tags, tasks, notes).

Built on [`@bashco/mcp-toolkit`](https://github.com/doublebash/mcp-toolkit) — OAuth, per-client bearer tokens, rate limiting, structured logging, and typed tool dispatch are all handled by the shared library.

## What you get

- **20 GHL tools** — contacts, opportunities, pipelines, conversations, appointments, workflows, tags, tasks, notes. Full live catalogue at the `tools/list` MCP endpoint after deploy.
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
5. You're connected — Claude now has the 20 GHL tools available

The approval-code step happens **once per Claude.ai client**. Subsequent requests use the per-client bearer issued during this flow.

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
