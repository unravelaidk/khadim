import { useEffect, useRef, useState } from "react";
import {
  ChatInput,
  PreviewModal,
  WelcomeScreen,
  ChatInterface,
  ChatHeader,
} from "./agent-builder";
import type { Message, AgentConfig } from "./agent-builder";
import { mockWorkspaces } from "./workspace";
import { Sidebar } from "./Sidebar/Sidebar";
import { LibraryView } from "./Library/LibraryView";
import type { Workspace } from "./workspace";
import { useAgentStream } from "../hooks/useAgentStream";

const suggestedPrompts = [
  "I want an agent that helps me write emails",
  "Create a coding assistant that explains things simply",
  "Build a customer support agent for my online store",
  "I need an agent that helps me brainstorm ideas",
];

export function AgentBuilder() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeBadges, setActiveBadges] = useState<Array<{ label: string; icon: React.ReactNode; prompt?: string }>>([]);
  const [sandboxId, setSandboxId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<{ mode: "plan" | "build"; name: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [pendingQuestion, setPendingQuestion] = useState<{
    question: string;
    options?: string[];
    context?: string;
    threadId?: string;
  } | null>(null);

  const [currentView, setCurrentView] = useState<'chat' | 'library'>('chat');

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [workspaces, setWorkspaces] = useState<Workspace[]>(mockWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    mockWorkspaces[0]?.id ?? null
  );

  const welcomeMessage: Message = {
    id: "welcome",
    role: "assistant",
    content: "",
    timestamp: new Date(),
  };

  const { processStream } = useAgentStream({
    setMessages,
    setSandboxId,
    setJobId,
    setActiveAgent,
    setPendingQuestion,
    setPendingBuildDelegation: (prompt) => {
       if (prompt) setInput(prompt);
    },
    setIsTyping,
    setIsProcessing,
    chatId
  });

  const handleSelectChat = async (selectedChatId: string | null) => {
    if (!selectedChatId) {
      handleNewChat();
      return;
    }

    try {
      const response = await fetch(`/api/chats/${selectedChatId}`);
      if (response.ok) {
        const { chat } = await response.json();
        setChatId(chat.id);

        const loadedMessages: Message[] = chat.messages.map((msg: any) => {
          let fileContent: string | undefined;
          if (msg.previewUrl && chat.artifacts) {
            const indexHtml = chat.artifacts.find((a: any) => a.filename === "index.html");
            if (indexHtml) {
              fileContent = indexHtml.content;
            }
          }

          return {
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: new Date(msg.createdAt),
            previewUrl: msg.previewUrl ? "loading" : undefined,
            fileContent,
            thinkingSteps: msg.thinkingSteps,
          };
        });

        setMessages([welcomeMessage, ...loadedMessages]);
        setCurrentView('chat');

        const sandboxForm = new FormData();
        if (chat.sandboxId) {
          sandboxForm.append("sandboxId", chat.sandboxId);
        }
        if (chat.id) {
          sandboxForm.append("chatId", chat.id);
        }

        const sandboxRes = await fetch("/api/sandbox/connect", {
          method: "POST",
          body: sandboxForm,
        });

        if (sandboxRes.ok) {
          const { sandboxId: newSandboxId, previewUrl: newPreviewUrl } = await sandboxRes.json();
          setSandboxId(newSandboxId);

          if (newPreviewUrl) {
            setMessages(prev => prev.map(msg =>
              msg.previewUrl ? { ...msg, previewUrl: newPreviewUrl } : msg
            ));
          }
        }

        try {
          const jobResponse = await fetch(`/api/agent?chatId=${chat.id}`);
          if (jobResponse.ok) {
            setIsProcessing(true);
            setIsTyping(true);

            const lastMsg = loadedMessages[loadedMessages.length - 1];
            let targetMessageId: string;
            let existingSteps: any[] = [];

            if (lastMsg && lastMsg.role === "assistant") {
              targetMessageId = lastMsg.id;
              existingSteps = lastMsg.thinkingSteps || [];
            } else {
              targetMessageId = (Date.now() + 1).toString();
              const assistantMessage: Message = {
                id: targetMessageId,
                role: "assistant",
                content: "",
                timestamp: new Date(),
                thinkingSteps: [],
              };
              setMessages(prev => [...prev, assistantMessage]);
            }

            processStream(jobResponse, targetMessageId, existingSteps).catch(e => {
              console.error("Error resuming stream:", e);
              setIsProcessing(false);
              setIsTyping(false);
            });
          }
        } catch (e) {
          console.log("No active job to resume or error checking:", e);
        }
      }
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
  };

  const handleNewChat = () => {
    setChatId(null);
    setSandboxId(null);
    setJobId(null);
    setMessages([welcomeMessage]);
    setActiveBadges([]);
    setCurrentView('chat');
  };

  const handleCreateWorkspace = () => {
    handleNewChat();
  };

  const handleSelectWorkspace = (id: string) => {
    setSelectedWorkspaceId(id);
    setCurrentView('chat');
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (currentView === 'chat') {
      scrollToBottom();
    }
  }, [messages, currentView]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      thinkingSteps: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setIsTyping(true);
    setIsProcessing(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      let currentChatId = chatId;
      if (!currentChatId) {
        const generateTitle = (prompt: string): string => {
          let title = prompt
            .replace(/^(build|create|make|write|design|implement|help me|i want|can you)\s+(a|an|the|me)?\s*/i, '')
            .replace(/^(with|using|that|for)\s+/i, '');

          const words = title.split(/\s+/).slice(0, 4);
          title = words.join(' ');

          title = title.charAt(0).toUpperCase() + title.slice(1);

          if (title.length > 30) {
            title = title.slice(0, 30).trim() + '...';
          }

          return title || 'New Chat';
        };

        const createChatForm = new FormData();
        createChatForm.append("title", generateTitle(userMessage.content));
        const chatResponse = await fetch("/api/chats", {
          method: "POST",
          body: createChatForm,
        });
        if (chatResponse.ok) {
          const { chat } = await chatResponse.json();
          currentChatId = chat.id;
          setChatId(chat.id);
          setSidebarRefreshKey(prev => prev + 1); // Trigger sidebar refresh
        }
      }

      if (currentChatId) {
        const userMsgForm = new FormData();
        userMsgForm.append("chatId", currentChatId);
        userMsgForm.append("role", "user");
        userMsgForm.append("content", userMessage.content);
        fetch("/api/messages", { method: "POST", body: userMsgForm });
      }

      const formData = new FormData();
      formData.append("prompt", userMessage.content);
      if (sandboxId) {
        formData.append("sandboxId", sandboxId);
      }
      if (currentChatId) {
        formData.append("chatId", currentChatId);
      }
      if (activeBadges.length > 0) {
        formData.append("badges", JSON.stringify(activeBadges));
      }

      const response = await fetch("/api/agent", {
        method: "POST",
        body: formData,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      await processStream(response, assistantMessageId);

    } catch (error) {
      // Don't show error message if request was aborted
      if (error instanceof Error && (error.name === 'AbortError' || error.message.includes("Cancelled by user"))) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: "⏹️ Request stopped by user." }
              : msg
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: "Sorry, I encountered an error connecting to the agent. Please check your API key and try again." }
              : msg
          )
        );
      }
    } finally {
      setIsTyping(false);
      setIsProcessing(false);
      abortControllerRef.current = null;
    }
  };

  const generateResponse = (
    userInput: string,
    messageCount: number
  ): { message: string; config?: AgentConfig } => {
    const inputLower = userInput.toLowerCase();

    if (messageCount === 1) {
      let agentType = "assistant";
      let capabilities: string[] = [];

      if (inputLower.includes("email")) {
        agentType = "Email Assistant";
        capabilities = ["Write emails", "Improve tone", "Grammar check"];
      } else if (inputLower.includes("code") || inputLower.includes("coding")) {
        agentType = "Code Assistant";
        capabilities = ["Write code", "Debug issues", "Explain concepts"];
      } else if (inputLower.includes("customer") || inputLower.includes("support")) {
        agentType = "Support Agent";
        capabilities = ["Answer questions", "Resolve issues", "Track requests"];
      } else if (inputLower.includes("tutor") || inputLower.includes("learn")) {
        agentType = "Learning Tutor";
        capabilities = ["Teach concepts", "Quiz user", "Track progress"];
      } else if (inputLower.includes("brainstorm") || inputLower.includes("idea")) {
        agentType = "Creative Assistant";
        capabilities = ["Generate ideas", "Mind mapping", "Expand concepts"];
      } else {
        agentType = "Custom Assistant";
        capabilities = ["Answer questions", "Help with tasks", "Provide info"];
      }

      return {
        message: `Great choice! I'll help you create a **${agentType}**. 🎯\n\nI've identified these capabilities:\n${capabilities.map((c) => `• ${c}`).join("\n")}\n\nNow, let's give your agent a personality. How would you like it to communicate?\n\n• Professional and formal\n• Friendly and casual\n• Encouraging and supportive\n• Direct and concise`,
        config: {
          name: agentType,
          description: userInput,
          capabilities,
          personality: "",
        },
      };
    } else if (messageCount === 3) {
      let personality = "helpful and balanced";
      if (inputLower.includes("professional") || inputLower.includes("formal")) {
        personality = "professional and formal";
      } else if (inputLower.includes("friendly") || inputLower.includes("casual")) {
        personality = "friendly and casual";
      } else if (inputLower.includes("encouraging") || inputLower.includes("supportive")) {
        personality = "encouraging and supportive";
      } else if (inputLower.includes("direct") || inputLower.includes("concise")) {
        personality = "direct and concise";
      }

      return {
        message: `Perfect! Your agent will be **${personality}**. ✨\n\nLast question: What would you like to name your agent?\n\nYou can pick something fun like "Luna" or descriptive like "Email Pro" - whatever feels right!`,
        config: agentConfig ? { ...agentConfig, personality } : undefined,
      };
    } else if (messageCount === 5) {
      const name = userInput.trim() || "My Agent";

      return {
        message: `🎉 Amazing! Your agent "**${name}**" is ready!\n\nHere's what we built:\n• **Name:** ${name}\n• **Type:** ${agentConfig?.name || "Custom Assistant"}\n• **Personality:** ${agentConfig?.personality || "Friendly"}\n• **Capabilities:** ${agentConfig?.capabilities?.join(", ") || "General assistance"}\n\nClick the **"Preview"** button above to test it out, or continue chatting to make changes!`,
        config: agentConfig ? { ...agentConfig, name } : undefined,
      };
    }

    return {
      message: "I understand! Would you like to make any changes to your agent, or are you ready to deploy it?",
    };
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsTyping(false);
    setIsProcessing(false);
    if (jobId || chatId) {
      const stopForm = new FormData();
      if (jobId) stopForm.append("jobId", jobId);
      if (chatId) stopForm.append("chatId", chatId);
      fetch("/api/agent/stop", { method: "POST", body: stopForm });
    }
    abortControllerRef.current = null;
  };

  const handleAnswerQuestion = async (answer: string) => {
    if (!pendingQuestion) return;

    // Clear the pending question
    setPendingQuestion(null);

    // Add user's answer as a message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: answer,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // Save user message to database
    if (chatId) {
      const userMsgForm = new FormData();
      userMsgForm.append("chatId", chatId);
      userMsgForm.append("role", "user");
      userMsgForm.append("content", answer);
      fetch("/api/messages", { method: "POST", body: userMsgForm });
    }

    setInput("");
    
    const formData = new FormData();
    const contextualPrompt = `User answered the question: "${pendingQuestion.question}"\n\nAnswer: ${answer}${pendingQuestion.context ? `\n\nOriginal context: ${pendingQuestion.context}` : ''}`;
    const planPrefix = "Plan:\n";
    const planFromContext = pendingQuestion.context?.startsWith(planPrefix)
      ? pendingQuestion.context.slice(planPrefix.length)
      : null;
    const normalizedAnswer = answer.trim().toLowerCase();
    const isApproval = normalizedAnswer === "yes" || normalizedAnswer.startsWith("yes,") || normalizedAnswer === "y" || normalizedAnswer === "ok" || normalizedAnswer === "okay" || normalizedAnswer === "sure";
    let nextPrompt = contextualPrompt;
    let nextMode: "plan" | "build" = activeAgent?.mode ?? "build";

    if (planFromContext) {
      if (isApproval) {
        nextPrompt = `Execute this approved plan:\n\n${planFromContext}`;
        nextMode = "build";
      } else {
        nextPrompt = `Update the plan based on this feedback:\n\n${answer}\n\nExisting plan:\n${planFromContext}`;
        nextMode = "plan";
      }
    }

    formData.append("prompt", nextPrompt);
    formData.append("agentMode", nextMode);
    if (sandboxId) {
      formData.append("sandboxId", sandboxId);
    }
    if (chatId) {
      formData.append("chatId", chatId);
    }
    if (pendingQuestion.threadId) {
      formData.append("threadId", pendingQuestion.threadId);
    }

    setIsTyping(true);
    setIsProcessing(true);

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      thinkingSteps: [],
    };

    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      await processStream(response, assistantMessageId);
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: "Sorry, there was an error processing your answer." }
            : msg
        )
      );
    } finally {
      setIsTyping(false);
      setIsProcessing(false);
    }
  };

  const handleSuggestionClick = (feature: { label: string; icon: React.ReactNode; prompt?: string }) => {
    setActiveBadges([feature]);

    if (feature.prompt) {
      setInput(feature.prompt);
    }
  };

  const removeBadge = (label: string) => {
    setActiveBadges(prev => prev.filter(b => b.label !== label));
  };

  const isInitialState = messages.length === 1;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        selectedChatId={chatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        refreshKey={sidebarRefreshKey}
        onNavigate={setCurrentView}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col bg-gb-bg overflow-hidden relative">
        <ChatHeader onOpenSidebar={() => setIsSidebarOpen(true)} />

        {currentView === 'library' ? (
          <LibraryView
            workspaces={workspaces}
            onSelectWorkspace={handleSelectWorkspace}
          />
        ) : (
          <>
            <main
              className={`flex-1 overflow-y-auto ${isInitialState ? "flex items-center justify-center py-8" : "pt-8 pb-36 px-4"
                }`}
            >
              {!isInitialState && (
                <ChatInterface
                  messages={messages}
                  isTyping={isTyping}
                  pendingQuestion={pendingQuestion}
                  onAnswerQuestion={handleAnswerQuestion}
                  onCancelQuestion={() => setPendingQuestion(null)}
                  messagesEndRef={messagesEndRef}
                />
              )}

              {isInitialState && (
                <WelcomeScreen
                  input={input}
                  setInput={setInput}
                  handleSend={handleSend}
                  activeBadges={activeBadges}
                  removeBadge={removeBadge}
                  onSuggestionClick={handleSuggestionClick}
                />
              )}
            </main>

            {!isInitialState && (
              <ChatInput
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onStop={handleStop}
                isProcessing={isProcessing}
                activeAgent={activeAgent}
                isCompact={false}
                position="fixed"
              />
            )}

            {agentConfig && (
              <PreviewModal
                agentConfig={agentConfig}
                isOpen={showPreview}
                onClose={() => setShowPreview(false)}
                onDeploy={() => {
                  console.log("Deploying agent:", agentConfig);
                  setShowPreview(false);
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
