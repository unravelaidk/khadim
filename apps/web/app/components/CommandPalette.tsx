import { useEffect, useMemo, useRef, useState } from "react";
import { LuFolderKanban, LuMessageSquarePlus, LuSearch, LuSettings2, LuX } from "react-icons/lu";

export interface CommandPaletteAction {
  id: string;
  label: string;
  description: string;
  keywords?: string[];
  run: () => void;
}

export interface CommandPaletteResource {
  id: string;
  title: string | null;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: CommandPaletteAction[];
}

export function createShellCommandActions(actions: {
  newChat: () => void;
  showChats: () => void;
  showProjects: () => void;
  showSettings: () => void;
}): CommandPaletteAction[] {
  return [
    {
      id: "new-chat",
      label: "New chat",
      description: "Start a fresh conversation",
      keywords: ["create", "conversation"],
      run: actions.newChat,
    },
    {
      id: "show-chats",
      label: "Go to chats",
      description: "Open the chat workspace",
      keywords: ["home", "conversation"],
      run: actions.showChats,
    },
    {
      id: "show-projects",
      label: "Go to projects",
      description: "Open projects and their files",
      keywords: ["workspace", "files"],
      run: actions.showProjects,
    },
    {
      id: "show-settings",
      label: "Open settings",
      description: "Configure models and providers",
      keywords: ["model", "provider", "configuration"],
      run: actions.showSettings,
    },
  ];
}

export function createResourceCommandActions(resources: {
  chats: CommandPaletteResource[];
  projects: CommandPaletteResource[];
  openChat: (id: string) => void;
  openProject: (id: string) => void;
}): CommandPaletteAction[] {
  return [
    ...resources.chats.map((chat) => ({
      id: `chat:${chat.id}`,
      label: chat.title?.trim() || "Untitled chat",
      description: "Open chat",
      keywords: ["chat", "conversation"],
      run: () => resources.openChat(chat.id),
    })),
    ...resources.projects.map((project) => ({
      id: `project:${project.id}`,
      label: project.title?.trim() || "Untitled project",
      description: "Open project",
      keywords: ["project", "workspace", "files"],
      run: () => resources.openProject(project.id),
    })),
  ];
}

const actionIcons = {
  "new-chat": LuMessageSquarePlus,
  "show-chats": LuSearch,
  "show-projects": LuFolderKanban,
  "show-settings": LuSettings2,
} as const;

export function filterCommandActions(actions: CommandPaletteAction[], query: string): CommandPaletteAction[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return actions;

  return actions.filter((action) => (
    [action.label, action.description, ...(action.keywords ?? [])]
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized)
  ));
}

export function CommandPalette({ open, onOpenChange, actions }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const filteredActions = useMemo(() => filterCommandActions(actions, query), [actions, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      if (returnFocusTo?.isConnected) returnFocusTo.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, filteredActions.length - 1)));
  }, [filteredActions.length]);

  if (!open) return null;

  const runAction = (action: CommandPaletteAction) => {
    onOpenChange(false);
    action.run();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/25 px-4 pt-[12vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <section
        ref={dialogRef}
        aria-label="Command palette"
        aria-modal="true"
        className="glass-panel-strong w-full max-w-xl overflow-hidden rounded-[1.5rem] border border-[var(--glass-border-strong)] shadow-2xl"
        role="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onOpenChange(false);
          } else if (event.key === "ArrowDown" && filteredActions.length > 0) {
            event.preventDefault();
            setActiveIndex((index) => (index + 1) % filteredActions.length);
          } else if (event.key === "ArrowUp" && filteredActions.length > 0) {
            event.preventDefault();
            setActiveIndex((index) => (index - 1 + filteredActions.length) % filteredActions.length);
          } else if (event.key === "Enter" && filteredActions[activeIndex]) {
            event.preventDefault();
            runAction(filteredActions[activeIndex]);
          } else if (event.key === "Tab") {
            const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
            ) ?? []);
            const first = focusable[0];
            const last = focusable.at(-1);
            if (event.shiftKey && document.activeElement === first && last) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last && first) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <div className="flex items-center gap-3 border-b border-[var(--glass-border)] px-4">
          <LuSearch aria-hidden="true" className="h-5 w-5 text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            className="min-w-0 flex-1 bg-transparent py-4 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            placeholder="Search Khadim commands"
            aria-label="Search commands"
            role="combobox"
            aria-controls="khadim-command-results"
            aria-expanded="true"
            aria-activedescendant={filteredActions[activeIndex] ? `khadim-command-${filteredActions[activeIndex].id}` : undefined}
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            aria-label="Close command palette"
          >
            <LuX className="h-4 w-4" />
          </button>
        </div>

        <div id="khadim-command-results" role="listbox" className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
          {filteredActions.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">No matching commands</p>
          ) : filteredActions.map((action, index) => {
            const Icon = actionIcons[action.id as keyof typeof actionIcons] ?? LuSearch;
            return (
              <button
                id={`khadim-command-${action.id}`}
                key={action.id}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runAction(action)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                  activeIndex === index
                    ? "bg-[#10150a] text-[var(--text-inverse)]"
                    : "text-[var(--text-primary)] hover:bg-[var(--glass-bg-strong)]"
                }`}
                role="option"
                aria-selected={activeIndex === index}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{action.label}</span>
                  <span className={`block truncate text-xs ${activeIndex === index ? "text-white/65" : "text-[var(--text-muted)]"}`}>
                    {action.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <footer className="flex items-center justify-between border-t border-[var(--glass-border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          <span>↑↓ navigate · ↵ select · esc close</span>
          <kbd className="rounded-md border border-[var(--glass-border)] px-1.5 py-0.5">Ctrl/⌘ K</kbd>
        </footer>
      </section>
    </div>
  );
}
