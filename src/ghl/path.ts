import { buildPath as toolkitBuildPath, ghlIdValidator } from "@bashco/mcp-toolkit";

export function buildPath(template: string, ids: Record<string, string> = {}): string {
  return toolkitBuildPath(template, ids, { idValidator: ghlIdValidator });
}
