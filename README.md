# GHL MCP Server (rebuilt)

A hardened Model Context Protocol server bridging Claude to GoHighLevel CRM, deployed on Cloudflare Workers.

This is the v2 rebuild of the original `gohighlevel-mcp` server. See `AUDIT.md` in `audits/gohighlevel-mcp/` for the full list of findings this rebuild closes.

## What changed vs v1

- **Per-client bearer tokens.** Each successful OAuth exchange now issues a unique, KV-backed access token. Compromise of one token affects only that client.
- **Approval code separated from the runtime bearer.** The operator-only `MCP_APPROVAL_CODE` is no longer also the API token.
- **Cloudflare rate limiting** on `/approve`, `/token`, `/register`, `/mcp`.
- **CORS pinned** to claude.ai / claude.com origins. No more `Access-Control-Allow-Origin: *`.
- **Strict redirect_uri allowlist** — no `*.claude.ai` wildcard.
- **Zod-validated tool arguments.** JSON Schema for MCP is derived from the same schemas, so they cannot drift.
- **Centralised GHL path encoding** with strict ID regex — closes the path-traversal-into-GHL-API class.
- **`ToolError` class** — only safe messages reach the MCP caller; GHL response bodies stay in structured logs.
- **`client_credentials` flow removed.** Claude uses `authorization_code` + PKCE exclusively.
- **Vitest** test suite covering auth, OAuth, JSON-RPC plumbing, schemas, path encoding, and handler dispatch.

## Stack

- Cloudflare Workers (compatibility_date 2024-11-01, `nodejs_compat`)
- TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- Hono v4
- Zod v4 (single source of truth for tool argument shapes)
- Vitest with `@cloudflare/vitest-pool-workers`

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # then fill in values; .dev.vars is gitignored
npm test                          # vitest with workers pool
npm run typecheck                 # tsc --noEmit
npm run dev                       # wrangler dev
```

## Deployment

CI does `typecheck` + `test` before `wrangler deploy` (see `.github/workflows/deploy.yml`). To deploy manually:

```bash
npm run deploy
```

See `ROLLOUT.md` for the v1 → v2 cut-over (secret rotation, re-authorisation, etc.).

## Secrets

All managed via `wrangler secret put`:

| Secret                    | Purpose                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GHL_API_TOKEN`           | GoHighLevel API token (location-scoped, least-privilege).                                                       |
| `GHL_LOCATION_ID`         | GHL location ID.                                                                                                |
| `GHL_USER_ID`             | Default assigned-to user.                                                                                       |
| `GHL_CALENDAR_ID`         | Default calendar for `add_appointment`.                                                                         |
| `MCP_APPROVAL_CODE`       | One-time code the operator pastes in `/authorize`. NEVER returned to clients and NEVER used as a bearer token. |
| `GHL_OAUTH_CLIENT_SECRET` | Optional. Reserved for future confidential-client support; unused by default.                                   |

KV namespace `GHL_OAUTH_KV` stores:

- `code:<authCode>` — one-time OAuth codes (5 min TTL).
- `bearer:<sha256(token)>` — per-client bearer records (30 day TTL).

Raw bearer tokens are never stored — only their SHA-256 hash. Compromise of the KV namespace does not leak bearer tokens.

## Tool surface

20 tools covering contacts, opportunities, pipelines, conversations, appointments, workflows, tags, tasks, notes. The full list and JSON Schema is served at `tools/list` over the MCP JSON-RPC endpoint.

Run `tools/list` from any MCP client to see the live tool catalogue.
