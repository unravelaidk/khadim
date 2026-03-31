import { useState, useEffect, useCallback, useRef } from "react";
import { showSuccess, showError } from "../lib/toast";

type CodexAuthStatus = "idle" | "connecting" | "connected" | "failed";

interface CodexAuthState {
  status: CodexAuthStatus;
  isConnected: boolean;
  isConnecting: boolean;
  authUrl: string | null;
  sessionId: string | null;
}

interface UseCodexAuthResult extends CodexAuthState {
  startAuth: () => Promise<void>;
  submitManualCode: (code: string) => Promise<boolean>;
  reset: () => void;
}

interface CodexAuthStatusApiData {
  success?: boolean;
  error?: string;
  oauth?: {
    openaiCodexConnected?: boolean;
  };
  session?: {
    status: "pending" | "connected" | "failed";
    error: string | null;
    authUrl: string | null;
  };
}

async function fetchCodexAuthStatus(sessionId: string): Promise<CodexAuthStatusApiData> {
  const response = await fetch(`/api/models?action=codexAuthStatus&sessionId=${encodeURIComponent(sessionId)}`);
  return response.json() as Promise<CodexAuthStatusApiData>;
}

function getRedirectUrl(): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  return `${protocol}//${host}/api/models/codex/callback`;
}

async function startCodexAuth(redirectUrl: string): Promise<{ sessionId: string; authUrl: string }> {
  const body = new FormData();
  body.append("intent", "codexAuthStart");
  body.append("redirectUrl", redirectUrl);
  const response = await fetch("/api/models", { method: "POST", body });
  const payload = (await response.json()) as { session?: { sessionId: string; authUrl: string }; error?: string };
  if (!response.ok || !payload.session?.sessionId || !payload.session?.authUrl) {
    throw new Error(payload.error || "Failed to start Codex login");
  }
  return { sessionId: payload.session.sessionId, authUrl: payload.session.authUrl };
}

async function completeCodexAuth(sessionId: string, code: string): Promise<void> {
  const body = new FormData();
  body.append("intent", "codexAuthComplete");
  body.append("sessionId", sessionId);
  body.append("code", code);
  const response = await fetch("/api/models", { method: "POST", body });
  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Failed to submit authorization code");
  }
}

const INITIAL_STATE: CodexAuthState = {
  status: "idle",
  isConnected: false,
  isConnecting: false,
  authUrl: null,
  sessionId: null,
};

export function useCodexAuth(): UseCodexAuthResult {
  const [state, setState] = useState<CodexAuthState>(INITIAL_STATE);
  const intervalRef = useRef<number | null>(null);
  const onSuccessRef = useRef<(() => void) | null>(null);

  const clearPolling = useCallback(() => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  const pollAuthStatus = useCallback(async (sessionId: string) => {
    try {
      const payload = await fetchCodexAuthStatus(sessionId);
      if (payload.oauth?.openaiCodexConnected) {
        setState((prev) => ({
          ...prev,
          status: "connected",
          isConnected: true,
          isConnecting: false,
          authUrl: null,
          sessionId: null,
        }));
        clearPolling();
        showSuccess("Codex subscription connected");
        onSuccessRef.current?.();} else if (payload.session?.status === "connected") {
        setState((prev) => ({
          ...prev,
          status: "connected",
          isConnected: true,
          isConnecting: false,
          authUrl: null,
          sessionId: null,
        }));
        clearPolling();
        showSuccess("Codex subscription connected");
        onSuccessRef.current?.();} else if (payload.session?.status === "failed") {
        const errorMsg = payload.session.error || "Failed to connect Codex";
        showError(errorMsg);
        setState((prev) => ({
          ...prev,
          status: "failed",
          isConnecting: false,
          authUrl: null,
          sessionId: null,
        }));
        clearPolling();
      } else if (payload.session?.authUrl) {
        setState((prev) => ({ ...prev, authUrl: payload.session!.authUrl! }));
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to check Codex status");
      setState((prev) => ({
        ...prev,
        status: "failed",
        isConnecting: false,
        sessionId: null,
      }));
      clearPolling();
    }
  }, [clearPolling]);

  useEffect(() => {
    if (state.sessionId) {
      intervalRef.current = window.setInterval(() => {
        void pollAuthStatus(state.sessionId!);
      }, 1500);
    }
    return () => {
      clearPolling();
    };
  }, [state.sessionId, pollAuthStatus, clearPolling]);

  const startAuth = useCallback(async () => {
    setState((prev) => ({ ...prev, status: "connecting", isConnecting: true }));
    try {
      const redirectUrl = getRedirectUrl();
      const { sessionId, authUrl } = await startCodexAuth(redirectUrl);
      setState((prev) => ({
        ...prev,
        sessionId,
        authUrl,
      }));
      window.open(authUrl, "_blank", "noopener,noreferrer");
      showSuccess("Opened Codex login in a new tab");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to start Codex login");
      setState((prev) => ({ ...prev, status: "failed", isConnecting: false }));
    }
  }, []);

  const submitManualCode = useCallback(async (code: string): Promise<boolean> => {
    if (!state.sessionId || !code.trim()) return false;
    try {
      await completeCodexAuth(state.sessionId, code.trim());
      showSuccess("Authorization code submitted");
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to submit authorization code");
      return false;
    }
  }, [state.sessionId]);

  const reset = useCallback(() => {
    clearPolling();
    setState(INITIAL_STATE);
  }, [clearPolling]);

  return {
    ...state,
    startAuth,
    submitManualCode,
    reset,
  };
}

export function checkInitialCodexConnection(): Promise<boolean> {
  return fetchApi("/api/models?action=providers").then((data) => Boolean(data.oauth?.openaiCodexConnected));
}

async function fetchApi(url: string): Promise<{ oauth?: { openaiCodexConnected?: boolean } }> {
  const response = await fetch(url);
  return response.json();
}