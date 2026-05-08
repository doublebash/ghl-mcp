import { Hono } from "hono";
import { cors } from "hono/cors";
import { toolDefinitions } from "./mcp/tools.js";
import { handleToolCall } from "./mcp/handlers.js";
import { GHLEnv } from "./ghl/client.js";

const app = new Hono<{ Bindings: GHLEnv }>();

// ── Timing-safe comparison ────────────────────────────────────────────────────
// Prevents token enumeration via timing attacks on the hot auth path.

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(32),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign("HMAC", key, encoder.encode(a)),
    crypto.subtle.sign("HMAC", key, encoder.encode(b)),
  ]);
  const bytesA = new Uint8Array(sigA);
  const bytesB = new Uint8Array(sigB);
  if (bytesA.length !== bytesB.length) return false;
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) diff |= bytesA[i]! ^ bytesB[i]!;
  return diff === 0;
}

// Allowed redirect_uri hostnames for the OAuth flow — prevents open redirect attacks
const ALLOWED_REDIRECT_HOSTS = new Set(["claude.ai", "api.claude.ai"]);

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // Must be HTTPS and on a known Claude domain
    if (url.protocol !== "https:") return false;
    const host = url.hostname;
    return ALLOWED_REDIRECT_HOSTS.has(host) || host.endsWith(".claude.ai");
  } catch {
    return false;
  }
}

// Escape values before embedding in HTML attributes — prevents XSS
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Required for Claude.ai web — browser blocks requests without these headers
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "Accept", "Mcp-Session-Id"],
  exposeHeaders: ["WWW-Authenticate"],
  maxAge: 86400,
}));

// OAuth endpoints are public — all other routes require a valid Bearer token
const PUBLIC_PATHS = new Set([
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource",
  "/authorize",
  "/approve",
  "/token",
  "/register",
]);

// ─── Auth middleware ──────────────────────────────────────────────────────────
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PATHS.has(path)) return next();

  const base = new URL(c.req.url).origin;
  const expected = c.env.MCP_AUTH_TOKEN;
  const auth = c.req.header("Authorization") ?? "";
  const prefix = "Bearer ";
  const token = auth.startsWith(prefix) ? auth.slice(prefix.length) : "";

  if (!expected || !(await timingSafeEqual(token, expected))) {
    return c.json(
      { error: "Unauthorized" },
      401,
      {
        "WWW-Authenticate": `Bearer realm="GHL MCP Server", resource_metadata="${base}/.well-known/oauth-protected-resource"`,
      }
    );
  }

  return next();
});

// ─── OAuth Protected Resource Metadata (RFC 9396) ────────────────────────────
// Claude.ai hits this first when it sees a 401 — tells it where the OAuth server lives
app.get("/.well-known/oauth-protected-resource", (c) => {
  const base = new URL(c.req.url).origin;
  return c.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
  });
});

