import { describe, expect, it, vi } from "vitest";
import { GoogleOAuthClient } from "../../../src/main/infrastructure/google-oauth-client";

describe("Google desktop OAuth", () => {
  it("uses PKCE, a loopback callback, and returns a reusable account grant", async () => {
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("code_verifier")).toBeTruthy();
        expect(body.get("client_secret")).toBe("desktop-client-secret");
        return new Response(JSON.stringify({ access_token: "access-token", refresh_token: "refresh-token", scope: "openid email gmail.readonly" }), { status: 200 });
      }
      if (url === "https://openidconnect.googleapis.com/v1/userinfo") {
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer access-token");
        return new Response(JSON.stringify({ sub: "google-user-1", email: "owner@example.com" }), { status: 200 });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    const openExternal = vi.fn(async (value: string) => {
      const authorization = new URL(value);
      expect(authorization.hostname).toBe("accounts.google.com");
      expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
      expect(authorization.searchParams.get("redirect_uri")).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/google\/callback$/);
      const callback = new URL(authorization.searchParams.get("redirect_uri")!);
      callback.searchParams.set("code", "authorization-code");
      callback.searchParams.set("state", authorization.searchParams.get("state")!);
      await fetch(callback);
    });
    const client = new GoogleOAuthClient("desktop-client-id", openExternal, fetcher as typeof fetch, "desktop-client-secret");

    await expect(client.authorize()).resolves.toEqual({
      email: "owner@example.com",
      subject: "google-user-1",
      scopes: ["openid", "email", "gmail.readonly"],
      refreshToken: "refresh-token",
    });
    expect(openExternal).toHaveBeenCalledOnce();
    const requestedScopes = new URL(vi.mocked(openExternal).mock.calls[0][0]).searchParams.get("scope") ?? "";
    expect(requestedScopes).toContain("gmail.readonly");
    expect(requestedScopes).toContain("drive.readonly");
    expect(requestedScopes).toContain("calendar.calendarlist.readonly");
    expect(requestedScopes).toContain("calendar.events.readonly");
  });

  it("cancels an outstanding browser flow", async () => {
    let opened!: () => void;
    const browserOpened = new Promise<void>((resolve) => { opened = resolve; });
    const client = new GoogleOAuthClient("desktop-client-id", async () => { opened(); }, fetch, "desktop-client-secret");
    const authorization = client.authorize();
    await browserOpened;

    client.cancel();

    await expect(authorization).rejects.toThrow("cancelled");
  });
});
