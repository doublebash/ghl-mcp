import type { CloudflareRateLimiter } from "@bashco/mcp-toolkit";

export interface GHLApiEnv {
  GHL_API_TOKEN: string;
  GHL_LOCATION_ID: string;
  GHL_USER_ID: string;
  GHL_CALENDAR_ID: string;
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
  };
}
