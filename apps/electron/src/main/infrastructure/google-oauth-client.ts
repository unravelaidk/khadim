import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { GoogleOAuthAdapter, GoogleOAuthGrant } from "../application/google-connection-service";

const scopes = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
] as const;

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  error?: string;
}

interface UserInfoResponse {
  sub?: string;
  email?: string;
}

function base64Url(value: Buffer): string {
  return value.toString("base64url");
}

async function jsonResponse<T>(response: Response, operation: string): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string; error_description?: string };
  if (!response.ok) {
    const description = body.error_description?.replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(`${operation} failed${body.error ? `: ${body.error}` : ""}${description ? ` (${description})` : ""}.`);
  }
  return body as T;
}

export class GoogleOAuthClient implements GoogleOAuthAdapter {
  #cancelPending: (() => void) | null = null;

  constructor(
    private readonly clientId: string,
    private readonly openExternal: (url: string) => Promise<void>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly clientSecret = "",
  ) {}

  configured(clientId?: string, clientSecret?: string): boolean {
    return Boolean((clientId || this.clientId).trim() && (clientSecret || this.clientSecret).trim());
  }

  async authorize(clientId?: string, clientSecret?: string): Promise<GoogleOAuthGrant> {
    const activeClientId = clientId || this.clientId;
    const activeClientSecret = clientSecret || this.clientSecret;
    if (!this.configured(activeClientId, activeClientSecret)) throw new Error("Google OAuth is not configured.");
    this.cancel();
    const state = base64Url(randomBytes(24));
    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const { code, redirectUri } = await this.waitForCode(state, async (uri) => {
      const authorization = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorization.search = new URLSearchParams({
        client_id: activeClientId,
        redirect_uri: uri,
        response_type: "code",
        scope: scopes.join(" "),
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
        access_type: "offline",
        prompt: "consent",
      }).toString();
      await this.openExternal(authorization.toString());
    });
    const token = await this.tokenRequest({
      client_id: activeClientId,
      client_secret: activeClientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    if (!token.access_token || !token.refresh_token) throw new Error("Google did not return offline access. Revoke the previous grant and reconnect.");
    const identityResponse = await this.fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const identity = await jsonResponse<UserInfoResponse>(identityResponse, "Google account lookup");
    if (!identity.email || !identity.sub) throw new Error("Google did not return an account identity.");
    return {
      email: identity.email,
      subject: identity.sub,
      scopes: token.scope?.split(" ").filter(Boolean) ?? [...scopes],
      refreshToken: token.refresh_token,
    };
  }

  async refresh(refreshToken: string, clientId?: string, clientSecret?: string): Promise<string> {
    const activeClientId = clientId || this.clientId;
    const activeClientSecret = clientSecret || this.clientSecret;
    const token = await this.tokenRequest({
      client_id: activeClientId,
      client_secret: activeClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    if (!token.access_token) throw new Error("Google access expired. Reconnect Gmail in Apps.");
    return token.access_token;
  }

  cancel(): void {
    this.#cancelPending?.();
    this.#cancelPending = null;
  }

  private async tokenRequest(values: Record<string, string>): Promise<TokenResponse> {
    const response = await this.fetcher("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
      signal: AbortSignal.timeout(15_000),
    });
    return jsonResponse<TokenResponse>(response, "Google authorization");
  }

  private waitForCode(
    expectedState: string,
    onListening: (redirectUri: string) => Promise<void>,
  ): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      let redirectUri = "";
      let settled = false;
      let timeout: NodeJS.Timeout;
      const server: Server = createServer((request, response) => {
        const url = new URL(request.url ?? "/", redirectUri || "http://127.0.0.1");
        if (url.pathname !== "/oauth/google/callback") {
          response.writeHead(404).end("not found");
          return;
        }
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        response.writeHead(code && state === expectedState ? 200 : 400, { "content-type": "text/html; charset=utf-8" });
        response.end("<!doctype html><title>Khadim</title><p>You can close this window and return to Khadim.</p>");
        if (error) finish(new Error(`Google authorization was not completed: ${error}.`));
        else if (!code || state !== expectedState) finish(new Error("Google authorization response was invalid."));
        else finish(null, { code, redirectUri });
      });
      const finish = (error: Error | null, value?: { code: string; redirectUri: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.#cancelPending = null;
        server.close();
        if (error) reject(error);
        else resolve(value!);
      };
      this.#cancelPending = () => finish(new Error("Google authorization was cancelled."));
      server.once("error", (error) => finish(error));
      server.listen(0, "127.0.0.1", async () => {
        const address = server.address() as AddressInfo | null;
        if (!address) {
          finish(new Error("Google authorization callback could not start."));
          return;
        }
        redirectUri = `http://127.0.0.1:${address.port}/oauth/google/callback`;
        try {
          await onListening(redirectUri);
        } catch (cause) {
          finish(cause instanceof Error ? cause : new Error("The system browser could not open."));
        }
      });
      timeout = setTimeout(() => finish(new Error("Google authorization timed out.")), 180_000);
    });
  }
}
