export const SERVER_NAME = "ghl-mcp";
// Keep in lockstep with package.json — tests/mcp/schemas.test.ts asserts they match.
export const SERVER_VERSION = "2.5.0";

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

// A contact's SMS and email threads are separate conversations, so history has
// to span more than one. Capped because each thread costs a subrequest.
export const MAX_MERGED_CONVERSATIONS = 3;

export const GHL_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export const OPPORTUNITY_STATUSES = ["open", "won", "lost", "abandoned"] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

export const ALLOWED_REDIRECT_HOSTS = new Set<string>([
  "claude.ai",
  "api.claude.ai",
  "claude.com",
  "api.claude.com",
  // Claude Code Desktop uses http://localhost:<port>/callback for OAuth
  // (RFC 8252 native-app pattern). Localhost is only reachable from this
  // machine, so the token cannot be intercepted by remote attackers.
  "localhost",
  "127.0.0.1",
]);

export const ALLOWED_REDIRECT_SCHEMES = new Set<string>(["https:", "http:"]);

export const OPPORTUNITY_PAGE_HARD_CAP = 500;

// Independent of the record cap: bounds how many sequential upstream requests a
// single tool call may issue. Without it, a small page size could turn one call
// into hundreds of round-trips against Workers' subrequest budget.
export const OPPORTUNITY_MAX_PAGES = 25;

export const DEFAULT_CONTACT_SEARCH_LIMIT = 25;
export const MIN_CONTACT_SEARCH_LIMIT = 1;
export const MAX_CONTACT_SEARCH_LIMIT = 100;

// Ceiling on how many records any one tool hands back. Results above this are
// trimmed and the response says so explicitly, so the model is never left to
// assume a truncated list was the whole list.
export const MAX_RESULT_ITEMS = 100;
