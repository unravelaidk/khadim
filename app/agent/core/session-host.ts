import type { Model } from "@mariozechner/pi-ai";
import { and, eq } from "drizzle-orm";
import { createOrchestrator } from "../orchestrator";
import { ensureSandbox } from "../sandbox";
import { createModelInstance, getActiveModel } from "../model-manager";
import { createAgentRuntimeTools, buildAgentRuntimePrompt, selectRequestTools } from "./agent-runtime";
import type { AgentConfig, AgentId } from "../modes";
import { artifacts, chats, db, workspaceFiles } from "../../lib/db";
import type { Message } from "@mariozechner/pi-ai";
import type { SessionState } from "./session-state";

type SandboxType = Awaited<ReturnType<typeof ensureSandbox>>["sandbox"];

export interface SessionHostCallbacks {
  addSandboxStep: () => Promise<void>;
  completeSandboxStep: (result: string, sandboxId: string) => Promise<void>;
  failSandboxStep: (message: string) => Promise<void>;
  broadcastToolEvent: (event: { type: string; data: any }) => Promise<void>;
}

export interface CreateSessionHostParams {
  chatId: string;
  prompt: string;
  history: Message[];
  agentMode: AgentId;
  agentConfig: AgentConfig;
  skillsContent: string;
  uploadedDocumentsContext?: string;
  existingSandboxId?: string;
  apiKey?: string;
  slideRequest: boolean;
  callbacks: SessionHostCallbacks;
}

export interface SessionHost {
  streamEvents: (signal?: AbortSignal) => AsyncIterable<any>;
  getSandboxId: () => string | null;
  getPreviewUrl: () => string | null;
  getState: () => SessionState;
  enqueueUserPrompt: (content: string) => void;
  prompt: (content: string, hooks?: SessionHostRunHooks) => Promise<void>;
  followUp: (content: string, hooks?: SessionHostRunHooks) => Promise<void>;
  steer: (content: string, hooks?: SessionHostRunHooks) => Promise<void>;
  dispose: () => Promise<void>;
}

export interface SessionHostRunHooks {
  onEvent?: (event: any) => void | Promise<void>;
}

type PendingInputKind = "prompt" | "follow_up" | "steer";

type PendingInput = {
  kind: PendingInputKind;
  content: string;
  timestamp: number;
  hooks?: SessionHostRunHooks;
  resolve: () => void;
  reject: (error: unknown) => void;
};

function formatSandboxInitError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/authentication/i.test(message)) return "Sandbox authentication failed";
  if (/timeout/i.test(message)) return "Sandbox initialization timed out";
  return `Sandbox error: ${message}`;
}

