import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "tiptap-markdown";
import { common, createLowlight } from "lowlight";
import {
  LuBold,
  LuItalic,
  LuUnderline,
  LuStrikethrough,
  LuCode,
  LuHighlighter,
  LuHeading1,
  LuHeading2,
  LuHeading3,
  LuList,
  LuListOrdered,
  LuListChecks,
  LuQuote,
  LuMinus,
  LuLink,
  LuUnlink,
  LuImage,
  LuFileCode,
  LuUndo2,
  LuRedo2,
  LuEye,
  LuPenLine,
  LuColumns2,
} from "react-icons/lu";

const lowlight = createLowlight(common);

/* ── Types ─────────────────────────────────────────────────────────── */

type ViewMode = "write" | "preview" | "split";

interface MarkdownEditorProps {
  initialContent: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

/* ── Toolbar Button ────────────────────────────────────────────────── */

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        inline-flex h-7 w-7 items-center justify-center rounded-md text-xs transition-all duration-150
        ${isActive
          ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow-[var(--shadow-glow-accent)]"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-card)]"
        }
        disabled:opacity-30 disabled:cursor-not-allowed
      `}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-1 h-4 w-px bg-[var(--glass-border)]" />;
}

/* ── Toolbar Group Label ───────────────────────────────────────────── */

function ToolbarGroup({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

/* ── Toolbar ───────────────────────────────────────────────────────── */

function EditorToolbar({
  editor,
  viewMode,
  onViewModeChange,
}: {
  editor: Editor;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const addLink = useCallback(() => {
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    const url = window.prompt("Image URL");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* History */}
      <ToolbarGroup>
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo (Ctrl+Z)">
          <LuUndo2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo (Ctrl+Shift+Z)">
          <LuRedo2 className="w-3.5 h-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Headings */}
      <ToolbarGroup>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <LuHeading1 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <LuHeading2 className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <LuHeading3 className="w-3.5 h-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Inline formatting */}
      <ToolbarGroup>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title="Bold (Ctrl+B)">
          <LuBold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title="Italic (Ctrl+I)">
          <LuItalic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive("underline")} title="Underline (Ctrl+U)">
          <LuUnderline className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive("strike")} title="Strikethrough">
          <LuStrikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive("code")} title="Inline code">
          <LuCode className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive("highlight")} title="Highlight">
          <LuHighlighter className="w-3.5 h-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarGroup>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title="Bullet list">
          <LuList className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} title="Ordered list">
          <LuListOrdered className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive("taskList")} title="Task list">
          <LuListChecks className="w-3.5 h-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarGroup>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive("blockquote")} title="Blockquote">
          <LuQuote className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} isActive={editor.isActive("codeBlock")} title="Code block">
          <LuFileCode className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <LuMinus className="w-3.5 h-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      <ToolbarDivider />

      {/* Links & media */}
      <ToolbarGroup>
        <ToolbarButton onClick={addLink} isActive={editor.isActive("link")} title="Add link">
          <LuLink className="w-3.5 h-3.5" />
        </ToolbarButton>
        {editor.isActive("link") && (
          <ToolbarButton onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            <LuUnlink className="w-3.5 h-3.5" />
          </ToolbarButton>
        )}
        <ToolbarButton onClick={addImage} title="Add image">
          <LuImage className="w-3.5 h-3.5" />
        </ToolbarButton>
      </ToolbarGroup>

      {/* Spacer */}
      <div className="flex-1" />

      {/* View mode toggle */}
      <div className="flex rounded-lg overflow-hidden border border-[var(--glass-border)] bg-[var(--surface-card)]/40">
        {([
          { mode: "write" as const, icon: LuPenLine, label: "Write" },
          { mode: "split" as const, icon: LuColumns2, label: "Split" },
          { mode: "preview" as const, icon: LuEye, label: "Preview" },
        ]).map(({ mode, icon: Icon, label }) => (
          <button
            key={mode}
            onClick={() => onViewModeChange(mode)}
            className={`relative p-1.5 px-2.5 text-[11px] flex items-center gap-1.5 font-medium tracking-wide transition-all duration-150 ${
              viewMode === mode
                ? "bg-[var(--surface-elevated)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
            title={label}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Markdown Preview ──────────────────────────────────────────────── */

function MarkdownPreviewPane({ editor }: { editor: Editor }) {
  const [md, setMd] = useState("");

  useEffect(() => {
    const update = () => {
      setMd(editor.storage.markdown.getMarkdown());
    };
    update();
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [editor]);

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-6 py-5">
      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[var(--text-secondary)]">
        {md}
      </pre>
    </div>
  );
}

/* ── Word Count ────────────────────────────────────────────────────── */

function WordCount({ editor }: { editor: Editor }) {
  const [stats, setStats] = useState({ words: 0, chars: 0 });

  useEffect(() => {
    const update = () => {
      const text = editor.state.doc.textContent;
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      setStats({ words, chars: text.length });
    };
    update();
    editor.on("update", update);
    return () => { editor.off("update", update); };
  }, [editor]);

  return (
    <div className="flex items-center gap-3 text-[11px] tabular-nums font-mono">
      <span className="text-[var(--text-muted)]">{stats.words} words</span>
      <span className="text-[var(--text-muted)]/60">·</span>
      <span className="text-[var(--text-muted)]">{stats.chars} chars</span>
    </div>
  );
}

/* ── Main Editor Component ─────────────────────────────────────────── */

export function MarkdownEditor({
  initialContent,
  onChange,
  placeholder = "Start writing...",
  readOnly = false,
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("write");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3, 4] },
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "editor-link" },
      }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      Image.configure({ inline: false }),
      CodeBlockLowlight.configure({ lowlight }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialContent,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "md-editor-content",
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange?.(ed.storage.markdown.getMarkdown());
    },
  });

  if (!editor) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />
          <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium">Loading editor…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      {!readOnly && (
        <div className="shrink-0 border-b border-[var(--glass-border)] bg-[var(--surface-elevated)]/60 px-3 py-2">
          <EditorToolbar editor={editor} viewMode={viewMode} onViewModeChange={setViewMode} />
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* WYSIWYG pane */}
        {(viewMode === "write" || viewMode === "split") && (
          <div
            className={`overflow-y-auto overscroll-contain ${
              viewMode === "split" ? "w-1/2 border-r border-[var(--glass-border)]" : "w-full"
            }`}
          >
            <EditorContent editor={editor} className="h-full" />
          </div>
        )}

        {/* Markdown source preview */}
        {(viewMode === "preview" || viewMode === "split") && (
          <div className={`overflow-hidden flex flex-col ${viewMode === "split" ? "w-1/2" : "w-full"}`}>
            {viewMode === "split" && (
              <div className="shrink-0 px-4 py-2 border-b border-[var(--glass-border)] bg-[var(--surface-elevated)]/40">
                <span className="text-[10px] uppercase tracking-[0.16em] font-semibold text-[var(--text-muted)]">
                  Markdown source
                </span>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <MarkdownPreviewPane editor={editor} />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      {!readOnly && (
        <div className="shrink-0 flex items-center justify-between border-t border-[var(--glass-border)] px-4 py-1.5 bg-[var(--surface-elevated)]/40">
          <WordCount editor={editor} />
          <span className="text-[10px] uppercase tracking-[0.14em] font-semibold text-[var(--text-muted)]/60">Markdown</span>
        </div>
      )}
    </div>
  );
}

export default MarkdownEditor;
