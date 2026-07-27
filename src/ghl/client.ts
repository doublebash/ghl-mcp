import {
  createUpstreamClient,
  type UpstreamClient,
  type UpstreamRequestInit,
} from "@bashco/mcp-toolkit";
import { GHL_API_VERSION, GHL_BASE_URL } from "../constants.js";
import type { GHLApiEnv } from "../env.js";

export type GhlRequestInit = UpstreamRequestInit;

// One client per env object rather than one per request. A tool call like
// get_opportunities issues dozens of fetches; there is no reason to rebuild the
// client each time. Keyed weakly so a discarded env is not pinned in memory.
const clients = new WeakMap<GHLApiEnv, UpstreamClient>();

function clientFor(env: GHLApiEnv): UpstreamClient {
  const existing = clients.get(env);
  if (existing) return existing;

  const client = createUpstreamClient({
    upstreamName: "GHL",
    baseUrl: GHL_BASE_URL,
    buildHeaders: async () => ({
      Authorization: `Bearer ${env.GHL_API_TOKEN}`,
      Version: GHL_API_VERSION,
    }),
  });
  clients.set(env, client);
  return client;
}

export async function ghlFetch<T = unknown>(env: GHLApiEnv, init: GhlRequestInit): Promise<T> {
  return clientFor(env).fetch<T>(init);
}
