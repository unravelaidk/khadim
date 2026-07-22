import type { GoogleConnection, GoogleConnectRequest } from "../../shared/types";
import type { CredentialVault, StoredGoogleConnection } from "../domain/configuration";
import type { DocumentRepository } from "../domain/repositories";

export interface GoogleOAuthGrant {
  email: string;
  subject: string;
  scopes: string[];
  refreshToken: string;
}

export interface GoogleOAuthAdapter {
  configured(clientId?: string, clientSecret?: string): boolean;
  authorize(clientId?: string, clientSecret?: string): Promise<GoogleOAuthGrant>;
  refresh(refreshToken: string, clientId?: string, clientSecret?: string): Promise<string>;
  cancel(): void;
}

interface StoredRefreshTokenEnvelope {
  kind: "khadim.google-refresh-token";
  version: 1;
  subject: string;
  token: string;
}

export function normalizeStoredGoogleConnection(value: unknown): StoredGoogleConnection {
  const source = value && typeof value === "object" ? value as Partial<StoredGoogleConnection> : {};
  return {
    ...(typeof source.clientId === "string" ? { clientId: source.clientId } : {}),
    ...(typeof source.encryptedClientSecret === "string" ? { encryptedClientSecret: source.encryptedClientSecret } : {}),
    ...(typeof source.email === "string" ? { email: source.email } : {}),
    ...(typeof source.subject === "string" ? { subject: source.subject } : {}),
    scopes: Array.isArray(source.scopes) ? source.scopes.filter((scope): scope is string => typeof scope === "string") : [],
    ...(typeof source.connectedAt === "string" ? { connectedAt: source.connectedAt } : {}),
    ...(typeof source.encryptedRefreshToken === "string" ? { encryptedRefreshToken: source.encryptedRefreshToken } : {}),
  };
}

export class GoogleConnectionService {
  #mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: DocumentRepository<StoredGoogleConnection>,
    private readonly credentials: CredentialVault,
    private readonly oauth: GoogleOAuthAdapter,
  ) {}

  async get(): Promise<GoogleConnection> {
    return this.toPublic(await this.repository.read());
  }

  connect(request: GoogleConnectRequest = {}): Promise<GoogleConnection> {
    return this.serialize(async () => {
      if (!request || typeof request !== "object") throw new Error("Invalid Google connection request.");
      const stored = await this.repository.read();
      const clientId = request.clientId?.trim() || stored.clientId;
      const suppliedClientSecret = request.clientSecret?.trim();
      const storedClientSecret = stored.encryptedClientSecret
        ? this.credentials.decrypt(stored.encryptedClientSecret)
        : undefined;
      const clientSecret = suppliedClientSecret || storedClientSecret;
      if (clientId && (clientId.length > 512 || !clientId.endsWith(".apps.googleusercontent.com"))) {
        throw new Error("Use a valid Google Desktop OAuth client ID ending in .apps.googleusercontent.com.");
      }
      if (suppliedClientSecret !== undefined && (!suppliedClientSecret || suppliedClientSecret.length > 4_096)) {
        throw new Error("Google OAuth client secret must be between 1 and 4096 characters.");
      }
      if (!this.oauth.configured(clientId, clientSecret)) throw new Error("Enter the client ID and client secret from a Google Desktop OAuth credential.");
      if (!this.credentials.available()) throw new Error("The operating system credential vault is unavailable.");
      const grant = await this.oauth.authorize(clientId, clientSecret);
      if (!grant.email || !grant.subject || !grant.refreshToken) throw new Error("Google did not return a reusable account grant.");
      const envelope: StoredRefreshTokenEnvelope = {
        kind: "khadim.google-refresh-token",
        version: 1,
        subject: grant.subject,
        token: grant.refreshToken,
      };
      const next: StoredGoogleConnection = {
        ...(clientId ? { clientId } : {}),
        ...(suppliedClientSecret
          ? { encryptedClientSecret: this.credentials.encrypt(suppliedClientSecret) }
          : stored.encryptedClientSecret
            ? { encryptedClientSecret: stored.encryptedClientSecret }
            : {}),
        email: grant.email,
        subject: grant.subject,
        scopes: [...new Set(grant.scopes)],
        connectedAt: new Date().toISOString(),
        encryptedRefreshToken: this.credentials.encrypt(JSON.stringify(envelope)),
      };
      await this.repository.write(next);
      return this.toPublic(next);
    });
  }

  disconnect(): Promise<GoogleConnection> {
    this.oauth.cancel();
    return this.serialize(async () => {
      const current = await this.repository.read();
      const next: StoredGoogleConnection = {
        ...(current.clientId ? { clientId: current.clientId } : {}),
        ...(current.encryptedClientSecret ? { encryptedClientSecret: current.encryptedClientSecret } : {}),
        scopes: [],
      };
      await this.repository.write(next);
      return this.toPublic(next);
    });
  }

  async accessToken(): Promise<string> {
    const stored = await this.repository.read();
    if (!stored.encryptedRefreshToken || !stored.subject) throw new Error("Connect Google Workspace in Apps before enabling connected applications.");
    const decrypted = this.credentials.decrypt(stored.encryptedRefreshToken);
    if (!decrypted) throw new Error("The saved Google credential is locked. Reconnect Google Workspace in Apps.");
    let envelope: StoredRefreshTokenEnvelope;
    try {
      envelope = JSON.parse(decrypted) as StoredRefreshTokenEnvelope;
    } catch {
      throw new Error("The saved Google credential is invalid. Reconnect Google Workspace in Apps.");
    }
    if (envelope.kind !== "khadim.google-refresh-token" || envelope.version !== 1 || envelope.subject !== stored.subject || !envelope.token) {
      throw new Error("The saved Google credential does not match this account. Reconnect Google Workspace in Apps.");
    }
    const clientSecret = stored.encryptedClientSecret
      ? this.credentials.decrypt(stored.encryptedClientSecret)
      : undefined;
    return this.oauth.refresh(envelope.token, stored.clientId, clientSecret);
  }

  cancel(): void {
    this.oauth.cancel();
  }

  flush(): Promise<void> {
    return this.repository.flush();
  }

  private toPublic(stored: StoredGoogleConnection): GoogleConnection {
    const clientSecret = stored.encryptedClientSecret
      ? this.credentials.decrypt(stored.encryptedClientSecret)
      : undefined;
    const configured = this.oauth.configured(stored.clientId, clientSecret);
    if (!stored.encryptedRefreshToken) return { configured, connected: false, credentialStatus: "missing", scopes: [] };
    const unlocked = Boolean(this.credentials.decrypt(stored.encryptedRefreshToken));
    return {
      configured,
      connected: unlocked,
      credentialStatus: unlocked ? "ready" : "locked",
      ...(stored.email ? { email: stored.email } : {}),
      scopes: stored.scopes,
    };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    let result: T;
    const mutation = this.#mutationQueue.then(async () => { result = await operation(); });
    this.#mutationQueue = mutation.catch(() => undefined);
    return mutation.then(() => result!);
  }
}
