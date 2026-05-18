import { Hono } from "hono";
import { z } from "zod";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTH_CODE_TTL_SECONDS,
  OAUTH_STATE_MAX_LENGTH,
  REGISTER_BODY_MAX_BYTES,
  REGISTER_MAX_REDIRECT_URIS,
} from "../constants.js";
import { sha256Base64Url } from "../crypto/encoding.js";
import { timingSafeEqual } from "../crypto/timing.js";
import type { WorkerEnv } from "../env.js";
import { log } from "../logger.js";
import { approvePage, deniedPage, escapeHtml } from "./pages.js";
import { rateLimit } from "./ratelimit.js";
import { isAllowedRedirectUri } from "./redirect.js";
import { issueBearer } from "./tokens.js";

const AUTH_CODE_KEY_PREFIX = "code:";

const authCodePayloadSchema = z.object({
  codeChallenge: z.string().min(1),
  redirectUri: z.string().url(),
  clientId: z.string().min(1),
  expiresAt: z.number().int().nonnegative(),
});

type AuthCodePayload = z.infer<typeof authCodePayloadSchema>;

const approveParamsSchema = z.object({
  redirect_uri: z.string().url(),
  client_id: z.string().min(1).max(256),
  state: z.string().max(OAUTH_STATE_MAX_LENGTH).optional(),
  code_challenge: z.string().min(1).max(128),
});

const authorizeQuerySchema = z.object({
  response_type: z.literal("code"),
  client_id: z.string().min(1).max(256),
  redirect_uri: z.string().url(),
  state: z.string().max(OAUTH_STATE_MAX_LENGTH).optional(),
  code_challenge: z.string().min(1).max(128),
  code_challenge_method: z.literal("S256"),
});

const tokenBodySchema = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1).max(256),
  code_verifier: z.string().min(43).max(128),
  redirect_uri: z.string().url(),
  client_id: z.string().min(1).max(256).optional(),
});

const registerBodySchema = z
  .object({
    client_name: z.string().min(1).max(256).optional(),
    redirect_uris: z
      .array(z.string().url().max(2048))
      .max(REGISTER_MAX_REDIRECT_URIS)
      .optional(),
  })
  .passthrough();

export const oauthRoutes = new Hono<{ Bindings: WorkerEnv }>();

oauthRoutes.get("/.well-known/oauth-protected-resource", (c) => {
  const base = new URL(c.req.url).origin;
  return c.json({
    resource: `${base}/mcp`,
    authorization_servers: [base],
  });
});