export async function createSessionHost(params: CreateSessionHostParams): Promise<SessionHost> {
  const {
    chatId,
    prompt,
    history,
    agentMode,
    agentConfig,
    skillsContent,
    uploadedDocumentsContext,
    existingSandboxId,
    apiKey,
    slideRequest,
    callbacks,
  } = params;

  let sandbox: SandboxType | null = null;
  let sandboxId: string | null = null;
  let previewUrl: string | null = null;
  let sandboxInitPromise: Promise<void> | null = null;
  const pendingInputs: PendingInput[] = [];
  const state: SessionState = {
    messages: [
      ...history,
      { role: "user", content: prompt, timestamp: Date.now() },
    ],
    currentAgent: agentMode,
    requestedMode: agentMode,
  };
  let activeRun: Promise<void> | null = null;
  let activeRunAbort: AbortController | null = null;
  let disposed = false;

  function createMessageForInput(input: PendingInput): Message {
    const prefix = input.kind === "steer"
      ? "[Steer]"
      : input.kind === "follow_up"
        ? "[Follow-up]"
        : undefined;

    return {
      role: "user",
      content: prefix ? `${prefix}\n${input.content}` : input.content,
      timestamp: input.timestamp,
    };
  }

  async function runQueuedInput(input: PendingInput, signal?: AbortSignal): Promise<void> {
    if (disposed) {
      throw new Error("Session host has been disposed");
    }
    state.messages.push(createMessageForInput(input));

    const eventStream = orchestrator.streamEvents(state, { signal });
    for await (const event of eventStream) {
      await input.hooks?.onEvent?.(event);
      if (event.event === "on_chain_end") {
        const nextMessages = (event.data as { output?: { messages?: Message[] } } | undefined)?.output?.messages;
        if (Array.isArray(nextMessages)) {
          state.messages = nextMessages as Message[];
        }
      }
    }
  }

  async function drainPendingInputs(): Promise<void> {
    while (pendingInputs.length > 0) {
      const input = pendingInputs.shift()!;
      const abort = new AbortController();
      activeRunAbort = abort;
      try {
        await runQueuedInput(input, abort.signal);
        input.resolve();
      } catch (error) {
        if (abort.signal.aborted) {
          // Run was interrupted (e.g. by steer) — resolve silently
          input.resolve();
        } else {
          input.reject(error);
        }
      } finally {
        if (activeRunAbort === abort) {
          activeRunAbort = null;
        }
      }
    }
  }

  async function scheduleRun(kind: PendingInputKind, content: string, hooks?: SessionHostRunHooks): Promise<void> {
    if (disposed) {
      throw new Error("Session host has been disposed");
    }
    const completion = new Promise<void>((resolve, reject) => {
      pendingInputs.push({
        kind,
        content,
        timestamp: Date.now(),
        hooks,
        resolve,
        reject,
      });
    });

    if (activeRun) {
      return completion;
    }

    activeRun = (async () => {
      await drainPendingInputs();
    })().finally(() => {
      activeRun = null;
    });

    return completion;
  }

  function startPendingDrain(): void {
    if (activeRun || pendingInputs.length === 0) {
      return;
    }

    activeRun = (async () => {
      await drainPendingInputs();
    })().finally(() => {
      activeRun = null;
      if (pendingInputs.length > 0) {
        startPendingDrain();
      }
    });
  }

  const ensureSandboxInitialized = async (): Promise<SandboxType> => {
    if (sandbox) return sandbox;

    if (sandboxInitPromise) {
      await sandboxInitPromise;
      return sandbox!;
    }

    sandboxInitPromise = (async () => {
      await callbacks.addSandboxStep();

      try {
        const sandboxResult = await ensureSandbox(existingSandboxId);
        sandbox = sandboxResult.sandbox;
        sandboxId = sandboxResult.sandboxId;

        if (!sandboxResult.reconnected) {
          const [chat] = await db.select().from(chats).where(eq(chats.id, chatId)).limit(1);
          const sharedFiles = chat?.workspaceId
            ? await db.select().from(workspaceFiles).where(eq(workspaceFiles.workspaceId, chat.workspaceId))
            : [];
          const chatArtifacts = await db.select().from(artifacts).where(eq(artifacts.chatId, chatId));

          const filesToRestore = new Map<string, string>();
          for (const file of sharedFiles) {
            filesToRestore.set(file.path, file.content);
          }
          for (const artifact of chatArtifacts) {
            filesToRestore.set(artifact.filename, artifact.content);
          }

          for (const [path, content] of filesToRestore) {
            const dir = path.split("/").slice(0, -1).join("/");
            if (dir) {
              await sandbox.exec(`mkdir -p ${dir}`);
            }
            await sandbox.writeFile(path, content);
          }
        }

        const result = sandboxResult.reconnected
          ? "Reconnected to existing session"
          : existingSandboxId
            ? "Created new session"
            : "Ready";

        await callbacks.completeSandboxStep(result, sandboxId);
      } catch (error) {
        const message = formatSandboxInitError(error);
        sandbox = null;
        sandboxId = null;
        sandboxInitPromise = null;
        await callbacks.failSandboxStep(message);
        throw new Error(message);
      }
    })();

    await sandboxInitPromise;
    return sandbox!;
  };

  const getSandboxTool = <T extends { execute: (...args: any[]) => Promise<any> }>(
    createFn: (sandbox: SandboxType, ...args: any[]) => T,
    ...args: any[]
  ): T => {
    const originalTool = createFn(null as any, ...args);
    const tool = originalTool as any;
    tool.execute = async (...invokeArgs: any[]) => {
      await ensureSandboxInitialized();
      const realTool = createFn(sandbox!, ...args) as any;
      return realTool.execute(...invokeArgs);
    };
    return tool;
  };

  const allTools = createAgentRuntimeTools({
    chatId,
    sandbox,
    getSandboxTool,
    setPreviewUrl: (url) => {
      previewUrl = url;
    },
    broadcastForTools: callbacks.broadcastToolEvent,
  });

  const modelConfig = await getActiveModel();
  let resolvedModel: { model: Model<any>; apiKey: string; temperature: number };
  if (modelConfig) {
    resolvedModel = await createModelInstance(modelConfig, apiKey);
  } else {
    throw new Error("No active model configured. Add or activate a model in Settings.");
  }

  const requestTools = selectRequestTools(allTools, agentMode, slideRequest);
  const orchestrator = createOrchestrator({
    model: resolvedModel.model,
    tools: requestTools,
    apiKey: resolvedModel.apiKey,
    temperature: resolvedModel.temperature,
    systemPrompt: buildAgentRuntimePrompt({
      agentConfig,
      requestTools,
      skillsContent,
      uploadedDocumentsContext,
    }),
  });

  return {
    async *streamEvents(signal?: AbortSignal) {
      if (disposed) {
        throw new Error("Session host has been disposed");
      }
      let resolveActiveRun!: () => void;
      let rejectActiveRun!: (error: unknown) => void;
      activeRun = new Promise<void>((resolve, reject) => {
        resolveActiveRun = resolve;
        rejectActiveRun = reject;
      }).finally(() => {
        activeRun = null;
        startPendingDrain();
      });

      const eventStream = orchestrator.streamEvents(state, { signal });
      try {
        for await (const event of eventStream) {
          if (event.event === "on_chain_end") {
            const nextMessages = (event.data as { output?: { messages?: Message[] } } | undefined)?.output?.messages;
            if (Array.isArray(nextMessages)) {
              state.messages = nextMessages as Message[];
            }
          }
          yield event;
        }
        resolveActiveRun();
      } catch (error) {
        rejectActiveRun(error);
        throw error;
      } finally {
        resolveActiveRun();
      }
    },
    getSandboxId() {
      return sandboxId;
    },
    getPreviewUrl() {
      return previewUrl;
    },
    getState() {
      return {
        messages: [...state.messages],
        currentAgent: state.currentAgent,
        requestedMode: state.requestedMode,
      };
    },
    enqueueUserPrompt(content: string) {
      pendingInputs.push({
        kind: "prompt",
        content,
        timestamp: Date.now(),
        resolve: () => {},
        reject: () => {},
      });
    },
    prompt(content: string, hooks?: SessionHostRunHooks) {
      return scheduleRun("prompt", content, hooks);
    },
    followUp(content: string, hooks?: SessionHostRunHooks) {
      return scheduleRun("follow_up", content, hooks);
    },
    steer(content: string, hooks?: SessionHostRunHooks) {
      // Abort the currently active run so steer executes immediately
      if (activeRunAbort) {
        activeRunAbort.abort();
      }
      return scheduleRun("steer", content, hooks);
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      while (pendingInputs.length > 0) {
        pendingInputs.shift()?.reject(new Error("Session host disposed"));
      }
    },
  };
}
