import type { GHLApiEnv } from "../env.js";
import { ghlFetch } from "./client.js";
import { buildPath } from "./path.js";
import type { Workflow } from "./types.js";

export async function listWorkflows(env: GHLApiEnv): Promise<Workflow[]> {
  const data = await ghlFetch<{ workflows?: Workflow[] }>(env, {
    method: "GET",
    path: "/workflows/",
    query: { locationId: env.GHL_LOCATION_ID },
  });
  return data?.workflows ?? [];
}

export async function triggerWorkflow(
  env: GHLApiEnv,
  contactId: string,
  workflowId: string,
  eventStartTime?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (eventStartTime !== undefined) body.eventStartTime = eventStartTime;

  return ghlFetch(env, {
    method: "POST",
    path: buildPath("/contacts/{contactId}/workflow/{workflowId}", { contactId, workflowId }),
    body,
  });
}