// ─── OAuth 2.0 Authorization Server Metadata (RFC 8414) ──────────────────────
// Claude.ai follows the pointer above to discover the auth + token endpoints
app.get("/.well-known/oauth-authorization-server", (c) => {
  const base = new URL(c.req.url).origin;
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code", "client_credentials"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// ─── Authorization endpoint — shows the approval page ────────────────────────
app.get("/authorize", (c) => {
  const { response_type, redirect_uri, state, code_challenge, code_challenge_method } = c.req.query();

  if (response_type !== "code") return c.text("unsupported_response_type", 400);
  if (code_challenge_method !== "S256") return c.text("invalid_request: only S256 is supported", 400);
  if (!redirect_uri || !code_challenge) return c.text("invalid_request: missing required params", 400);

  // Reject redirect URIs that aren't on a known Claude domain — prevents open redirect
  if (!isAllowedRedirectUri(redirect_uri)) {
    return c.text("invalid_request: redirect_uri not permitted", 400);
  }

  // Embed params safely — all values HTML-escaped before going into the template
  const safeParams = escapeHtml(JSON.stringify({ redirect_uri, state, code_challenge }));

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorise — GHL MCP Server</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, sans-serif; background: #0f0f0f; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
    .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 14px; padding: 40px; width: 100%; max-width: 420px; }
    .logo { font-size: 24px; margin-bottom: 4px; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 8px; color: #fff; }
    .sub { color: #888; font-size: 14px; margin: 0 0 32px; line-height: 1.5; }
    label { display: block; font-size: 13px; color: #aaa; margin-bottom: 8px; font-weight: 500; }
    input[type="password"] { width: 100%; padding: 11px 14px; background: #111; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; font-family: monospace; outline: none; transition: border-color 0.15s; }
    input[type="password"]:focus { border-color: #4a4a4a; }
    button { width: 100%; padding: 13px; background: #2563eb; border: none; border-radius: 8px; color: #fff; font-size: 15px; font-weight: 500; cursor: pointer; margin-top: 16px; transition: background 0.15s; }
    button:hover { background: #1d4ed8; }
    .hint { font-size: 12px; color: #555; margin-top: 24px; text-align: center; line-height: 1.5; }
    code { background: #222; padding: 2px 5px; border-radius: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🔐</div>
    <h1>Authorise GHL MCP Server</h1>
    <p class="sub">Claude is requesting access to your GoHighLevel account. Enter your access code to approve.</p>
    <form method="POST" action="/approve">
      <input type="hidden" name="params" value="${safeParams}">
      <label for="code">Access code</label>
      <input type="password" id="code" name="code" placeholder="Paste your MCP_AUTH_TOKEN here" autofocus required>
      <button type="submit">Approve access</button>
    </form>
    <p class="hint">Your access code is the Bearer token value in<br><code>claude_desktop_config.json</code> under the ghl-mcp entry.</p>
  </div>
</body>
</html>`);
});

// ─── Approval form handler ────────────────────────────────────────────────────
app.post("/approve", async (c) => {
  const form = await c.req.formData();
  const code = form.get("code") as string;
  const paramsRaw = form.get("params") as string;

  if (!code || !paramsRaw) return c.text("Bad request", 400);

  // Verify the access code matches the auth token
  if (code !== c.env.MCP_AUTH_TOKEN) {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Access denied</title>
  <style>body{font-family:-apple-system,sans-serif;background:#0f0f0f;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}div{text-align:center}h2{color:#ef4444}a{color:#2563eb}</style>
</head>
<body>
  <div>
    <h2>Incorrect access code</h2>
    <p><a href="javascript:history.back()">← Try again</a></p>
  </div>
</body>
</html>`, 401);
  }

  let parsed: { redirect_uri: string; state?: string; code_challenge: string };
  try {
    parsed = JSON.parse(paramsRaw);
  } catch {
    return c.text("Bad request: invalid params", 400);
  }

  const { redirect_uri, state, code_challenge } = parsed;

  // Re-validate redirect_uri server-side — the hidden field could be tampered with
  if (!redirect_uri || !isAllowedRedirectUri(redirect_uri)) {
    return c.text("Bad request: redirect_uri not permitted", 400);
  }

  // Generate a one-time authorisation code (expires in 5 minutes)
  const authCode = crypto.randomUUID();
  await c.env.GHL_OAUTH_KV.put(
    `code:${authCode}`,
    JSON.stringify({ codeChallenge: code_challenge, redirectUri: redirect_uri, expiresAt: Date.now() + 5 * 60 * 1000 }),
    { expirationTtl: 300 }
  );

  // Redirect back to Claude with the code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  if (state) redirectUrl.searchParams.set("state", state);

  return c.redirect(redirectUrl.toString());
});

// ─── Token exchange endpoint ──────────────────────────────────────────────────
app.post("/token", async (c) => {
  // Accept both form-encoded and JSON bodies
  let body: Record<string, string>;
  const contentType = c.req.header("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    body = await c.req.json();
  } else {
    const form = await c.req.formData();
    body = Object.fromEntries([...form.entries()].map(([k, v]) => [k, v as string]));
  }

  const { grant_type, code, code_verifier, redirect_uri } = body;

  // ── Client credentials flow (used by Claude.ai when client ID + secret are provided) ──
  if (grant_type === "client_credentials") {
    const clientSecret = body["client_secret"];
    if (!clientSecret || clientSecret !== c.env.GHL_OAUTH_CLIENT_SECRET) {
      return c.json({ error: "invalid_client" }, 401);
    }
    return c.json({
      access_token: c.env.MCP_AUTH_TOKEN,
      token_type: "Bearer",
      expires_in: 7776000,
    });
  }

  if (grant_type !== "authorization_code") return c.json({ error: "unsupported_grant_type" }, 400);
  if (!code || !code_verifier || !redirect_uri) return c.json({ error: "invalid_request" }, 400);

  // Look up the auth code
  const stored = await c.env.GHL_OAUTH_KV.get(`code:${code}`);
  if (!stored) return c.json({ error: "invalid_grant" }, 400);

  const { codeChallenge, redirectUri, expiresAt } = JSON.parse(stored);

  // Check expiry
  if (Date.now() > expiresAt) {
    await c.env.GHL_OAUTH_KV.delete(`code:${code}`);
    return c.json({ error: "invalid_grant" }, 400);
  }

  // Check redirect_uri matches
  if (redirect_uri !== redirectUri) return c.json({ error: "invalid_grant" }, 400);

  // Verify PKCE (S256): SHA-256(code_verifier) must equal code_challenge
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code_verifier));
  const base64url = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

  if (base64url !== codeChallenge) return c.json({ error: "invalid_grant" }, 400);

  // Consume the code — one use only
  await c.env.GHL_OAUTH_KV.delete(`code:${code}`);

  // Issue the access token (valid 90 days — Claude.ai will re-auth when it expires)
  return c.json({
    access_token: c.env.MCP_AUTH_TOKEN,
    token_type: "Bearer",
    expires_in: 7776000,
  });
});

// ─── Dynamic client registration (RFC 7591) ──────────────────────────────────
// Claude Desktop requires this before starting the OAuth flow.
app.post("/register", async (c) => {
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    // proceed with empty body — registration metadata is optional
  }

  const rawRedirectUris = body["redirect_uris"];
  if (rawRedirectUris !== undefined) {
    if (!Array.isArray(rawRedirectUris)) {
      return c.json({ error: "invalid_client_metadata", error_description: "redirect_uris must be an array" }, 400);
    }
    for (const uri of rawRedirectUris) {
      if (typeof uri !== "string") {
        return c.json({ error: "invalid_redirect_uri", error_description: "redirect_uris must be strings" }, 400);
      }
    }
  }

  const redirectUris = Array.isArray(rawRedirectUris) ? rawRedirectUris as string[] : undefined;
  const clientName = typeof body["client_name"] === "string" ? body["client_name"] : undefined;

  return c.json(
    {
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(redirectUris ? { redirect_uris: redirectUris } : {}),
      ...(clientName ? { client_name: clientName } : {}),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      code_challenge_methods: ["S256"],
    },
    201
  );
});

// ─── MCP JSON-RPC endpoint ────────────────────────────────────────────────────
app.post("/mcp", async (c) => {
  let body: { jsonrpc: string; id?: unknown; method: string; params?: unknown };

  try {
    body = await c.req.json();
  } catch {
    return c.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400
    );
  }

  const { id, method, params } = body;
  const ok = (result: unknown) => c.json({ jsonrpc: "2.0", id: id ?? null, result });

  switch (method) {
    case "initialize": {
      const clientVersion = ((params as Record<string, unknown>)?.protocolVersion as string | undefined) ?? "2024-11-05";
      const negotiated = clientVersion >= "2025-03-26" ? "2025-03-26" : "2024-11-05";
      const body = JSON.stringify({
        jsonrpc: "2.0",
        id: id ?? null,
        result: {
          protocolVersion: negotiated,
          capabilities: { tools: {} },
          serverInfo: { name: "ghl-mcp", version: "1.0.0" },
        },
      });
      return new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Mcp-Session-Id": crypto.randomUUID(),
        },
      });
    }

    case "notifications/initialized":
    case "ping":
      return ok({});

    case "tools/list":
      return ok({ tools: toolDefinitions });

    case "tools/call": {
      const p = params as { name: string; arguments?: Record<string, unknown> };
      try {
        const result = await handleToolCall(c.env, p.name, p.arguments ?? {});
        return ok({
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (e) {
        const internal = e instanceof Error ? e.message : String(e);
        console.error(`[tool:${p.name}]`, internal);
        const userMessage = internal.startsWith("GHL API error")
          ? internal.replace(/\?.*$/, "")
          : internal;
        return ok({
          content: [{ type: "text", text: `Error: ${userMessage}` }],
          isError: true,
        });
      }
    }

    default:
      return c.json(
        { jsonrpc: "2.0", id: id ?? null, error: { code: -32601, message: `Method not found: ${method}` } },
        404
      );
  }
});

export default app;
