import { hc } from "hono/client";
import type { AgentRpcAppType } from "./agent-rpc-hono";
import type { AgentRpcMethod } from "./agent-rpc";
import type { SessionStreamSnapshot, AgentJob, JobEvent } from "../types/agent";

type RpcClient = ReturnType<typeof hc<AgentRpcAppType>>;

type AgentRpcParamsMap = {
  "job.start": {
    prompt: string;
    sandboxId?: string;
    chatId?: string;
    sessionId: string;
    badges?: string;
    documentIds?: string[];
    agentMode?: "plan" | "build";
  };
  "job.stop": {
    jobId: string;
    chatId?: string | null;
    sessionId?: string;
  };
  "job.followUp": {
    jobId?: string;
    chatId?: string | null;
    sessionId?: string;
    prompt: string;
  };
  "job.steer": {
    jobId?: string;
    chatId?: string | null;
    sessionId?: string;
    prompt: string;
  };
  "job.get": {
    jobId: string;
    chatId?: string | null;
    sessionId?: string;
  };
  "chat.getActiveJobs": {
    chatId?: string;
    sessionId?: string;
  };
  "session.getSnapshot": {
    sessionId: string;
  };
  "session.replayEvents": {
    sessionId: string;
    lastEventId?: string | null;
  };
};

type RpcKnownMethod = keyof AgentRpcParamsMap & keyof AgentRpcResultMap & AgentRpcMethod;

type AgentRpcResultMap = {
  "job.start": {
    jobId: string;
    chatId: string;
    sessionId: string;
    agentMode: "plan" | "build";
    agentName: string;
  };
  "job.stop": { ok: true };
  "job.followUp": { ok: true; jobId: string; sessionId: string; chatId: string };
  "job.steer": { ok: true; jobId: string; sessionId: string; chatId: string };
  "job.get": { job: AgentJob };
  "chat.getActiveJobs": { jobs: AgentJob[] };
  "session.getSnapshot": { snapshot: SessionStreamSnapshot };
  "session.replayEvents": { events: JobEvent[] };
};

const client = hc<AgentRpcAppType>("/api/rpc");

async function unwrapResponse<T>(response: Response): Promise<T> {
  const result = (await response.json()) as { ok?: boolean; error?: string; result?: T };

  if (!response.ok || !result.ok) {
    throw new Error(result.error || "RPC request failed");
  }

  return result.result as T;
}

export async function callAgentRpc<TMethod extends RpcKnownMethod>(
  method: TMethod,
  params: AgentRpcParamsMap[TMethod],
  options: { signal?: AbortSignal } = {},
): Promise<AgentRpcResultMap[TMethod]> {
  switch (method) {
    case "job.start": {
      const response = await client.job.start.$post(
        { json: params as AgentRpcParamsMap["job.start"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "job.stop": {
      const response = await client.job.stop.$post(
        { json: params as AgentRpcParamsMap["job.stop"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "job.followUp": {
      const response = await client.job["follow-up"].$post(
        { json: params as AgentRpcParamsMap["job.followUp"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "job.steer": {
      const response = await client.job.steer.$post(
        { json: params as AgentRpcParamsMap["job.steer"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "job.get": {
      const { jobId, ...query } = params as AgentRpcParamsMap["job.get"];
      const url = client.job[":jobId"].$url({
        param: { jobId },
        query: query as AgentRpcParamsMap["job.get"] extends { jobId: string } ? Omit<AgentRpcParamsMap["job.get"], "jobId"> : never,
      });
      const response = await fetch(url, { signal: options.signal });
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "chat.getActiveJobs": {
      const response = await client.chat["active-jobs"].$get(
        { query: params as AgentRpcParamsMap["chat.getActiveJobs"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "session.getSnapshot": {
      const response = await client.session.snapshot.$get(
        { query: params as AgentRpcParamsMap["session.getSnapshot"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }

    case "session.replayEvents": {
      const response = await client.session["replay-events"].$get(
        { query: params as AgentRpcParamsMap["session.replayEvents"] },
        { init: { signal: options.signal } },
      );
      return unwrapResponse<AgentRpcResultMap[TMethod]>(response);
    }
  }

  throw new Error(`Unsupported RPC method: ${method}`);
}
