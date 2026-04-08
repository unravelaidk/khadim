import { useEffect, useState } from "react";
import type { DetectedEditor } from "../../lib/bindings";
import { commands } from "../../lib/bindings";
import type { GeneralTabProps, ThemeFamilyOption, ThemeMode } from "./types";
import { CATPPUCCIN_VARIANTS, THEME_FAMILIES } from "./constants";

let openDialog: typeof import("@tauri-apps/plugin-dialog").open | null = null;
import("@tauri-apps/plugin-dialog").then((mod) => { openDialog = mod.open; }).catch(() => {});

export function GeneralTab({
  themeFamily,
  themeMode,
  catppuccinVariant,
  onSetThemeFamily,
  onSetThemeMode,
  onSetCatppuccinVariant,
  chatDirectory,
  onChatDirectoryChange,
}: GeneralTabProps) {
  const [picking, setPicking] = useState(false);
  const [detectedEditors, setDetectedEditors] = useState<DetectedEditor[]>([]);
  const [preferredEditor, setPreferredEditor] = useState<string | null>(null);
  const [editorLoading, setEditorLoading] = useState(true);
  const selectedFamily = THEME_FAMILIES.find((family) => family.id === themeFamily) ?? THEME_FAMILIES[0];

  // Detect editors and load preference on mount
  useEffect(() => {
    Promise.all([
      commands.detectEditors(),
      commands.getSetting("khadim:preferred_editor"),
    ])
      .then(([editors, pref]) => {
        setDetectedEditors(editors);
        setPreferredEditor(pref ?? null);
      })
      .catch(() => {})
      .finally(() => setEditorLoading(false));
  }, []);

  async function handleSetPreferredEditor(editorId: string | null) {
    setPreferredEditor(editorId);
    if (editorId) {
      await commands.setSetting("khadim:preferred_editor", editorId).catch(() => {});
    } else {
      await commands.setSetting("khadim:preferred_editor", "").catch(() => {});
    }
  }

  async function pickChatDir() {
    if (!openDialog) return;
    setPicking(true);
    try {
      const selected = await openDialog({ directory: true, multiple: false, title: "Select chat working directory" });
      if (selected && typeof selected === "string") {
        onChatDirectoryChange(selected);
      }
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Appearance</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-5">Choose your preferred theme family and mode.</p>

        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Theme Family</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {THEME_FAMILIES.map((family) => (
                <ThemeFamilyCard
                  key={family.id}
                  family={family}
                  isSelected={themeFamily === family.id}
                  onSelect={() => onSetThemeFamily(family.id)}
                  currentMode={themeMode}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Mode</p>
            <div className="flex gap-3">
              <button
                onClick={() => onSetThemeMode("dark")}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[11px] font-semibold transition-all duration-200 border ${
                  themeMode === "dark"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] border-[var(--glass-border-strong)]"
                    : "bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Dark
              </button>
              <button
                onClick={() => onSetThemeMode("light")}
                disabled={!selectedFamily.hasLightVariant}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[11px] font-semibold transition-all duration-200 border ${
                  !selectedFamily.hasLightVariant
                    ? "bg-[var(--glass-bg)] text-[var(--text-muted)] border-[var(--glass-border)] opacity-50 cursor-not-allowed"
                    : themeMode === "light"
                    ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] border-[var(--glass-border-strong)]"
                    : "bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Light
              </button>
            </div>
            {!selectedFamily.hasLightVariant && (
              <p className="text-[10px] text-[var(--text-muted)] mt-2 italic">
                {selectedFamily.label} doesn't have an official light variant. Light mode will use the default light theme.
              </p>
            )}
          </div>

          {themeFamily === "catppuccin" && (
            <CatppuccinVariantSelector
              currentMode={themeMode}
              catppuccinVariant={catppuccinVariant}
              onSetThemeMode={onSetThemeMode}
              onSetCatppuccinVariant={onSetCatppuccinVariant}
            />
          )}
        </div>
      </div>

      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Chat Directory</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Set a working directory for standalone chat mode. The agent can read, write, and list files inside this folder. When not set, the agent uses an empty temporary directory.
        </p>

        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {chatDirectory ? (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0 text-[var(--color-accent)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[11px] font-mono text-[var(--text-primary)] truncate">{chatDirectory}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-[var(--glass-border)] px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span className="text-[11px] text-[var(--text-muted)] italic">Not set — using temporary directory</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => void pickChatDir()}
              disabled={picking}
              className="h-8 px-3.5 rounded-xl btn-glass text-[11px] font-semibold flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              {picking ? "Picking..." : chatDirectory ? "Change" : "Choose folder"}
            </button>
            {chatDirectory && (
              <button
                onClick={() => onChatDirectoryChange(null)}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-bg-strong)] transition-colors"
                title="Clear chat directory"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {chatDirectory && (
          <p className="text-[10px] text-[var(--text-muted)] mt-3">
            New chat sessions will use this directory. Existing sessions keep their original directory until you start a new conversation.
          </p>
        )}
      </div>

      {/* Default Editor */}
      <div className="rounded-2xl glass-card-static p-5">
        <h2 className="text-[13px] font-bold text-[var(--text-primary)] mb-1">Default Editor</h2>
        <p className="text-[11px] text-[var(--text-muted)] mb-4">
          Choose which code editor opens files and projects from Khadim.
        </p>

        {editorLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
            <span className="inline-block w-3 h-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent dot-spinner" />
            Detecting installed editors…
          </div>
        ) : detectedEditors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--glass-border)] px-3 py-4 text-center">
            <p className="text-[11px] text-[var(--text-muted)]">No editors detected on your system.</p>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">Install an editor and ensure it's on your $PATH.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {/* Auto option */}
            <EditorOption
              id={null}
              name="Auto-detect"
              description="Use $VISUAL, $EDITOR, or first available"
              binary={null}
              isSelected={!preferredEditor}
              onSelect={() => void handleSetPreferredEditor(null)}
            />
            {detectedEditors.map((editor) => (
              <EditorOption
                key={editor.id}
                id={editor.id}
                name={editor.name}
                description={editor.binary}
                binary={editor.binary}
                isSelected={preferredEditor === editor.id}
                onSelect={() => void handleSetPreferredEditor(editor.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditorOption({
  id,
  name,
  description,
  binary,
  isSelected,
  onSelect,
}: {
  id: string | null;
  name: string;
  description: string;
  binary: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 border ${
        isSelected
          ? "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)]"
          : "border-[var(--glass-border)] bg-[var(--glass-bg)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
      }`}
    >
      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
        isSelected
          ? "border-[var(--color-accent)]"
          : "border-[var(--scrollbar-thumb)]"
      }`}>
        {isSelected && (
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent)]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-[11px] font-semibold ${
          isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}>{name}</p>
        <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">{description}</p>
      </div>
      {binary && (
        <span className="text-[9px] text-[var(--text-muted)] bg-[var(--surface-ink-5)] px-1.5 py-0.5 rounded font-mono shrink-0">
          {binary}
        </span>
      )}
    </button>
  );
}

function CatppuccinVariantSelector({
  currentMode,
  catppuccinVariant,
  onSetThemeMode,
  onSetCatppuccinVariant,
}: {
  currentMode: ThemeMode;
  catppuccinVariant: "mocha" | "macchiato" | "frappe" | "latte";
  onSetThemeMode: (mode: ThemeMode) => void;
  onSetCatppuccinVariant: (variant: "mocha" | "macchiato" | "frappe" | "latte") => void;
}) {
  const handleVariantChange = (variant: "mocha" | "macchiato" | "frappe" | "latte") => {
    onSetCatppuccinVariant(variant);
    const isDark = variant !== "latte";
    if (isDark && currentMode === "light") {
      onSetThemeMode("dark");
    } else if (!isDark && currentMode === "dark") {
      onSetThemeMode("light");
    }
  };

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-3">Catppuccin Variant</p>
      <div className="flex gap-2">
        {CATPPUCCIN_VARIANTS.map((variant) => (
          <button
            key={variant.id}
            onClick={() => handleVariantChange(variant.id)}
            className={`flex-1 py-2 px-3 rounded-xl text-[10px] font-semibold transition-all duration-200 border ${
              catppuccinVariant === variant.id
                ? "bg-[var(--surface-ink-solid)] text-[var(--text-inverse)] border-[var(--glass-border-strong)]"
                : "bg-[var(--glass-bg)] text-[var(--text-primary)] border-[var(--glass-border)] hover:bg-[var(--glass-bg-strong)] hover:border-[var(--glass-border-strong)]"
            }`}
          >
            {variant.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThemeFamilyCard({
  family,
  isSelected,
  onSelect,
  currentMode,
}: {
  family: ThemeFamilyOption;
  isSelected: boolean;
  onSelect: () => void;
  currentMode: ThemeMode;
}) {
  const isDark = currentMode === "dark";
  const previewBg = isDark ? family.previewBgDark : family.previewBgLight;
  const previewCard = isDark ? family.previewCardDark : family.previewCardLight;
  const previewText = isDark ? family.previewTextDark : family.previewTextLight;
  const previewAccent = isDark ? family.previewAccentDark : family.previewAccentLight;

  return (
    <button
      onClick={onSelect}
      className={`group relative flex flex-col rounded-2xl border-2 transition-all duration-200 overflow-hidden ${
        isSelected
          ? "border-[var(--color-accent)] shadow-[var(--shadow-glow)]"
          : "border-[var(--glass-border-strong)] hover:border-[var(--glass-border-strong)]"
      }`}
    >
      <div className="aspect-[4/3] relative overflow-hidden" style={{ background: previewBg }}>
        <div className="absolute left-0 top-0 bottom-0 w-1/3" style={{ background: previewCard }}>
          <div className="p-2 space-y-1.5">
            <div className="h-1.5 w-4 rounded opacity-40" style={{ background: previewText }} />
            <div className="h-1.5 w-5 rounded opacity-30" style={{ background: previewText }} />
            <div className="h-1.5 w-3 rounded opacity-25" style={{ background: previewText }} />
          </div>
        </div>
        <div className="absolute left-1/3 right-2 top-2 bottom-2 rounded-lg" style={{ background: previewCard, border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="p-2">
            <div className="h-1.5 w-6 rounded mb-1.5" style={{ background: previewAccent, opacity: 0.7 }} />
            <div className="h-1 w-10 rounded opacity-50" style={{ background: previewText }} />
            <div className="h-1 w-8 rounded mt-1 opacity-40" style={{ background: previewText }} />
          </div>
        </div>
        {isSelected && (
          <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: previewAccent }}>
            <svg className="w-2.5 h-2.5" fill="none" stroke={isDark ? "#000" : "#fff"} strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
        {!family.hasLightVariant && (
          <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] font-semibold" style={{ background: "rgba(0,0,0,0.5)", color: previewText }}>
            DARK ONLY
          </div>
        )}
      </div>
      <div className="p-2.5" style={{ background: "var(--surface-card)" }}>
        <p className="text-[11px] font-semibold text-[var(--text-primary)] text-left">{family.label}</p>
        <p className="text-[9px] text-[var(--text-muted)] text-left mt-0.5">{family.description}</p>
      </div>
    </button>
  );
}
