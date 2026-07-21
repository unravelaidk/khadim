function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost"
    || normalized === "::1"
    || /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

/** Validate an endpoint before any model-scoped credential can reach it. */
export function safeModelBaseUrl(value: string, errorMessage: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error(errorMessage);
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || !parsed.hostname
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname))) {
    throw new Error(errorMessage);
  }
  return parsed.toString();
}
