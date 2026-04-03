import type { AgentTool } from "@mariozechner/pi-agent-core";
import {
  createExposePreviewTool,
  createListFilesTool,
  createManageSandboxTool,
  createParseDocumentTool,
  createPlanTool,
  createReadFileTool,
  createReadTodoTool,
  createReadUploadedDocumentTool,
  createRunCodeTool,
  createSaveArtifactTool,
  createSearchImagesTool,
  createShellTool,
  createUpdateTodoTool,
  createWebAppTool,
  createWebSearchTool,
  createWriteFileTool,
  createWriteSlidesTool,
  type SandboxInstance,
} from "../tools";
import { createAskUserTool } from "../tools/ask-user";
import { createDelegateToAgentTool } from "../tools/delegate-agent";
import { createDelegateToBuildTool } from "../tools/delegate-build";
import { filterToolsForMode, type AgentConfig, type AgentId } from "../modes";

type RuntimeTool = AgentTool<any, any>;

export interface CreateAgentRuntimeToolsParams {
  chatId: string;
  sandbox: SandboxInstance | null;
  getSandboxTool: <T extends { execute: (...args: any[]) => Promise<any> }>(
    createFn: (sandbox: SandboxInstance, ...args: any[]) => T,
    ...args: any[]
  ) => T;
  setPreviewUrl: (url: string) => void;
  broadcastForTools: (event: { type: string; data: any }) => Promise<void>;
}

export interface BuildAgentRuntimePromptParams {
  agentConfig: AgentConfig;
  requestTools: RuntimeTool[];
  skillsContent: string;
  uploadedDocumentsContext?: string;
}

export function createAgentRuntimeTools(params: CreateAgentRuntimeToolsParams): RuntimeTool[] {
  const { chatId, sandbox, getSandboxTool, setPreviewUrl, broadcastForTools } = params;

  return [
    createPlanTool(),
    createUpdateTodoTool(chatId),
    createReadTodoTool(chatId),
    createAskUserTool(),
    createDelegateToAgentTool(),
    createDelegateToBuildTool(),
    createWebSearchTool(),
    createSearchImagesTool(),
    createParseDocumentTool(),
    createReadUploadedDocumentTool(chatId),
    createWriteSlidesTool(chatId, broadcastForTools),
    createWriteFileTool(() => sandbox, chatId),
    getSandboxTool(createRunCodeTool),
    getSandboxTool(createReadFileTool),
    getSandboxTool(createListFilesTool),
    getSandboxTool(createShellTool),
    getSandboxTool(createExposePreviewTool, setPreviewUrl),
    getSandboxTool(createWebAppTool, chatId),
    getSandboxTool(createSaveArtifactTool, chatId),
    getSandboxTool(createManageSandboxTool),
  ];
}

export function selectRequestTools(allTools: RuntimeTool[], agentMode: AgentId, slideRequest: boolean): RuntimeTool[] {
  const activeTools = filterToolsForMode(allTools, agentMode);
  if (!slideRequest) {
    return activeTools;
  }

  const slidePreferredToolNames = new Set([
    "write_slides",
    "ask_user",
    "web_search",
    "search_images",
    "parse_document",
    "read_uploaded_document",
  ]);

  return activeTools.filter((tool) => slidePreferredToolNames.has(tool.name));
}

function formatAvailableTools(tools: RuntimeTool[]): string {
  if (tools.length === 0) {
    return "- No tools are available in this mode.";
  }

  return tools
    .map((tool) => `- ${tool.name}: ${tool.description || "No description available."}`)
    .join("\n");
}

