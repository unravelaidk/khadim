/** Linux's `basic_text` Electron backend is not secure OS credential storage. */
export function canPersistCredentialsSecurely(
  platform: NodeJS.Platform,
  encryptionAvailable: boolean,
  selectedBackend?: string,
): boolean {
  if (!encryptionAvailable) return false;
  return platform !== "linux" || selectedBackend !== "basic_text";
}

export interface CredentialScope {
  provider: string;
  model: string;
  baseUrl?: string;
}

interface ModelCredentialEnvelope {
  kind: "khadim.model-credential";
  version: 1;
  provider: string;
  model: string;
  baseUrl: string;
  secret: string;
}

/** Credentials stay attached only while provider, model, and endpoint remain identical. */
export function hasSameCredentialScope(left: CredentialScope, right: CredentialScope): boolean {
  return left.provider === right.provider
    && left.model === right.model
    && (left.baseUrl ?? "") === (right.baseUrl ?? "");
}

/** Bind encrypted model credentials to the exact destination that may receive them. */
export function encodeModelCredential(scope: CredentialScope, secret: string): string {
  const envelope: ModelCredentialEnvelope = {
    kind: "khadim.model-credential",
    version: 1,
    provider: scope.provider,
    model: scope.model,
    baseUrl: scope.baseUrl ?? "",
    secret,
  };
  return JSON.stringify(envelope);
}

/** Legacy plaintext payloads remain readable once so the next settings save can migrate them. */
export function decodeModelCredential(scope: CredentialScope, payload: string): { secret: string; legacy: boolean } | undefined {
  let candidate: unknown;
  try {
    candidate = JSON.parse(payload) as unknown;
  } catch {
    return payload ? { secret: payload, legacy: true } : undefined;
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return payload ? { secret: payload, legacy: true } : undefined;
  }
  const envelope = candidate as Partial<ModelCredentialEnvelope>;
  if (envelope.kind !== "khadim.model-credential") {
    return payload ? { secret: payload, legacy: true } : undefined;
  }
  if (envelope.version !== 1
    || typeof envelope.secret !== "string"
    || !envelope.secret
    || envelope.provider !== scope.provider
    || envelope.model !== scope.model
    || envelope.baseUrl !== (scope.baseUrl ?? "")) return undefined;
  return { secret: envelope.secret, legacy: false };
}
