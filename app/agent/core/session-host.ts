import type { Model } from "@mariozechner/pi-ai";
import { and, eq } from "drizzle-orm";
import { createOrchestrator } from "../orchestrator";
import { ensureSandbox } from "../sandbox";
import { createModelInstance, getActiveModel } from "../model-manager";
import { createAgentRuntimeTools, buildAgentRuntimePrompt, selectRequestTools } from "./agent-runtime";
import type { AgentConfig, AgentId } from "../modes";
import { artifacts, chats, db, workspaceFiles } from "../../lib/db";
import type { Message } from "@mariozechner/pi-ai";

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
}

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

  const inputs = {
    messages: [
      ...history,
      { role: "user" as const, content: prompt, timestamp: Date.now() },
    ],
    currentAgent: agentMode,
    requestedMode: agentMode,
  };

  return {
    streamEvents(signal?: AbortSignal) {
      return orchestrator.streamEvents(inputs, { signal });
    },
    getSandboxId() {
      return sandboxId;
    },
    getPreviewUrl() {
      return previewUrl;
    },
  };
}
