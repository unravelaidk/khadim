export interface ChatCommandDefinition {
  name: string;
  usage: string;
  description: string;
}

export const chatCommands: ChatCommandDefinition[] = [
  { name: "help", usage: "/help", description: "Show all commands" },
  { name: "sessions", usage: "/sessions", description: "List saved chats" },
  { name: "session", usage: "/session [name]", description: "Show or switch chat" },
  { name: "new", usage: "/new", description: "Start a new chat" },
  { name: "save", usage: "/save <name>", description: "Name the current chat" },
  { name: "delete", usage: "/delete <name>", description: "Delete a saved chat" },
  { name: "rename", usage: "/rename <old> <new>", description: "Rename a saved chat" },
  { name: "theme", usage: "/theme", description: "Open the searchable theme library" },
  { name: "provider", usage: "/provider [id]", description: "Show or switch provider" },
  { name: "model", usage: "/model [id|name]", description: "Show or switch model" },
  { name: "harness", usage: "/harness [id|name]", description: "Show or switch capability" },
  { name: "multi-agent", usage: "/multi-agent [on|off]", description: "Toggle native multi-agent mode" },
  { name: "multi", usage: "/multi", description: "Alias for /multi-agent" },
  { name: "login", usage: "/login [copilot|codex]", description: "Open authentication guidance" },
  { name: "settings", usage: "/settings", description: "Open desktop settings" },
  { name: "providers", usage: "/providers", description: "List configured providers" },
  { name: "reset", usage: "/reset", description: "Reset the current chat context" },
  { name: "copy", usage: "/copy", description: "Copy or repeat the last response" },
  { name: "export", usage: "/export", description: "Export the current conversation" },
  { name: "system", usage: "/system <prompt>", description: "Set the channel system prompt" },
  { name: "tokens", usage: "/tokens", description: "Show token usage" },
  { name: "history", usage: "/history", description: "Show recent prompts" },
  { name: "clear-history", usage: "/clear-history", description: "Clear local input history" },
  { name: "config", usage: "/config", description: "Show active configuration" },
  { name: "version", usage: "/version", description: "Show Khadim version" },
  { name: "refresh-models", usage: "/refresh-models", description: "Refresh the model catalog" },
];

export interface ParsedChatCommand {
  name: string;
  argument: string;
}

export function parseChatCommand(input: string): ParsedChatCommand | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const match = trimmed.match(/^\/([a-z-]+)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!chatCommands.some((command) => command.name === name)) return null;
  return { name, argument: match[2]?.trim() ?? "" };
}

export function commandHelp(): string {
  return chatCommands.map((command) => `**${command.usage}** - ${command.description}`).join("\n");
}
