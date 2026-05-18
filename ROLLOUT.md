# Rollout — v1 → v2

This is a one-time breaking change. Existing Claude.ai clients connected to the v1 server will fail authentication after deploy and must re-authorise once.

Expected downtime: **2–5 minutes** of MCP unavailability while you deploy + re-authorise on each client.

## Pre-flight (do this before touching prod)

1. Confirm you have an out-of-band way to copy `MCP_APPROVAL_CODE` to a password manager (don't paste it back into the chat).
2. Run the test suite locally:
   ```bash
   npm install
   npm run typecheck
   npm test
   ```
3. Make sure you can still reach the live worker:
   ```bash
   curl -i https://ghl-mcp.bashar-basheer.workers.dev/.well-known/oauth-authorization-server
   ```

## Cut-over

### 1. Create the rate-limit namespaces (one-time, in the Cloudflare dashboard or via API)

The four `[[unsafe.bindings]]` entries in `wrangler.toml` reference `namespace_id`s 1001–1004. If you've never used them before, Cloudflare will auto-create on first deploy. Otherwise pick any four unused integer IDs for this worker.

### 2. Rotate / set secrets

```bash
# New approval code (paste from a password manager, not from this shell history)
wrangler secret put MCP_APPROVAL_CODE

# Keep GHL secrets as-is unless rotating them too
wrangler secret put GHL_API_TOKEN        # only if rotating
wrangler secret put GHL_LOCATION_ID      # only if rotating
wrangler secret put GHL_USER_ID
wrangler secret put GHL_CALENDAR_ID
```

You can delete the now-unused `MCP_AUTH_TOKEN` secret if you want, but it's harmless to leave (the rebuilt server doesn't read it):

```bash
wrangler secret delete MCP_AUTH_TOKEN
```

### 3. Deploy

```bash
npm run deploy
```

CI does this automatically on push to `main` (typecheck + test must pass first).

### 4. Re-authorise Claude.ai

1. In Claude.ai → Settings → Connectors, disconnect the existing **ghl-mcp** integration.
2. Reconnect using the same worker URL. Claude will redirect through `/authorize` → you paste the new `MCP_APPROVAL_CODE` once → done.
3. Verify with a simple tool call (e.g. `list workflows`).

### 5. Verify

```bash
# Manifest still publishes
curl -s https://ghl-mcp.bashar-basheer.workers.dev/.well-known/oauth-authorization-server | jq

# /mcp without auth returns 401 (good)
curl -i -X POST https://ghl-mcp.bashar-basheer.workers.dev/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
| head -20

# Rate limiter is live (run this 10x in a row, the 6th+ should return 429)
for i in $(seq 1 8); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST \
    https://ghl-mcp.bashar-basheer.workers.dev/approve \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data 'code=wrong&params=%7B%7D'
done
```

## Rollback

If something goes wrong:

1. `git revert` the merge commit on `main`.
2. CI redeploys the v1 worker.
3. Re-authorise Claude.ai with the old `MCP_AUTH_TOKEN`.

KV records written by v2 (`bearer:*`) will simply expire over 30 days; they don't break v1.

## Post-rollout cleanup

After 24–48 hours of stable operation:

- Delete the v1 source from `~/Documents/AI Agents & Workflows/GoHighLevel-mcp/` and replace with this rebuild.
- Re-run the audit (`AUDIT-SECURITY.md` + `AUDIT-QUALITY.md` from `audits/gohighlevel-mcp/`) against the deployed worker to confirm the findings are closed.
- Audit Cloudflare Workers Logs retention vs. your privacy posture. The rebuild only logs structured non-PII events, but a final policy check is worth doing.
