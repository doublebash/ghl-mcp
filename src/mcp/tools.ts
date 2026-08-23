import { defineTools, type ToolMap } from "@bashco/mcp-toolkit";
import type { GHLApiEnv } from "../env.js";
import { TOOL_DESCRIPTIONS } from "./descriptions.js";
import { HANDLERS } from "./handlers.js";
import { toolSchemas, type ToolName } from "./schemas.js";

const toolMap: ToolMap<GHLApiEnv> = {};
for (const name of Object.keys(toolSchemas) as ToolName[]) {
  toolMap[name] = {
    schema: toolSchemas[name],
    description: TOOL_DESCRIPTIONS[name],
    handler: HANDLERS[name] as (env: GHLApiEnv, args: unknown) => Promise<unknown>,
  };
}

const { toolDefinitions: definedToolDefinitions, dispatch } = defineTools<GHLApiEnv>(toolMap);

export const toolDefinitions = definedToolDefinitions;
export const dispatchToolCall = dispatch;