oauthRoutes.get("/.well-known/oauth-authorization-server", (c) => {
  const base = new URL(c.req.url).origin;
  return c.json({
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ["code"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

oauthRoutes.get("/authorize", (c) => {
  const parsed = authorizeQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return c.text("invalid_request: malformed query parameters", 400);
  }
  const { redirect_uri, state, code_challenge, client_id } = parsed.data;

  if (!isAllowedRedirectUri(redirect_uri)) {
    return c.text("invalid_request: redirect_uri not permitted", 400);
  }

  const safeParams = escapeHtml(
    JSON.stringify({ redirect_uri, state, code_challenge, client_id }),
  );
  return c.html(approvePage(safeParams));
});

oauthRoutes.post("/approve", rateLimit("RATE_LIMIT_APPROVE"), async (c) => {
  const form = await c.req.formData();
  const code = form.get("code");
  const paramsRaw = form.get("params");

  if (typeof code !== "string" || typeof paramsRaw !== "string") {
    return c.text("Bad request", 400);
  }
  if (code.length > 512) return c.text("Bad request", 400);

  const expected = c.env.MCP_APPROVAL_CODE ?? "";
  const ok = await timingSafeEqual(code, expected);
  if (!expected || !ok) {
    log.warn("approve_denied", { ip: c.req.header("cf-connecting-ip") });
    return c.html(deniedPage(), 401);
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(paramsRaw);
  } catch {
    return c.text("Bad request: invalid params", 400);
  }
  const parsed = approveParamsSchema.safeParse(parsedRaw);
  if (!parsed.success) return c.text("Bad request: invalid params", 400);

  const { redirect_uri, state, code_challenge, client_id } = parsed.data;
  if (!isAllowedRedirectUri(redirect_uri)) {
    return c.text("Bad request: redirect_uri not permitted", 400);
  }

  const authCode = crypto.randomUUID();
  const payload: AuthCodePayload = {
    codeChallenge: code_challenge,
    redirectUri: redirect_uri,
    clientId: client_id,
    expiresAt: Date.now() + AUTH_CODE_TTL_SECONDS * 1000,
  };
  await c.env.GHL_OAUTH_KV.put(
    `${AUTH_CODE_KEY_PREFIX}${authCode}`,
    JSON.stringify(payload),
    { expirationTtl: AUTH_CODE_TTL_SECONDS },
  );

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", authCode);
  if (state) redirectUrl.searchParams.set("state", state);

  log.info("approve_granted", { clientId: client_id });
  return c.redirect(redirectUrl.toString());
});

oauthRoutes.post("/token", rateLimit("RATE_LIMIT_TOKEN"), async (c) => {
  const contentType = c.req.header("Content-Type") ?? "";
  let body: Record<string, unknown>;
  try {
    if (contentType.includes("application/json")) {
      body = (await c.req.json()) as Record<string, unknown>;
    } else {
      const form = await c.req.formData();
      const entries: [string, unknown][] = [];
      form.forEach((v, k) => entries.push([k, v]));
      body = Object.fromEntries(entries);
    }
  } catch {
    return c.json({ error: "invalid_request" }, 400);
  }

  const parsed = tokenBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const { code, code_verifier, redirect_uri, client_id } = parsed.data;

  const stored = await c.env.GHL_OAUTH_KV.get(`${AUTH_CODE_KEY_PREFIX}${code}`);
  if (!stored) return c.json({ error: "invalid_grant" }, 400);

  let payloadRaw: unknown;
  try {
    payloadRaw = JSON.parse(stored);
  } catch {
    await c.env.GHL_OAUTH_KV.delete(`${AUTH_CODE_KEY_PREFIX}${code}`);
    return c.json({ error: "server_error" }, 500);
  }
  const payloadResult = authCodePayloadSchema.safeParse(payloadRaw);
  if (!payloadResult.success) {
    await c.env.GHL_OAUTH_KV.delete(`${AUTH_CODE_KEY_PREFIX}${code}`);
    return c.json({ error: "server_error" }, 500);
  }
  const payload = payloadResult.data;

  if (Date.now() > payload.expiresAt) {
    await c.env.GHL_OAUTH_KV.delete(`${AUTH_CODE_KEY_PREFIX}${code}`);
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (redirect_uri !== payload.redirectUri) {
    return c.json({ error: "invalid_grant" }, 400);
  }
  if (client_id && client_id !== payload.clientId) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  const verifierHash = await sha256Base64Url(code_verifier);
  if (!(await timingSafeEqual(verifierHash, payload.codeChallenge))) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  await c.env.GHL_OAUTH_KV.delete(`${AUTH_CODE_KEY_PREFIX}${code}`);

  const issued = await issueBearer(c.env.GHL_OAUTH_KV, {
    clientId: payload.clientId,
    redirectUri: payload.redirectUri,
  });

  log.info("token_issued", { clientId: payload.clientId, expiresAt: issued.expiresAt });

  return c.json({
    access_token: issued.rawToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
  });
});

oauthRoutes.post("/register", rateLimit("RATE_LIMIT_REGISTER"), async (c) => {
  const lenHeader = c.req.header("Content-Length");
  if (lenHeader && Number(lenHeader) > REGISTER_BODY_MAX_BYTES) {
    return c.json({ error: "invalid_request" }, 413);
  }

  let raw: unknown = {};
  try {
    const text = await c.req.text();
    if (text.length > REGISTER_BODY_MAX_BYTES) {
      return c.json({ error: "invalid_request" }, 413);
    }
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    // empty/invalid body — proceed with empty metadata
  }

  const parsed = registerBodySchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }

  return c.json(
    {
      client_id: crypto.randomUUID(),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      ...(parsed.data.redirect_uris ? { redirect_uris: parsed.data.redirect_uris } : {}),
      ...(parsed.data.client_name ? { client_name: parsed.data.client_name } : {}),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
      code_challenge_methods: ["S256"],
    },
    201,
  );
});
