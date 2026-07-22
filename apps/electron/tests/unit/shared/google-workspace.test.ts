import { describe, expect, it } from "vitest";
import {
  googleWorkspaceScopes,
  googleWorkspaceServiceEnabled,
  googleWorkspaceServices,
  hasCurrentGoogleWorkspaceGrant,
} from "../../../src/shared/google-workspace";

describe("Google Workspace grants", () => {
  it("requires both Calendar scopes while keeping services independently detectable", () => {
    const scopes = [
      googleWorkspaceScopes.gmail,
      googleWorkspaceScopes.drive,
      googleWorkspaceScopes.calendarEvents,
    ];

    expect(googleWorkspaceServices(scopes)).toEqual(["gmail", "drive"]);
    expect(googleWorkspaceServiceEnabled(scopes, "calendar")).toBe(false);
    expect(hasCurrentGoogleWorkspaceGrant(scopes)).toBe(false);
  });

  it("accepts the short scope names returned by some OAuth token responses", () => {
    const scopes = [
      "gmail.readonly",
      "drive.readonly",
      "calendar.calendarlist.readonly",
      "calendar.events.readonly",
    ];

    expect(googleWorkspaceServices(scopes)).toEqual(["gmail", "drive", "calendar"]);
    expect(hasCurrentGoogleWorkspaceGrant(scopes)).toBe(true);
  });
});
