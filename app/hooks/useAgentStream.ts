import { useState, useRef, useCallback } from "react";
import type { Message, ThinkingStepData, AgentConfig, PendingQuestion } from "../types/chat";

interface UseAgentStreamProps {
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setSandboxId: (id: string) => void;
  setJobId: (id: string | null) => void;
  setActiveAgent: (agent: { mode: "plan" | "build"; name: string } | null) => void;
  setPendingQuestion: (question: PendingQuestion | null) => void;
  setPendingBuildDelegation: (prompt: string | null) => void;
  setIsTyping: (isTyping: boolean) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  chatId: string | null;
}

interface SSEEvent {
  type: string;
  id?: number;
  [key: string]: unknown;
}

interface StreamState {
  steps: ThinkingStepData[];
  streamedText: string;
  isDone: boolean;
  lastEventId: number;
}

export function useAgentStream({
  setMessages,
  setSandboxId,
  setJobId,
  setActiveAgent,
  setPendingQuestion,
  setPendingBuildDelegation,
  setIsTyping,
  setIsProcessing,
  chatId,
}: UseAgentStreamProps) {
  const updateAssistantMessage = useCallback(
    (assistantMessageId: string, updater: (message: Message) => Message) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === assistantMessageId ? updater(msg) : msg))
      );
    },
    [setMessages]
  );

  const parseSSELine = useCallback((line: string): { id?: string; event?: string; data?: string } | null => {
    if (line.startsWith("id:")) {
      return { id: line.slice(3).trim() };
    }
    if (line.startsWith("event:")) {
      return { event: line.slice(6).trim() };
    }
    if (line.startsWith("data:")) {
      return { data: line.slice(5).trim() };
    }
    if (line.startsWith(":")) {
      return { data: line.slice(1).trim() };
    }
    return null;
  }, []);

  const parseSSEEvent = useCallback((rawData: string): SSEEvent | null => {
    try {
      return JSON.parse(rawData) as SSEEvent;
    } catch {
      return null;
    }
  }, []);

  const processStream = useCallback(
    async (
      response: Response,
      assistantMessageId: string,
      existingSteps: ThinkingStepData[] = []
    ) => {
      if (!response.body) throw new Error("No response body");

      const state: StreamState = {
        steps: [...existingSteps],
        streamedText: "",
        isDone: false,
        lastEventId: 0,
      };

      const updateMessage = () => {
        updateAssistantMessage(assistantMessageId, (msg) => ({
          ...msg,
          content: state.streamedText,
          thinkingSteps: state.steps.map((s) => ({ ...s })),
        }));
      };

      const processEvent = (event: SSEEvent) => {
        if (event.type === "step_start") {
          const stepId = String(event.id);
          if (!state.steps.find((s) => s.id === stepId)) {
            state.steps.push({
              id: stepId,
              title: event.title as string,
              status: "running",
              content: "",
              tool: event.tool as ThinkingStepData["tool"],
              filename: (event.filename || (event.args as { path?: string })?.path) as ThinkingStepData["filename"],
              fileContent: (event.fileContent || (event.args as { content?: string })?.content) as ThinkingStepData["fileContent"],
            });
            updateMessage();
          }
        } else if (event.type === "step_update") {
          const stepId = String(event.id);
          const stepIndex = state.steps.findIndex((s) => s.id === stepId);
          if (stepIndex !== -1 && event.content) {
            state.steps[stepIndex] = { ...state.steps[stepIndex], content: event.content as string };
            updateMessage();
          }
        } else if (event.type === "step_complete") {
          const stepId = String(event.id);
          const stepIndex = state.steps.findIndex((s) => s.id === stepId);
          if (stepIndex !== -1) {
            state.steps[stepIndex] = {
              ...state.steps[stepIndex],
              status: "complete",
              result: (event.result ?? state.steps[stepIndex].result) as ThinkingStepData["result"],
              filename: state.steps[stepIndex].filename || (event.filename as ThinkingStepData["filename"]),
              fileContent: state.steps[stepIndex].fileContent || (event.fileContent as ThinkingStepData["fileContent"]),
            };
            updateMessage();
          }
        } else if (event.type === "text_delta") {
          state.streamedText += event.content as string;
          updateMessage();
        } else if (event.type === "sandbox_info") {
          if (event.sandboxId) setSandboxId(event.sandboxId as string);
        } else if (event.type === "job_created") {
          if (event.jobId) setJobId(String(event.jobId));
        } else if (event.type === "agent_mode") {
          setActiveAgent({ mode: event.mode as "plan" | "build", name: event.name as string });
        } else if (event.type === "slide_content") {
          const slideContent = event.fileContent as string | undefined;
          if (slideContent) {
            updateAssistantMessage(assistantMessageId, (msg) => ({
              ...msg,
              fileContent: slideContent,
            }));
          }
        } else if (event.type === "file_written") {
          const filename = typeof event.filename === "string" ? event.filename : undefined;
          const fileContent = typeof event.content === "string" ? event.content : undefined;
          if (filename === "index.html" && fileContent?.includes('<script id="slide-data"')) {
            updateAssistantMessage(assistantMessageId, (msg) => ({
              ...msg,
              fileContent,
            }));
          }
        } else if (event.type === "done") {
          state.streamedText = (event.content ?? state.streamedText) as string;
          state.isDone = true;
          setActiveAgent(null);
          setJobId(null);

          let fileContent: string | undefined;
          const indexHtmlStep = state.steps.find(
            (s) => s.tool === "write_file" && s.filename === "index.html" && s.fileContent
          );
          if (indexHtmlStep?.fileContent) {
            const isSlideContent = indexHtmlStep.fileContent.includes('<script id="slide-data"');
            if (isSlideContent || event.previewUrl) {
              fileContent = indexHtmlStep.fileContent;
            }
          }

          const msgPreviewUrl = event.previewUrl as string | undefined;
          updateAssistantMessage(assistantMessageId, (msg) => ({
            ...msg,
            content: state.streamedText,
            thinkingSteps: state.steps.map((s) => ({ ...s })),
            previewUrl: msgPreviewUrl,
            fileContent: fileContent || msg.fileContent,
          }));
        } else if (event.type === "ask_user") {
          setPendingQuestion({
            question: event.question as string,
            options: event.options as PendingQuestion["options"],
            context: event.context as string,
            threadId: event.threadId as string,
          });
          setIsTyping(false);
          updateAssistantMessage(assistantMessageId, (msg) => ({
            ...msg,
            content: `I have a question for you...`,
            thinkingSteps: state.steps.map((s) => ({ ...s })),
          }));
        } else if (event.type === "delegate_build") {
          const planInfo = {
            plan: event.plan as string,
            context: event.context as string,
          };

          updateAssistantMessage(assistantMessageId, (msg) => ({
            ...msg,
            content: `Plan approved! The Build agent will now execute...`,
            thinkingSteps: state.steps.map((s) => ({ ...s })),
          }));

          const buildPrompt = `Execute this approved plan:\n\n${planInfo.plan}${planInfo.context ? `\n\nContext: ${planInfo.context}` : ""}`;
          setPendingBuildDelegation(buildPrompt);
        } else if (event.type === "error") {
          setJobId(null);
          state.isDone = true;
          console.error("[SSE] Received error event:", event.message);
        }
      };

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            const parsed = parseSSELine(line);
            if (!parsed) continue;

            if (parsed.data !== undefined) {
              const event = parseSSEEvent(parsed.data);
              if (event) {
                try {
                  processEvent(event);
                } catch (e) {
                  console.error("[SSE] Error processing event:", e);
                }
              }
            }
          }
        }

        if (!state.isDone) {
          console.warn("[SSE] Stream ended without done event, marking steps as complete");
          for (const step of state.steps) {
            if (step.status === "running") {
              step.status = "complete";
            }
          }
          updateAssistantMessage(assistantMessageId, (msg) => ({
            ...msg,
            content: state.streamedText,
            thinkingSteps: state.steps.map((s) => ({ ...s })),
          }));
        }
      } catch (error) {
        if (error instanceof Error && (error.name === "AbortError" || error.message.includes("lock"))) {
          return;
        }
        console.error("[SSE] Stream processing error:", error);
        throw error;
      } finally {
        setIsTyping(false);
        setIsProcessing(false);
      }
    },
    [
      updateAssistantMessage,
      setSandboxId,
      setJobId,
      setActiveAgent,
      setPendingQuestion,
      setPendingBuildDelegation,
      setIsTyping,
      setIsProcessing,
      parseSSELine,
      parseSSEEvent,
    ]
  );

  return { processStream };
}
