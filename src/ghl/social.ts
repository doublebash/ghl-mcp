import {
  createUpstreamClient,
  type UpstreamClient,
  type UpstreamRequestInit,
} from "@bashco/mcp-toolkit";
import { ToolError } from "@bashco/mcp-toolkit";
import { GHL_BASE_URL, SOCIAL_API_VERSION, SOCIAL_PLATFORMS, type SocialPlatform } from "../constants.js";
import type { GHLApiEnv } from "../env.js";
import type { SocialAccount } from "./types.js";

// GHL answers 401 for two quite different causes on these endpoints: a private
// integration token missing a socialplanner scope, and a connected social
// account whose platform token has expired. The Phase 0 spike hit the first.
// A summary naming only one sends the reader off to fix the wrong thing, so
// this names both and puts the cheaper check first.
const UNAUTHORISED_SUMMARY =
  "the integration token may be missing a socialplanner scope, or the connected social account " +
  "may need reconnecting in the GoHighLevel Social Planner settings";

// One client per env, matching ghlFetch's approach — a posting tool can issue
// several calls, and there is no reason to rebuild the client for each.
const clients = new WeakMap<GHLApiEnv, UpstreamClient>();

function socialClientFor(env: GHLApiEnv): UpstreamClient {
  const existing = clients.get(env);
  if (existing) return existing;

  const client = createUpstreamClient({
    upstreamName: "GHL Social",
    baseUrl: GHL_BASE_URL,
    buildHeaders: async () => ({
      Authorization: `Bearer ${env.GHL_API_TOKEN}`,
      Version: SOCIAL_API_VERSION,
    }),
    statusSummaries: {
      401: UNAUTHORISED_SUMMARY,
      403: UNAUTHORISED_SUMMARY,
    },
  });
  clients.set(env, client);
  return client;
}

/** Single entry point for Social Planner calls. */
export async function socialFetch<T = unknown>(
  env: GHLApiEnv,
  init: UpstreamRequestInit,
): Promise<T> {
  return socialClientFor(env).fetch<T>(init);
}

interface RawAccount {
  id?: unknown;
  _id?: unknown;
  platform?: unknown;
  name?: unknown;
}

function normaliseAccount(raw: RawAccount): SocialAccount | null {
  const id = typeof raw.id === "string" ? raw.id : typeof raw._id === "string" ? raw._id : "";
  if (id === "") return null;
  const platform = typeof raw.platform === "string" ? raw.platform.toLowerCase() : "unknown";
  return {
    id,
    platform,
    supported: (SOCIAL_PLATFORMS as readonly string[]).includes(platform),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
  };
}

function configurationError(detail: string): ToolError {
  return new ToolError({
    userMessage:
      "social accounts are not configured on this server — the operator needs to set the " +
      "GHL_SOCIAL_ACCOUNTS secret to a JSON array of { id, platform, name }",
    internalMessage: `GHL_SOCIAL_ACCOUNTS ${detail}`,
    status: 500,
  });
}

/**
 * The social accounts connected in GoHighLevel, read from configuration.
 *
 * Not from the API: GET /social-media-posting/{locationId}/accounts requires
 * socialplanner/account.readonly, which this location's private integration
 * cannot grant. Swapping back to the live endpoint later is a change to this
 * function alone — every caller, assertAccountsBelongTo included, is unaffected.
 */
export async function listSocialAccounts(env: GHLApiEnv): Promise<SocialAccount[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.GHL_SOCIAL_ACCOUNTS);
  } catch {
    throw configurationError("is not valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw configurationError("is not a JSON array");
  }

  const accounts: SocialAccount[] = [];
  for (const item of parsed) {
    const account = normaliseAccount(item as RawAccount);
    if (account !== null) accounts.push(account);
  }
  return accounts;
}

/**
 * Guards against posting to the wrong network — a LinkedIn id handed to
 * post_to_youtube would otherwise reach GHL and fail there, or worse, succeed
 * somewhere unintended.
 */
export async function assertAccountsBelongTo(
  env: GHLApiEnv,
  platform: SocialPlatform,
  accountIds: string[],
): Promise<void> {
  const accounts = await listSocialAccounts(env);
  const byId = new Map(accounts.map((a) => [a.id, a]));

  for (const id of accountIds) {
    const account = byId.get(id);
    if (account === undefined) {
      throw ToolError.validation(
        "unknown social account id — run list_social_accounts for the valid ids",
        `account ${id} is not configured for location ${env.GHL_LOCATION_ID}`,
      );
    }
    if (account.platform !== platform) {
      throw ToolError.validation(
        `account ${id} is a ${account.platform} account, not ${platform}`,
        `platform mismatch: ${id} is ${account.platform}, expected ${platform}`,
      );
    }
  }
}
