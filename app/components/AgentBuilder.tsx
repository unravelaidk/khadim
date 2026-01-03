import { useEffect, useRef, useState } from "react";
import {
  GameBoyScreen,
  ChatMessage,
  ChatInput,
  TypingIndicator,
  SuggestionCards,
  PreviewModal,
  FeatureSelection,
} from "./agent-builder";
import type { Message, AgentConfig } from "./agent-builder";
import { mockWorkspaces } from "./workspace";
import { Sidebar } from "./Sidebar/Sidebar";
import { LibraryView } from "./Library/LibraryView";
import type { Workspace } from "./workspace";
import KhadimLogo from "../assets/Khadim-logo.svg";

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

      const response = await fetch("/api/agent", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedText = "";
      const steps: Message["thinkingSteps"] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event = JSON.parse(line.slice(6));
              
              if (event.type === "step_start") {
                steps.push({
                  id: event.id,
                  title: event.title,
                  status: "running",
                  content: "",
                });
              } else if (event.type === "step_update") {
                const step = steps.find(s => s.id === event.id);
                if (step && event.content) {
                  step.content = event.content;
                }
              } else if (event.type === "step_complete") {
                const step = steps.find(s => s.id === event.id);
                if (step) {
                  step.status = "complete";
                  if (event.result) step.result = event.result;
                }
              } else if (event.type === "sandbox_info") {
                // Store sandbox ID for future reconnection
                if (event.sandboxId) {
                  setSandboxId(event.sandboxId as string);
                }
              } else if (event.type === "done") {
                // Only set final content from 'done' event
                streamedText = event.content || "";
                // Update with previewUrl if provided
                const msgPreviewUrl = event.previewUrl as string | undefined;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: streamedText, thinkingSteps: [...steps], previewUrl: msgPreviewUrl }
                      : msg
                  )
                );
                continue; // Skip the normal update below since we just did it
              } else if (event.type === "error") {
                throw new Error(event.message);
              }

              // Update the assistant message in real-time
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: streamedText, thinkingSteps: [...steps] }
                    : msg
                )
              );
            } catch (parseError) {
              // Skip malformed JSON
            }
          }
        }
      }
      
    } catch (error) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: "Sorry, I encountered an error connecting to the agent. Please check your API key and try again." }
            : msg
        )
      );
    } finally {
      setIsTyping(false);
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

        {currentView === 'library' ? (
          <LibraryView 
            workspaces={workspaces} 
            onSelectWorkspace={handleSelectWorkspace} 
          />
        ) : (
          <>
            <main
              className={`flex-1 overflow-y-auto ${
                isInitialState ? "flex items-center justify-center py-8" : "pt-8 pb-36 px-4"
              }`}
            >
              {!isInitialState && (
                <div className="w-full max-w-3xl mx-auto space-y-4 animate-in fade-in duration-500">
                  <GameBoyScreen>
                    <div className="space-y-4">
                      {messages.filter(m => !(isInitialState && m.id === 'welcome')).map((message) => (
                        <ChatMessage key={message.id} message={message} />
                      ))}
                      {isTyping && <TypingIndicator />}
                      <div ref={messagesEndRef} />
                    </div>
                  </GameBoyScreen>
                </div>
              )}

              {isInitialState && (
                <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-3xl mx-auto space-y-6 animate-in fade-in duration-700">
                  
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gb-bg-card border border-gb-border shadow-sm text-xs font-mono font-medium text-gb-text-secondary uppercase tracking-wider">
                    <span className="text-gb-text-muted">TURN 1</span>
                    <span className="w-px h-3 bg-gb-border"></span>
                    <span className="text-gb-accent hover:underline cursor-pointer animate-pulse">ROLL DICE</span>
                  </div>

                  {/* Header - Logo & Subtitle */}
                  <div className="flex items-center gap-4 animate-in fade-in zoom-in duration-1000">
                    <div className="w-32 h-32 text-gb-text animate-float">
                      <KhadimLogo />
                    </div>
                    <p className="text-xl md:text-2xl font-mono text-gb-text-secondary tracking-wide">
                      Get started building
                    </p>
                  </div>

                  {/* Large Input Card */}
                  <div className="w-full bg-gb-bg-card border border-gb-border rounded-3xl shadow-gb-md hover:shadow-gb-lg transition-all duration-300 overflow-hidden relative group flex flex-col">
                    
                    {/* Active Badges */}
                    {activeBadges.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 px-6 pt-6 pb-2 animate-in fade-in slide-in-from-bottom-2">
                        {activeBadges.map((badge) => (
                          <div key={badge.label} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-md bg-blue-500/10 text-blue-600 border border-blue-500/20 text-sm font-medium">
                            <span className="text-base">{badge.icon}</span>
                            <span>{badge.label}</span>
                            <button 
                              onClick={() => removeBadge(badge.label)}
                              className="ml-1 p-0.5 rounded-sm hover:bg-blue-500/20 text-blue-600/60 hover:text-blue-600 transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder={activeBadges.length > 0 ? "Describe what you want..." : "Awaiting instructions..."}
                      className={`w-full bg-transparent px-6 text-lg resize-none focus:outline-none placeholder:text-gb-text-muted/50 font-mono transition-all ${activeBadges.length > 0 ? 'h-32 pt-2' : 'h-40 pt-6'}`}
                    />
                    
                    {/* Input Footer */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gb-bg-subtle/50 border-t border-gb-border/50">
                       <div className="flex items-center gap-2">
                          <button className="p-2 rounded-lg hover:bg-gb-bg-card text-gb-text-muted hover:text-gb-text transition-colors">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                          </button>
                          <button className="p-2 rounded-lg hover:bg-gb-bg-card text-gb-text-muted hover:text-gb-text transition-colors">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                          </button>
                       </div>
                       
                       <div className="flex items-center gap-2">
                         <span className="text-xs text-gb-text-muted mr-2 font-mono uppercase tracking-wide">LINK CABLE: READY</span>
                         <button 
                           onClick={handleSend}
                           disabled={!input.trim()}
                           className={`p-2 rounded-full transition-all ${
                             input.trim() 
                               ? "bg-gb-text text-gb-text-inverse hover:opacity-90" 
                               : "bg-gb-border text-gb-text-muted cursor-not-allowed"
                           }`}
                         >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                         </button>
                       </div>
                    </div>
                  </div>

                  {/* Feature Selection Chips */}
                  <FeatureSelection onSelect={handleSuggestionClick} />
                  
                </div>
              )}
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
          </>
        )}
      </div>
    </div>
  );
}
