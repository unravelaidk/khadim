import { eq, desc } from "drizzle-orm";
import { db, modelConfigs } from "../lib/db";
import type { ModelConfig, NewModelConfig } from "../lib/db/schema";
import { createChatModel } from "./models";
import { createId } from "@paralleldrive/cuid2";

export async function getActiveModel(): Promise<ModelConfig | null> {
  const result = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.isActive, true))
    .orderBy(desc(modelConfigs.isDefault))
    .limit(1);
  
  return result[0] || null;
}

export async function getDefaultModel(): Promise<ModelConfig | null> {
  const result = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.isDefault, true))
    .limit(1);
  
  return result[0] || null;
}

export async function getAllModels(): Promise<ModelConfig[]> {
  return db.select().from(modelConfigs).orderBy(desc(modelConfigs.isDefault));
}

export async function getModelById(id: string): Promise<ModelConfig | null> {
  const result = await db
    .select()
    .from(modelConfigs)
    .where(eq(modelConfigs.id, id))
    .limit(1);
  
  return result[0] || null;
}

export async function createModel(config: Omit<NewModelConfig, "id" | "createdAt" | "updatedAt">): Promise<ModelConfig> {
  const id = createId();
  const now = new Date();
  
  const [created] = await db
    .insert(modelConfigs)
    .values({
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  
  return created;
}

export async function updateModel(id: string, updates: Partial<Omit<NewModelConfig, "id" | "createdAt" | "updatedAt">>): Promise<ModelConfig | null> {
  const [updated] = await db
    .update(modelConfigs)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(modelConfigs.id, id))
    .returning();
  
  return updated || null;
}

export async function deleteModel(id: string): Promise<boolean> {
  const result = await db
    .delete(modelConfigs)
    .where(eq(modelConfigs.id, id))
    .returning();
  
  return result.length > 0;
}

export async function setDefaultModel(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(modelConfigs).set({ isDefault: false });
    await tx.update(modelConfigs).set({ isDefault: true }).where(eq(modelConfigs.id, id));
  });
}

export async function setActiveModel(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(modelConfigs).set({ isActive: false });
    await tx.update(modelConfigs).set({ isActive: true }).where(eq(modelConfigs.id, id));
  });
}

export async function createModelInstance(config: ModelConfig, defaultApiKey?: string) {
  return createChatModel(config, defaultApiKey);
}

export async function initializeDefaultModels(): Promise<void> {
  const existing = await getAllModels();
  
  if (existing.length === 0) {
    if (process.env.OPENAI_API_KEY) {
      await createModel({
        name: "GPT-4o Mini",
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: "0.2",
        isDefault: true,
        isActive: true,
      });
      return;
    }

    if (process.env.ANTHROPIC_API_KEY) {
      await createModel({
        name: "Claude Sonnet 4.5",
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        temperature: "0.2",
        isDefault: true,
        isActive: true,
      });
      return;
    }

    if (process.env.OPENROUTER_API_KEY) {
      await createModel({
        name: "DevStral Free (OpenRouter)",
        provider: "openrouter",
        model: "mistralai/devstral-2512:free",
        temperature: "0.2",
        isDefault: true,
        isActive: true,
      });
      return;
    }

    await createModel({
      name: "Local Ollama",
      provider: "ollama",
      model: "llama3.1",
      baseUrl: "http://localhost:11434/v1",
      temperature: "0.2",
      isDefault: true,
      isActive: true,
    });
  }
}
