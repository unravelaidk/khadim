import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId } from "@paralleldrive/cuid2";
import { getOAuthApiKey } from "@mariozechner/pi-ai/oauth";
import { loginOpenAICodex } from "@mariozechner/pi-ai/oauth";
import type { OAuthCredentials } from "@mariozechner/pi-ai/oauth";

const AUTH_FILE = path.join(process.cwd(), "auth.json");
const loginSessions = new Map<string, CodexLoginSession>();

type CodexLoginStatus = "pending" | "connected" | "failed";

interface CodexLoginSession {
  id: string;
  status: CodexLoginStatus;
  authUrl: string | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  manualCodeResolver: ((code: string) => void) | null;
}

async function readAuthFile(): Promise<Record<string, OAuthCredentials>> {
  try {
    const content = await readFile(AUTH_FILE, "utf-8");
    const parsed = JSON.parse(content) as Record<string, OAuthCredentials>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeAuthFile(auth: Record<string, OAuthCredentials>) {
  await writeFile(AUTH_FILE, `${JSON.stringify(auth, null, 2)}\n`, "utf-8");
}

function touchSession(session: CodexLoginSession) {
  session.updatedAt = Date.now();
}

function cleanupOldSessions() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [sessionId, session] of loginSessions.entries()) {
    if (session.updatedAt < cutoff) {
      loginSessions.delete(sessionId);
    }
  }
}

export async function hasOpenAICodexAuth(): Promise<boolean> {
  if (process.env.OPENAI_CODEX_API_KEY) {
    return true;
  }

  const auth = await readAuthFile();
  return Boolean(auth["openai-codex"]);
}

export async function getOpenAICodexApiKey(passedApiKey?: string): Promise<string> {
  if (passedApiKey) return passedApiKey;

  if (process.env.OPENAI_CODEX_API_KEY) {
    return process.env.OPENAI_CODEX_API_KEY;
  }

  const auth = await readAuthFile();
  const result = await getOAuthApiKey("openai-codex", auth);

  if (!result) {
    return "";
  }

  auth["openai-codex"] = result.newCredentials;
  await writeAuthFile(auth);

  return result.apiKey;
}

export async function startOpenAICodexLogin(): Promise<{ sessionId: string; authUrl: string }> {
  cleanupOldSessions();

  const sessionId = createId();
  let resolveManualCode: ((code: string) => void) | null = null;

  const manualCodePromise = new Promise<string>((resolve) => {
    resolveManualCode = resolve;
  });

  const session: CodexLoginSession = {
    id: sessionId,
    status: "pending",
    authUrl: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    manualCodeResolver: resolveManualCode,
  };

  loginSessions.set(sessionId, session);

  const authUrlPromise = new Promise<string>((resolve, reject) => {
    void loginOpenAICodex({
      originator: "khadim",
      onAuth: ({ url }) => {
        session.authUrl = url;
        touchSession(session);
        resolve(url);
      },
      onPrompt: async () => manualCodePromise,
      onManualCodeInput: async () => manualCodePromise,
      onProgress: () => {
        touchSession(session);
      },
    })
      .then(async (credentials) => {
        const auth = await readAuthFile();
        auth["openai-codex"] = credentials;
        await writeAuthFile(auth);
        session.status = "connected";
        session.error = null;
        session.manualCodeResolver = null;
        touchSession(session);
      })
      .catch((error) => {
        session.status = "failed";
        session.error = error instanceof Error ? error.message : "Failed to connect Codex";
        session.manualCodeResolver = null;
        touchSession(session);
        reject(error);
      });
  });

  return {
    sessionId,
    authUrl: await authUrlPromise,
  };
}

export function submitOpenAICodexManualCode(sessionId: string, code: string): void {
  const session = loginSessions.get(sessionId);

  if (!session) {
    throw new Error("Codex login session not found or expired.");
  }

  if (session.status !== "pending" || !session.manualCodeResolver) {
    throw new Error("Codex login session is no longer waiting for a code.");
  }

  session.manualCodeResolver(code);
  session.manualCodeResolver = null;
  touchSession(session);
}

export function getOpenAICodexLoginStatus(sessionId: string): { status: CodexLoginStatus; error: string | null; authUrl: string | null } {
  cleanupOldSessions();

  const session = loginSessions.get(sessionId);
  if (!session) {
    throw new Error("Codex login session not found or expired.");
  }

  touchSession(session);

  return {
    status: session.status,
    error: session.error,
    authUrl: session.authUrl,
  };
}
