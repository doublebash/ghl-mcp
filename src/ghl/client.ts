const GHL_BASE_URL = "https://services.leadconnectorhq.com";

export interface GHLEnv {
  GHL_API_TOKEN: string;
  GHL_LOCATION_ID: string;
  GHL_USER_ID: string;
  GHL_CALENDAR_ID: string;
  MCP_AUTH_TOKEN: string;
  GHL_OAUTH_CLIENT_SECRET: string;
  GHL_OAUTH_KV: KVNamespace;
}

export async function ghlRequest(
  env: GHLEnv,
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `${GHL_BASE_URL}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.GHL_API_TOKEN}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GHL API error ${response.status} on ${method} ${path}: ${text}`);
  }

  return response.json();
}
