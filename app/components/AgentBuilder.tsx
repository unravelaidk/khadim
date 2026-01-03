import { useEffect, useRef, useState } from "react";
import {
  GameBoyScreen,
  ChatMessage,
  ChatInput,
  TypingIndicator,
  SuggestionCards,
  PreviewModal,
} from "./agent-builder";
import type { Message, AgentConfig } from "./agent-builder";
import { FileExplorerSidebar, mockWorkspaces } from "./workspace";
import type { Workspace } from "./workspace";

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

  // Sidebar mobile state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Workspace state
  const [workspaces, setWorkspaces] = useState<Workspace[]>(mockWorkspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    mockWorkspaces[0]?.id ?? null
  );

  const handleCreateWorkspace = () => {
    const newWorkspace: Workspace = {
      id: `ws-${Date.now()}`,
      name: `New Workspace ${workspaces.length + 1}`,
      createdAt: new Date(),
      files: [],
      messages: [],
    };
    setWorkspaces((prev: Workspace[]) => [newWorkspace, ...prev]);
    setSelectedWorkspaceId(newWorkspace.id);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const response = generateResponse(userMessage.content, messages.length);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.message,
          timestamp: new Date(),
        },
      ]);
      if (response.config) {
        setAgentConfig(response.config);
      }
      setIsTyping(false);
    }, 1000);
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

  const handleSuggestionClick = (prompt: string) => {
    setInput(prompt);
  };

  const isInitialState = messages.length === 1;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Retro File Explorer Sidebar */}
      <FileExplorerSidebar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={setSelectedWorkspaceId}
        onCreateWorkspace={handleCreateWorkspace}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-gb-bg overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b border-gb-border bg-gb-bg sticky top-0 z-10">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-gb-text-secondary hover:bg-gb-bg-subtle"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="ml-3 font-semibold text-gb-text">Khadim</span>
        </div>

        <main
          className={`flex-1 flex items-center justify-center px-4 overflow-y-auto ${
            isInitialState ? "py-8" : "pt-8 pb-36"
          }`}
        >
          <div className="w-full max-w-3xl">
            <GameBoyScreen>
              <div className="space-y-4">
                {messages.map((message) => (
                  <ChatMessage key={message.id} message={message} />
                ))}
                {isTyping && <TypingIndicator />}
                <div ref={messagesEndRef} />
              </div>
            </GameBoyScreen>

            {isInitialState && (
              <>
                <SuggestionCards prompts={suggestedPrompts} onSelect={handleSuggestionClick} />
                <div className="mt-8">
                  <ChatInput
                    value={input}
                    onChange={setInput}
                    onSend={handleSend}
                    isCompact={false}
                    position="relative"
                  />
                </div>
              </>
            )}
          </div>
        </main>

        {!isInitialState && (
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
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
      </div>
    </div>
  );
}
