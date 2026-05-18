import { GHL_API_VERSION, GHL_BASE_URL } from "../constants.js";
import type { GHLApiEnv } from "../env.js";
import { ToolError } from "../errors.js";
import { log } from "../logger.js";

export interface GhlRequestInit {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export interface GhlFetcher {
  <T = unknown>(env: GHLApiEnv, init: GhlRequestInit): Promise<T>;
}

const STATUS_SUMMARIES: Record<number, string> = {
  400: "bad request",
  401: "unauthorized",
  403: "forbidden",
  404: "not found",
  409: "conflict",
  422: "unprocessable entity",
  429: "rate limited",
};

function summaryFor(status: number): string {
  return STATUS_SUMMARIES[status] ?? "upstream error";
}

function buildUrl(path: string, query?: GhlRequestInit["query"]): string {
  const url = new URL(`${GHL_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === "") continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

export const ghlFetch: GhlFetcher = async <T>(env: GHLApiEnv, init: GhlRequestInit): Promise<T> => {
  const url = buildUrl(init.path, init.query);
  const requestInit: RequestInit = {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.GHL_API_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Version: GHL_API_VERSION,
    },
  };
  if (init.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }
  const response = await fetch(url, requestInit);

  if (!response.ok) {
    const status = response.status;
    const detail = await response.text().catch(() => "");
    log.error("ghl_upstream_error", { status, method: init.method, path: init.path });
    throw ToolError.upstream(status, summaryFor(status), detail.slice(0, 1024));
  }

  if (response.status === 204) return undefined as T;

  const ct = response.headers.get("Content-Type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;

  return (await response.json()) as T;
};
