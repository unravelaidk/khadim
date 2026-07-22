export type GoogleWorkspaceServiceId = "gmail" | "drive" | "calendar";

export const googleWorkspaceScopes = {
  gmail: "https://www.googleapis.com/auth/gmail.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
  calendarList: "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  calendarEvents: "https://www.googleapis.com/auth/calendar.events.readonly",
} as const;

export const googleWorkspaceServiceIds: GoogleWorkspaceServiceId[] = ["gmail", "drive", "calendar"];

function scopeMatches(scope: string, expected: string): boolean {
  const normalized = scope.trim().toLowerCase();
  const expectedNormalized = expected.toLowerCase();
  const shortName = expectedNormalized.split("/auth/").at(-1) ?? expectedNormalized;
  return normalized === expectedNormalized || normalized === shortName || normalized.endsWith(`/auth/${shortName}`);
}

export function googleWorkspaceServiceEnabled(scopes: readonly string[], service: GoogleWorkspaceServiceId): boolean {
  const required = service === "calendar"
    ? [googleWorkspaceScopes.calendarList, googleWorkspaceScopes.calendarEvents]
    : [googleWorkspaceScopes[service]];
  return required.every((scope) => scopes.some((candidate) => scopeMatches(candidate, scope)));
}

export function googleWorkspaceServices(scopes: readonly string[]): GoogleWorkspaceServiceId[] {
  return googleWorkspaceServiceIds.filter((service) => googleWorkspaceServiceEnabled(scopes, service));
}

export function hasCurrentGoogleWorkspaceGrant(scopes: readonly string[]): boolean {
  return googleWorkspaceServiceIds.every((service) => googleWorkspaceServiceEnabled(scopes, service));
}
