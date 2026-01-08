import { useState, useRef } from "react";
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

export function useAgentStream({
  setMessages,
  setSandboxId,
  setJobId,
  setActiveAgent,
  setPendingQuestion,
  setPendingBuildDelegation,
  setIsTyping,
  setIsProcessing,
  chatId
}: UseAgentStreamProps) {
  
  const processStream = async (
    response: Response, 
    assistantMessageId: string,
    existingSteps: ThinkingStepData[] = []
  ) => {
    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamedText = "";
    
    // Initialize steps with any existing ones (for re-connections or continuations)
    // We use a local mutable array for accumulating, but we MUST trigger immutable 
    // updates for React to see them
    const steps: ThinkingStepData[] = [...existingSteps];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              
              // Handle different event types
              if (event.type === "step_start") {
                // Prevent duplicates on reconnection
                if (!steps.find(s => s.id === event.id)) {
                  steps.push({
                    id: event.id,
                    title: event.title,
                    status: "running",
                    content: "",
                    tool: event.tool,
                    // File info from write_file tool - check both direct props and args
                    filename: event.filename || event.args?.path,
                    fileContent: event.fileContent || event.args?.content,
                  });
                }
              } else if (event.type === "step_update") {
                // IMMUTABLE UPDATE: Replace the step object at the specific index
                const stepIndex = steps.findIndex(s => s.id === event.id);
                if (stepIndex !== -1 && event.content) {
                  steps[stepIndex] = { ...steps[stepIndex], content: event.content };
                }
              } else if (event.type === "step_complete") {
                // IMMUTABLE UPDATE
                const stepIndex = steps.findIndex(s => s.id === event.id);
                if (stepIndex !== -1) {
                  steps[stepIndex] = { 
                    ...steps[stepIndex], 
                    status: "complete", 
                    result: event.result ?? steps[stepIndex].result,
                    // Also include file info on complete (for cases where step_start didn't have it)
                    filename: steps[stepIndex].filename || event.filename,
                    fileContent: steps[stepIndex].fileContent || event.fileContent,
                  };
                }
              } else if (event.type === "text_delta") {
                streamedText += event.content;
              } else if (event.type === "sandbox_info") {
                if (event.sandboxId) setSandboxId(event.sandboxId);
              } else if (event.type === "job_created") {
                if (event.jobId) setJobId(event.jobId as string);
              } else if (event.type === "agent_mode") {
                setActiveAgent(event as { mode: "plan" | "build"; name: string });
              } else if (event.type === "slide_content") {
                // Capture slide file content for real-time preview
                const slideContent = event.fileContent as string | undefined;
                if (slideContent) {
                  setMessages(prev =>
                    prev.map(msg =>
                      msg.id === assistantMessageId
                        ? { ...msg, fileContent: slideContent }
                        : msg
                    )
                  );
                }
              } else if (event.type === "done") {
                streamedText = event.content || "";
                setActiveAgent(null);
                setJobId(null);
                
                // Extract fileContent from write_file steps (for slides preview)
                let fileContent: string | undefined;
                const indexHtmlStep = steps.find(
                  s => s.tool === "write_file" && 
                       s.filename === "index.html" && 
                       s.fileContent
                );
                if (indexHtmlStep?.fileContent) {
                  // Check if it's slide content or has a previewUrl
                  const isSlideContent = indexHtmlStep.fileContent.includes('<script id="slide-data"');
                  if (isSlideContent || event.previewUrl) {
                    fileContent = indexHtmlStep.fileContent;
                  }
                }
                
                // Final update with all data
                const msgPreviewUrl = event.previewUrl as string | undefined;
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { 
                          ...msg, 
                          content: streamedText, 
                          thinkingSteps: [...steps], // Spread to create new array ref
                          previewUrl: msgPreviewUrl,
                          fileContent 
                        }
                      : msg
                  )
                );
                continue;
              } else if (event.type === "ask_user") {
                setPendingQuestion({
                  question: event.question,
                  options: event.options,
                  context: event.context,
                  threadId: event.threadId,
                });
                setIsTyping(false);
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: `🤔 I have a question for you...`, thinkingSteps: [...steps] }
                      : msg
                  )
                );
              } else if (event.type === "delegate_build") {
                const planInfo = {
                  plan: event.plan as string,
                  context: event.context as string,
                };
                
                setMessages(prev =>
                  prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: `✅ Plan approved! The Build agent will now execute...`, thinkingSteps: [...steps] }
                      : msg
                  )
                );
                
                const buildPrompt = `Execute this approved plan:\n\n${planInfo.plan}${planInfo.context ? `\n\nContext: ${planInfo.context}` : ""}`;
                setPendingBuildDelegation(buildPrompt);
              } else if (event.type === "error") {
                setJobId(null);
                throw new Error(event.message);
              }

              // Update message progress in real-time
              // We deep clone steps to ensure React detects the change (fixing the rendering issue)
              const clonedSteps = steps.map(s => ({ ...s }));
              
              setMessages(prev =>
                prev.map(msg =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: streamedText, thinkingSteps: clonedSteps }
                    : msg
                )
              );
            } catch (e) {
              console.error("Error parsing SSE event:", e);
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.message.includes("lock"))) {
        // Stream aborted, exit cleanly
        return;
      }
      console.error("Stream processing error:", error);
      throw error;
    } finally {
      setIsTyping(false);
      setIsProcessing(false);
    }
  };

  return { processStream };
}
