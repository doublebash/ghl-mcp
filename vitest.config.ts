import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          compatibilityDate: "2024-11-01",
          compatibilityFlags: ["nodejs_compat"],
          kvNamespaces: ["GHL_OAUTH_KV"],
          bindings: {
            GHL_API_TOKEN: "test-ghl-token",
            GHL_LOCATION_ID: "test-location",
            GHL_USER_ID: "test-user",
            GHL_CALENDAR_ID: "test-calendar",
            MCP_APPROVAL_CODE: "test-approval-code",
            GHL_OAUTH_CLIENT_SECRET: "",
          },
        },
      },
    },
  },
});
