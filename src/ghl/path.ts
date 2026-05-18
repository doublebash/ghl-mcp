import { GHL_ID_PATTERN } from "../constants.js";
import { ToolError } from "../errors.js";

export function validateId(kind: string, value: string): string {
  if (!GHL_ID_PATTERN.test(value)) {
    throw ToolError.validation(`invalid ${kind}`, `${kind} failed pattern: ${value}`);
  }
  return value;
}

export function buildPath(template: string, ids: Record<string, string> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = ids[key];
    if (value === undefined) {
      throw ToolError.validation(`missing path parameter`, `template ${template} missing ${key}`);
    }
    validateId(key, value);
    return encodeURIComponent(value);
  });
}
