import {
  createUpstreamClient,
  type UpstreamClient,
  type UpstreamRequestInit,
} from "@bashco/mcp-toolkit";
import { GHL_BASE_URL, SOCIAL_API_VERSION } from "../constants.js";
import type { GHLApiEnv } from "../env.js";

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
