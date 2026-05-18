import type { OpportunityStatus } from "../constants.js";
import type { GHLApiEnv } from "../env.js";
import { ToolError } from "@bashco/mcp-toolkit";
import { ghlFetch } from "./client.js";
import { fetchAllPages } from "./pagination.js";
import { buildPath } from "./path.js";
import type { Opportunity, Pipeline } from "./types.js";

export interface OpportunityFilters {
  pipelineId?: string;
  stageId?: string;
  status?: OpportunityStatus;
  assignedTo?: string;
  minValue?: number;
  maxValue?: number;
  staleDays?: number;
}

export interface CreateOpportunityInput {
  name: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  monetaryValue?: number;
  status?: OpportunityStatus;
  assignedTo?: string;
}

export type UpdateOpportunityInput = Partial<
  Omit<CreateOpportunityInput, "pipelineId" | "contactId">
>;

async function fetchOpportunityPage(
  env: GHLApiEnv,
  filters: OpportunityFilters,
  page: number,
): Promise<{ items: Opportunity[]; hasMore: boolean }> {
  const data = await ghlFetch<{ opportunities?: Opportunity[]; meta?: { nextPageUrl?: string | null } }>(
    env,
    {
      method: "GET",
      path: "/opportunities/search",
      query: {
        location_id: env.GHL_LOCATION_ID,
        ...(filters.pipelineId !== undefined ? { pipeline_id: filters.pipelineId } : {}),
        ...(filters.stageId !== undefined ? { pipeline_stage_id: filters.stageId } : {}),
        ...(filters.status !== undefined ? { status: filters.status } : {}),
        ...(filters.assignedTo !== undefined ? { assigned_to: filters.assignedTo } : {}),
        page,
      },
    },
  );
  const items = data?.opportunities ?? [];
  const nextUrl = data?.meta?.nextPageUrl ?? null;
  return { items, hasMore: items.length > 0 && nextUrl !== null };
}

export async function getOpportunities(
  env: GHLApiEnv,
  filters: OpportunityFilters = {},
): Promise<Opportunity[]> {
  const all = await fetchAllPages<Opportunity>((page) => fetchOpportunityPage(env, filters, page));

  let results = all;
  if (filters.minValue !== undefined) {
    const min = filters.minValue;
    results = results.filter((o) => (o.monetaryValue ?? 0) >= min);
  }
  if (filters.maxValue !== undefined) {
    const max = filters.maxValue;
    results = results.filter((o) => (o.monetaryValue ?? 0) <= max);
  }
  if (filters.staleDays !== undefined) {
    const cutoff = Date.now() - filters.staleDays * 24 * 60 * 60 * 1000;
    results = results.filter((o) => {
      const last = o.lastActivityDate ?? o.updatedAt ?? o.createdAt;
      return last !== undefined ? new Date(last).getTime() < cutoff : true;
    });
  }

  return results;
}

export async function getOpportunity(env: GHLApiEnv, opportunityId: string): Promise<Opportunity> {
  const data = await ghlFetch<{ opportunity?: Opportunity }>(env, {
    method: "GET",
    path: buildPath("/opportunities/{opportunityId}", { opportunityId }),
  });
  if (!data?.opportunity) throw ToolError.notFound("opportunity", opportunityId);
  return data.opportunity;
}

export async function getPipelines(env: GHLApiEnv): Promise<Pipeline[]> {
  const data = await ghlFetch<{ pipelines?: Pipeline[] }>(env, {
    method: "GET",
    path: "/opportunities/pipelines",
    query: { locationId: env.GHL_LOCATION_ID },
  });
  return data?.pipelines ?? [];
}

export async function createOpportunity(
  env: GHLApiEnv,
  input: CreateOpportunityInput,
): Promise<Opportunity> {
  const body = {
    name: input.name,
    pipelineId: input.pipelineId,
    pipelineStageId: input.stageId,
    contactId: input.contactId,
    locationId: env.GHL_LOCATION_ID,
    status: input.status ?? "open",
    ...(input.monetaryValue !== undefined ? { monetaryValue: input.monetaryValue } : {}),
    ...(input.assignedTo !== undefined ? { assignedTo: input.assignedTo } : {}),
  };
  const data = await ghlFetch<{ opportunity?: Opportunity }>(env, {
    method: "POST",
    path: "/opportunities/",
    body,
  });
  if (!data?.opportunity) {
    throw new ToolError({
      userMessage: "failed to create opportunity",
      internalMessage: "create_opportunity returned no opportunity",
    });
  }
  return data.opportunity;
}

export async function updateOpportunity(
  env: GHLApiEnv,
  opportunityId: string,
  input: UpdateOpportunityInput,
): Promise<Opportunity> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.stageId !== undefined) body.pipelineStageId = input.stageId;
  if (input.status !== undefined) body.status = input.status;
  if (input.monetaryValue !== undefined) body.monetaryValue = input.monetaryValue;
  if (input.assignedTo !== undefined) body.assignedTo = input.assignedTo;

  const data = await ghlFetch<{ opportunity?: Opportunity }>(env, {
    method: "PUT",
    path: buildPath("/opportunities/{opportunityId}", { opportunityId }),
    body,
  });
  if (!data?.opportunity) {
    throw new ToolError({
      userMessage: "failed to update opportunity",
      internalMessage: `update_opportunity returned no opportunity for id ${opportunityId}`,
    });
  }
  return data.opportunity;
}
