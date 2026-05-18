import { createUpstreamClient, type UpstreamRequestInit } from "@bashco/mcp-toolkit";
import { GHL_API_VERSION, GHL_BASE_URL } from "../constants.js";
import type { GHLApiEnv } from "../env.js";

export type GhlRequestInit = UpstreamRequestInit;

export async function ghlFetch<T = unknown>(env: GHLApiEnv, init: GhlRequestInit): Promise<T> {
  const client = createUpstreamClient({
    upstreamName: "GHL",
    baseUrl: GHL_BASE_URL,
    buildHeaders: async () => ({
      Authorization: `Bearer ${env.GHL_API_TOKEN}`,
      Version: GHL_API_VERSION,
    }),
  });
  return client.fetch<T>(init);
}
