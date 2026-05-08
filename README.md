# GHL MCP Server

Custom MCP (Model Context Protocol) server connecting Claude to GoHighLevel CRM, hosted on Cloudflare Workers.

**Worker URL:** https://ghl-mcp.bashar-basheer.workers.dev

## What this does

Gives Claude direct access to GoHighLevel for contact management, opportunities, pipelines, appointments, conversations, and workflow triggers — controlled through natural language in Claude.

## Stack

- Cloudflare Workers
- TypeScript
- Wrangler

## Local development

```bash
npm install
wrangler dev
```

## Deployment

```bash
wrangler deploy
```

## Secrets

Secrets are managed via `wrangler secret put` and are not stored in this repo. Required secrets:

- `GHL_API_TOKEN`
- `GHL_LOCATION_ID`
- `GHL_USER_ID`
- `GHL_CALENDAR_ID`
- `MCP_AUTH_TOKEN`

See `wrangler.toml` for full config.
