import { ghlRequest, GHLEnv } from "./client.js";

export interface OpportunityFilters {
  pipelineId?: string;
  stageId?: string;
  status?: "open" | "won" | "lost" | "abandoned";
  assignedTo?: string;
  minValue?: number;
  maxValue?: number;
  staleDays?: number; // only return opportunities with no activity in X days
}

export async function getOpportunities(
  env: GHLEnv,
  filters: OpportunityFilters = {}
): Promise<unknown[]> {
  const params = new URLSearchParams({ location_id: env.GHL_LOCATION_ID });

  if (filters.pipelineId) params.set("pipeline_id", filters.pipelineId);
  if (filters.stageId) params.set("pipeline_stage_id", filters.stageId);
  if (filters.status) params.set("status", filters.status);
  if (filters.assignedTo) params.set("assigned_to", filters.assignedTo);

  const data = await ghlRequest(
    env,
    "GET",
    `/opportunities/search?${params}`
  ) as { opportunities?: OpportunityRecord[] };

  let results: OpportunityRecord[] = data.opportunities ?? [];

  // GHL doesn't support value range or stale filtering natively — we do it here
  if (filters.minValue !== undefined) {
    results = results.filter((o) => (o.monetaryValue ?? 0) >= filters.minValue!);
  }
  if (filters.maxValue !== undefined) {
    results = results.filter((o) => (o.monetaryValue ?? 0) <= filters.maxValue!);
  }
  if (filters.staleDays !== undefined) {
    const cutoff = Date.now() - filters.staleDays * 24 * 60 * 60 * 1000;
    results = results.filter((o) => {
      const last = o.lastActivityDate ?? o.updatedAt ?? o.createdAt;
      return last ? new Date(last).getTime() < cutoff : true;
    });
  }

  return results;
}

export async function getOpportunity(
  env: GHLEnv,
  opportunityId: string
): Promise<unknown> {
  const data = await ghlRequest(
    env,
    "GET",
    `/opportunities/${opportunityId}`
  ) as { opportunity?: unknown };

  if (!data.opportunity) throw new Error(`Opportunity not found: ${opportunityId}`);
  return data.opportunity;
}

export async function getPipelines(env: GHLEnv): Promise<unknown[]> {
  const params = new URLSearchParams({ locationId: env.GHL_LOCATION_ID });

  const data = await ghlRequest(
    env,
    "GET",
    `/opportunities/pipelines?${params}`
  ) as { pipelines?: unknown[] };

  return data.pipelines ?? [];
}

export interface CreateOpportunityInput {
  name: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  monetaryValue?: number;
  status?: "open" | "won" | "lost" | "abandoned";
  assignedTo?: string;
}

export async function createOpportunity(
  env: GHLEnv,
  input: CreateOpportunityInput
): Promise<unknown> {
  const body = {
    name: input.name,
    pipelineId: input.pipelineId,
    pipelineStageId: input.stageId,
    contactId: input.contactId,
    locationId: env.GHL_LOCATION_ID,
    status: input.status ?? "open",
    ...(input.monetaryValue !== undefined && { monetaryValue: input.monetaryValue }),
    ...(input.assignedTo && { assignedTo: input.assignedTo }),
  };

  const data = await ghlRequest(env, "POST", `/opportunities/`, body) as {
    opportunity?: unknown;
  };

  if (!data.opportunity) throw new Error("Failed to create opportunity — no opportunity returned");
  return data.opportunity;
}

export async function updateOpportunity(
  env: GHLEnv,
  opportunityId: string,
  input: Partial<Omit<CreateOpportunityInput, "pipelineId" | "contactId">>
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.stageId !== undefined) body.pipelineStageId = input.stageId;
  if (input.status !== undefined) body.status = input.status;
  if (input.monetaryValue !== undefined) body.monetaryValue = input.monetaryValue;
  if (input.assignedTo !== undefined) body.assignedTo = input.assignedTo;

  const data = await ghlRequest(env, "PUT", `/opportunities/${opportunityId}`, body) as {
    opportunity?: unknown;
  };

  if (!data.opportunity) throw new Error(`Failed to update opportunity: ${opportunityId}`);
  return data.opportunity;
}

interface OpportunityRecord {
  id: string;
  monetaryValue?: number;
  lastActivityDate?: string;
  updatedAt?: string;
  createdAt?: string;
  [key: string]: unknown;
}
