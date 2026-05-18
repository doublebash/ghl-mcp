export const SERVER_NAME = "ghl-mcp";
export const SERVER_VERSION = "2.1.0";

export const GHL_BASE_URL = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "2021-07-28";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2024-11-05", "2025-03-26"] as const;
export const DEFAULT_PROTOCOL_VERSION: (typeof SUPPORTED_PROTOCOL_VERSIONS)[number] = "2024-11-05";

export const DEFAULT_APPOINTMENT_LOOKAHEAD_DAYS = 30;
export const MIN_APPOINTMENT_LOOKAHEAD_DAYS = 1;
export const MAX_APPOINTMENT_LOOKAHEAD_DAYS = 365;

export const DEFAULT_CONVERSATION_LIMIT = 20;
export const MIN_CONVERSATION_LIMIT = 1;
export const MAX_CONVERSATION_LIMIT = 100;

export const GHL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export const OPPORTUNITY_STATUSES = ["open", "won", "lost", "abandoned"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const ALLOWED_REDIRECT_HOSTS = new Set<string>([
  "claude.ai",
  "api.claude.ai",
  "claude.com",
  "api.claude.com",
]);

export const OPPORTUNITY_PAGE_HARD_CAP = 500;
