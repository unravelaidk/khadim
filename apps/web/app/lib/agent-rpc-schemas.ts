import { z } from "zod";

const optionalString = z.string().min(1).optional();

export const jobStartSchema = z.object({
  prompt: optionalString,
  sandboxId: optionalString,
  chatId: optionalString,
  sessionId: optionalString,
  badges: optionalString,
  systemPrompt: optionalString,
  documentIds: z.array(z.string().min(1)).optional(),
  agentMode: z.enum(["plan", "build", "chat"]).optional(),
  requestId: optionalString,
  currentTurnId: optionalString,
  currentTurnPersisted: z.boolean().optional(),
});

export const jobMessageSchema = z.object({
  jobId: optionalString,
  chatId: z.string().min(1).nullable().optional(),
  sessionId: optionalString,
  prompt: optionalString,
  systemPrompt: optionalString,
  requestId: optionalString,
  currentTurnId: optionalString,
  currentTurnPersisted: z.boolean().optional(),
});

export const jobSteerSchema = z.object({
  jobId: optionalString,
  chatId: z.string().min(1).nullable().optional(),
  sessionId: optionalString,
  prompt: optionalString,
  systemPrompt: optionalString,
});
