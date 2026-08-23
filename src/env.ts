import type { CloudflareRateLimiter } from "@bashco/mcp-toolkit";

export interface GHLApiEnv {
  GHL_API_TOKEN: string;
  GHL_LOCATION_ID: string;
  GHL_USER_ID: string;
  GHL_CALENDAR_ID: string;
  /**
   * Connected social accounts as a JSON array of { id, platform, name }.
   *
   * GHL guards GET /social-media-posting/{locationId}/accounts with
   * socialplanner/account.readonly, a scope this location's private integration
   * cannot grant — it 401s regardless of API version. The posting tools only
   * ever needed the ids, not the listing endpoint, so they come from config.
   */
  GHL_SOCIAL_ACCOUNTS: string;
}

export interface WorkerEnv extends GHLApiEnv {
  MCP_APPROVAL_CODE: string;
  GHL_OAUTH_CLIENT_SECRET: string;

  GHL_OAUTH_KV: KVNamespace;

  RATE_LIMIT_APPROVE: CloudflareRateLimiter;
  RATE_LIMIT_TOKEN: CloudflareRateLimiter;
  RATE_LIMIT_REGISTER: CloudflareRateLimiter;
  RATE_LIMIT_MCP: CloudflareRateLimiter;
}

export function ghlEnvFrom(env: WorkerEnv): GHLApiEnv {
  return {
    GHL_API_TOKEN: env.GHL_API_TOKEN,
    GHL_LOCATION_ID: env.GHL_LOCATION_ID,
    GHL_USER_ID: env.GHL_USER_ID,
    GHL_CALENDAR_ID: env.GHL_CALENDAR_ID,
    GHL_SOCIAL_ACCOUNTS: env.GHL_SOCIAL_ACCOUNTS,
  };
}