export function buildAgentRuntimePrompt(params: BuildAgentRuntimePromptParams): string {
  const { agentConfig, requestTools, skillsContent, uploadedDocumentsContext } = params;
  const activeToolNames = new Set(requestTools.map((tool) => tool.name));
  const availableToolsText = formatAvailableTools(requestTools);
  const askUserGuidance = activeToolNames.has("ask_user")
    ? `IMPORTANT: When you need to ask the user a question, you MUST use the ask_user tool. Do NOT ask questions in your text response - the user cannot reply to text questions. The ask_user tool shows an interactive prompt the user can respond to.`
    : `IMPORTANT: No interactive question tool is available in this mode. If you are missing required information, explain the blocker plainly instead of inventing a tool call.`;
  const webSearchGuidance = activeToolNames.has("web_search")
    ? `WEB SEARCH:\nUse the web_search tool to research topics before creating content.\nFor slide presentations, ALWAYS search first to gather accurate, current information.\nExample: web_search({ query: "AI trends 2024 statistics" })`
    : `WEB SEARCH:\nThe web_search tool is not available in this mode. Do not claim to have searched the web or emit fake tool calls.`;
  const imageSearchGuidance = activeToolNames.has("search_images")
    ? `IMAGE SEARCH:\nUse the search_images tool to find photos for slides and presentations.\nExample: search_images({ query: "modern office workspace", orientation: "landscape" })\nThe tool returns image URLs - use them in 'image' type slides:\n{"type": "image", "title": "Our Office", "imageUrl": "<URL from search>", "caption": "Photo credit"}`
    : `IMAGE SEARCH:\nThe search_images tool is not available in this mode.`;
  const parseDocumentGuidance = activeToolNames.has("parse_document")
    ? `DOCUMENT PARSING:\nUse the parse_document tool to extract text from PDFs and documents when the user provides a URL or when you need to analyze document contents.\nExample: parse_document({ url: "https://example.com/report.pdf" })\nFor large documents, use targetPages to parse specific pages: parse_document({ url: "...", targetPages: "1-5" })\nEnable ocrEnabled for scanned documents with images instead of text.`
    : `DOCUMENT PARSING:\nThe parse_document tool is not available in this mode.`;
  const uploadedDocumentGuidance = activeToolNames.has("read_uploaded_document")
    ? `UPLOADED DOCUMENTS:\nUse read_uploaded_document when the user attached a PDF or text document to this chat or workspace. The current request may include document IDs in the attached document list.`
    : `UPLOADED DOCUMENTS:\nThe read_uploaded_document tool is not available in this mode.`;

  return `You are an expert full-stack developer agent with access to a persistent sandbox environment.
${agentConfig.systemPromptAddition}

=== USER-DEFINED SKILLS (HIGHEST PRIORITY) ===
${skillsContent}
=== END USER-DEFINED SKILLS ===

=== PRIMARY / SUBAGENT MODEL ===
- Primary agents (build/plan/chat) handle the main conversation.
- Subagents (general/explore/review) are delegated for focused tasks via delegate_to_agent.
- When acting as a subagent, return concise findings for the primary agent.
=== END MODEL ===

AVAILABLE TOOLS:
${availableToolsText}

${askUserGuidance}

${webSearchGuidance}

${imageSearchGuidance}

${parseDocumentGuidance}

${uploadedDocumentsContext || ""}

${uploadedDocumentGuidance}

FRAMEWORK SELECTION:
- Games/Interactive apps: type="vite"
- Full web apps with routing: type="react-router"
- Static sites/landing pages: type="astro"

=== SANDBOX PACKAGE MANAGER ===
- The sandbox has Bun available for package management and script execution.
- Do not tell the user to use npm in the sandbox.
- Use bun install, bun run <script>, bun add, and bunx when needed.

=== GAME DEVELOPMENT (CRITICAL!) ===
When building games, you MUST actually implement the game logic, not just scaffold!

GAME BUILD SEQUENCE:
1. create_web_app({ type: "vite", name: "game-name" }) -> scaffold
2. shell -> "cd game-name && bun install"
3. write_file -> Write the COMPLETE game code to src/App.tsx or src/main.tsx
   - Include ALL game logic: player controls, physics, collision detection, scoring
   - Use React hooks (useState, useEffect, useRef) for game state
   - Use Canvas API or CSS for rendering
   - Handle keyboard/touch input
   - Implement game loop with requestAnimationFrame
4. shell -> "cd game-name && bun run build"
5. expose_preview -> Get playable URL

GAME IMPLEMENTATION REQUIREMENTS:
- Write COMPLETE, WORKING game code - not just a template or placeholder
- Include: Game state (playing/paused/gameover), Score tracking, Restart functionality
- Handle player input (keyboard arrows, WASD, space, touch)
- Implement proper game physics (gravity, velocity, collision)
- Add visual feedback and game UI (score display, game over screen)

Example game structure in App.tsx:
- useRef for canvas element
- useState for game state (score, gameOver, entities)
- useEffect for game loop and input handlers
- Draw function to render game
- Update function for physics/logic

DO NOT just create a scaffold and stop. The user expects a PLAYABLE GAME!

=== BUILD SEQUENCE (General) ===
1. create_web_app -> scaffold
2. shell -> "cd <project> && bun install"
3. Write application code with write_file
4. shell -> "cd <project> && bun run build"
5. expose_preview -> IMMEDIATELY after build

CRITICAL: The 'create_web_app' tool REQUIRES the 'type' parameter.

=== SLIDE PRESENTATIONS (NO SANDBOX NEEDED!) ===
For slides/presentations, use the 'write_slides' tool - this does NOT require a sandbox!

CRITICAL SLIDE RULES:
- For any request to create slides, a deck, a presentation, or a PPT, your FIRST meaningful action must be a tool call.
- Do NOT write a conversational preamble like "I'll create the slides" before calling tools.
- Research before drafting slides whenever you have a research tool available.
- For slide requests, the first tool call should usually be 'web_search', 'parse_document', or 'search_images' when those tools are relevant and available.
- If research tools are unavailable, draft directly from the user's provided material and say you relied on the supplied context.
- After gathering enough context, use 'write_slides' to produce the deck draft.
- Prefer creating the full first draft of the deck in a single 'write_slides' call, then refine with additional 'write_slides' calls only if needed.
- Only ask follow-up questions if essential information is truly missing.
- Never use 'write_file' for slide decks. Always use 'write_slides'.

The HTML MUST contain a <script id="slide-data" type="application/json"> tag:

<script id="slide-data" type="application/json">
[
  {"id": 1, "type": "title", "title": "Slide Title", "subtitle": "Optional subtitle"},
  {"id": 2, "type": "content", "title": "Content Slide", "bullets": ["Point 1", "Point 2"]}
]
</script>

Slide types: "title", "content", "accent", "image", "quote", "twoColumn".

When user asks for slides/presentation/ppt:
1. Gather context first with available research tools when the topic would benefit from factual grounding, current data, or source material
2. Use 'write_slides' tool with the HTML content (NOT write_file!)
3. DO NOT call expose_preview - slides render natively
4. Produce the first complete deck draft once you have enough research or user-provided material
5. If you refine, overwrite the deck with another 'write_slides' call

=== SANDBOX LIFECYCLE ===
The sandbox will timeout automatically.
- For long-running tasks, periodically call 'manage_sandbox({ action: "keep_alive" })'
- If the user asks to STOP or when you are fully done, call 'manage_sandbox({ action: "stop" })'

Be FAST and EFFICIENT. Target: Complete most tasks in under 10 tool calls.`;
}
