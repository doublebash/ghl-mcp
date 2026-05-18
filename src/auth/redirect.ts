import { ALLOWED_REDIRECT_HOSTS } from "../constants.js";

export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    if (url.protocol !== "https:") return false;
    return ALLOWED_REDIRECT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
