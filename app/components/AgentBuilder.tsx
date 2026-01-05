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
      content:
        'Hey! 👋 I\'m here to help you create your own AI agent. Just tell me what you want your agent to do, and I\'ll help you build it step by step.\n\nFor example, you could say:\n• "I want an agent that helps me write better emails"\n• "Create a friendly tutor for learning Spanish"\n• "Build a code reviewer that catches bugs"\n\nWhat kind of agent would you like to create?',
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
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAgent, setActiveAgent] = useState<{ mode: "plan" | "build"; name: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Human-in-the-loop state
  const [pendingQuestion, setPendingQuestion] = useState<{
    question: string;
    options?: string[];
    context?: string;
    threadId?: string;
  } | null>(null);

  // View state
  const [currentView, setCurrentView] = useState<'chat' | 'library'>('chat');

  // Sidebar mobile state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Workspace state (legacy - for library view)
  const [workspaces, setWorkspaces] = useState<Workspace[]>(mockWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    mockWorkspaces[0]?.id ?? null
  );

  // Welcome message
  const welcomeMessage: Message = {
    id: "welcome",
    role: "assistant",
    content: 'Hey! 👋 I\'m here to help you create your own AI agent. Just tell me what you want your agent to do, and I\'ll help you build it step by step.\n\nFor example, you could say:\n• "I want an agent that helps me write better emails"\n• "Create a friendly tutor for learning Spanish"\n• "Build a code reviewer that catches bugs"\n\nWhat kind of agent would you like to create?',
    timestamp: new Date(),
  };

  // Stream handler
  const { processStream } = useAgentStream({
    setMessages,
    setSandboxId,
    setActiveAgent,
    setPendingQuestion,
    setPendingBuildDelegation: (prompt) => {
      // Auto-accept simple build delegations for now
       if (prompt) setInput(prompt);
    },
    setIsTyping,
    setIsProcessing,
    chatId
  });

  // Handler: Select chat from sidebar
  const handleSelectChat = async (selectedChatId: string | null) => {
    if (!selectedChatId) {
      // New chat / deselect
      handleNewChat();
      return;
    }

    try {
      const response = await fetch(`/api/chats/${selectedChatId}`);
      if (response.ok) {
        const { chat } = await response.json();
        setChatId(chat.id);

        // Convert db messages to UI messages
        const loadedMessages: Message[] = chat.messages.map((msg: any) => {
          // Find artifact for this message if it has a preview
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
            // If a preview URL exists in DB, current session is likely dead.
            // Set to "loading" to show spinner until we restore it.
            previewUrl: msg.previewUrl ? "loading" : undefined,
            fileContent,
            thinkingSteps: msg.thinkingSteps,
          };
        });

        setMessages([welcomeMessage, ...loadedMessages]);
        setCurrentView('chat');

        // Activate sandbox (reconnect or create new)
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

        // RECONNECTION LOGIC: Check for active job and stream
        try {
          const jobResponse = await fetch(`/api/agent?chatId=${chat.id}`);
          if (jobResponse.ok) {
            setIsProcessing(true);
            setIsTyping(true);

            // Determine if we should attach to the last message or create a new one
            // Ideally, we find the last assistant message.
            const lastMsg = loadedMessages[loadedMessages.length - 1];
            let targetMessageId: string;
            let existingSteps: any[] = [];

            if (lastMsg && lastMsg.role === "assistant") {
              targetMessageId = lastMsg.id;
              existingSteps = lastMsg.thinkingSteps || [];
            } else {
              // Create a new placeholder if last was user, or if explicit resume needed
              targetMessageId = (Date.now() + 1).toString();
              const assistantMessage: Message = {
                id: targetMessageId,
                role: "assistant",
                content: "",
                timestamp: new Date(),
                thinkingSteps: [],
              };
              setMessages(prev => [...prev, assistantMessage]);
              // Update local var for processStream to use if needed (though we pass ID)
            }

            // Start streaming (blindly, trusting useAgentStream to dedupe)
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

  // Handler: New chat
  const handleNewChat = () => {
    setChatId(null);
    setSandboxId(null);
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

  // Cleanup sandbox when component unmounts or page closes
  useEffect(() => {
    const killSandbox = () => {
      if (sandboxId) {
        // Use sendBeacon for reliable delivery on page unload
        const formData = new FormData();
        formData.append("sandboxId", sandboxId);
        navigator.sendBeacon("/api/sandbox/kill", formData);
      }
    };

    // Kill sandbox on page close/refresh
    window.addEventListener("beforeunload", killSandbox);

    return () => {
      window.removeEventListener("beforeunload", killSandbox);
      // Also kill on component unmount
      killSandbox();
    };
  }, [sandboxId]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    // Create a placeholder assistant message that will be updated with streaming content
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

    // Create abort controller for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Create chat if this is the first user message (after welcome)
      let currentChatId = chatId;
      if (!currentChatId) {
        // Generate a short, contextual title from the prompt
        const generateTitle = (prompt: string): string => {
          // Remove common prefixes
          let title = prompt
            .replace(/^(build|create|make|write|design|implement|help me|i want|can you)\s+(a|an|the|me)?\s*/i, '')
            .replace(/^(with|using|that|for)\s+/i, '');

          // Take first 3-4 meaningful words
          const words = title.split(/\s+/).slice(0, 4);
          title = words.join(' ');

          // Capitalize first letter
          title = title.charAt(0).toUpperCase() + title.slice(1);

          // Limit length
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

      // Save user message to database
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
      if (error instanceof Error && error.name === 'AbortError') {
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

    // Continue the conversation by sending the answer back to the agent
    setInput("");
    
    // Re-trigger agent with the answer (the agent will continue from where it left off)
    const formData = new FormData();
    formData.append("prompt", answer);
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

    // Create a new placeholder for the response
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
    // Add badge (replace existing)
    setActiveBadges([feature]);

    // Optionally set input if provided
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

      {/* Main Content Area */}
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
