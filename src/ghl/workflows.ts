import { ghlRequest, GHLEnv } from "./client.js";

export async function listWorkflows(env: GHLEnv): Promise<unknown[]> {
  const params = new URLSearchParams({ locationId: env.GHL_LOCATION_ID });

  const data = await ghlRequest(
    env,
    "GET",
    `/workflows/?${params}`
  ) as { workflows?: unknown[] };

  return data.workflows ?? [];
}

export async function triggerWorkflow(
  env: GHLEnv,
  contactId: string,
  workflowId: string,
  eventStartTime?: string
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (eventStartTime) body.eventStartTime = eventStartTime;

  const data = await ghlRequest(
    env,
    "POST",
    `/contacts/${contactId}/workflow/${workflowId}`,
    body
  ) as unknown;

  return data;
}
