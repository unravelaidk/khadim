import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import {
  getAllModels,
  createModel,
  updateModel,
  deleteModel,
  setDefaultModel,
  setActiveModel,
  initializeDefaultModels,
} from "../agent/model-manager";
import { SUPPORTED_PROVIDERS, RECOMMENDED_MODELS } from "../agent/models";
import { discoverProviderModels, hasProviderApiKey } from "../agent/provider-models";
import {
  getOpenAICodexLoginStatus,
  hasOpenAICodexAuth,
  startOpenAICodexLogin,
  submitOpenAICodexManualCode,
} from "../agent/oauth";

const modelSchema = z.object({
  name: z.string().min(1),
  provider: z.enum([
    "openai", "anthropic", "openai-codex", "openrouter", "ollama",
    "xai", "groq", "cerebras", "mistral", "minimax", "zai",
    "amazon-bedrock", "azure-openai-responses", "github-copilot",
    "huggingface", "vercel-ai-gateway", "opencode", "opencode-go", "kimi-coding",
  ]),
  model: z.string().min(1),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  temperature: z.string().optional().default("0.2"),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action === "init") {
    await initializeDefaultModels();
    return Response.json({ success: true });
  }

  if (action === "providers") {
    const providers = await Promise.all(
      SUPPORTED_PROVIDERS.map(async (provider) => ({
        ...provider,
        hasApiKey: await hasProviderApiKey(provider.type),
      }))
    );

    return Response.json({
      providers,
      recommended: RECOMMENDED_MODELS,
      oauth: {
        openaiCodexConnected: await hasOpenAICodexAuth(),
      },
    });
  }

  if (action === "codexAuthStatus") {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      return Response.json({ error: "Session ID is required" }, { status: 400 });
    }

    const session = getOpenAICodexLoginStatus(sessionId);
    return Response.json({
      success: true,
      session,
      oauth: {
        openaiCodexConnected: await hasOpenAICodexAuth(),
      },
    });
  }

  await initializeDefaultModels();
  const models = await getAllModels();
  const enrichedModels = await Promise.all(
    models.map(async (model) => ({
      ...model,
      hasApiKey: await hasProviderApiKey(model.provider as Parameters<typeof hasProviderApiKey>[0], model.apiKey ?? undefined),
    }))
  );
  return Response.json({ models: enrichedModels });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    switch (intent) {
      case "create": {
        const data = modelSchema.parse({
          name: formData.get("name"),
          provider: formData.get("provider"),
          model: formData.get("model"),
          apiKey: formData.get("apiKey") || undefined,
          baseUrl: formData.get("baseUrl") || undefined,
          temperature: formData.get("temperature") || "0.2",
          isDefault: formData.get("isDefault") === "true",
          isActive: formData.get("isActive") !== "false",
        });

        const created = await createModel(data);
        
        if (data.isDefault) {
          await setDefaultModel(created.id);
        }
        if (data.isActive) {
          await setActiveModel(created.id);
        }

        return Response.json({ success: true, model: created });
      }

      case "update": {
        const id = formData.get("id");
        if (!id || typeof id !== "string") {
          return Response.json({ error: "Model ID required" }, { status: 400 });
        }

        const data = modelSchema.partial().parse({
          name: formData.get("name"),
          provider: formData.get("provider"),
          model: formData.get("model"),
          apiKey: formData.get("apiKey") || undefined,
          baseUrl: formData.get("baseUrl") || undefined,
          temperature: formData.get("temperature"),
          isDefault: formData.get("isDefault") === "true",
          isActive: formData.get("isActive") === "true",
        });

        const updated = await updateModel(id, data);
        
        if (data.isDefault) {
          await setDefaultModel(id);
        }
        if (data.isActive) {
          await setActiveModel(id);
        }

        return Response.json({ success: true, model: updated });
      }

      case "delete": {
        const id = formData.get("id");
        if (!id || typeof id !== "string") {
          return Response.json({ error: "Model ID required" }, { status: 400 });
        }

        await deleteModel(id);
        return Response.json({ success: true });
      }

      case "setDefault": {
        const id = formData.get("id");
        if (!id || typeof id !== "string") {
          return Response.json({ error: "Model ID required" }, { status: 400 });
        }

        await setDefaultModel(id);
        return Response.json({ success: true });
      }

      case "setActive": {
        const id = formData.get("id");
        if (!id || typeof id !== "string") {
          return Response.json({ error: "Model ID required" }, { status: 400 });
        }

        await setActiveModel(id);
        return Response.json({ success: true });
      }

      case "discover": {
        const provider = formData.get("provider");
        if (!provider || typeof provider !== "string") {
          return Response.json({ error: "Provider is required" }, { status: 400 });
        }

        const models = await discoverProviderModels({
          provider: formData.get("provider") as Parameters<typeof discoverProviderModels>[0]["provider"],
          apiKey: formData.get("apiKey")?.toString() || undefined,
          baseUrl: formData.get("baseUrl")?.toString() || undefined,
        });

        return Response.json({ success: true, models });
      }

      case "codexAuthStart": {
        const session = await startOpenAICodexLogin();
        return Response.json({
          success: true,
          session,
          oauth: {
            openaiCodexConnected: await hasOpenAICodexAuth(),
          },
        });
      }

      case "codexAuthComplete": {
        const sessionId = formData.get("sessionId")?.toString();
        const code = formData.get("code")?.toString();

        if (!sessionId) {
          return Response.json({ error: "Session ID is required" }, { status: 400 });
        }

        if (!code) {
          return Response.json({ error: "Authorization code is required" }, { status: 400 });
        }

        submitOpenAICodexManualCode(sessionId, code);
        return Response.json({ success: true });
      }

      default:
        return Response.json({ error: "Invalid intent" }, { status: 400 });
    }
  } catch (error) {
    console.error("Model API error:", error);
    return Response.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
