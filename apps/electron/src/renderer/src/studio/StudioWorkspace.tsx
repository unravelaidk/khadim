import {
  ArrowLeft,
  ArrowCounterClockwise,
  ChatCircleDots,
  TextB,
  Code,
  Eye,
  FileCode,
  FileText,
  GlobeHemisphereWest,
  Monitor,
  NotePencil,
  ListBullets,
  Selection,
  SidebarSimple,
  TextHOne,
  TextHTwo,
  TextItalic,
  TextT,
  WarningCircle,
} from "@phosphor-icons/react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { renderHtmlDocument } from "../../../shared/artifact-export";
import type { Artifact, ArtifactContent, DocumentArtifactContent, HtmlDocumentArtifactContent, SiteArtifactContent, VisualDocumentData, WebProjectArtifactContent } from "../../../shared/types";
import { BrowserPreview, type ExecutablePreviewState } from "./BrowserPreview";
import { CanvasEditor } from "./CanvasEditor";
import { applyVisualDocument, updateWebProjectFile, webProjectStyles } from "./web-project";

type SaveState = "loading" | "saved" | "dirty" | "saving" | "error";
type SiteView = "design" | "code" | "preview" | "split";
type DocumentView = "write" | "source" | "preview" | "split";

const MonacoCodeEditor = lazy(() => import("./MonacoCodeEditor"));
const PuckVisualEditor = lazy(() => import("./PuckSurface").then((module) => ({ default: module.PuckVisualEditor })));

interface StudioWorkspaceProps {
  artifact: Artifact;
  saveState: SaveState;
  agentName?: string;
  modelName?: string;
  agentAvailable?: boolean;
  agentBusy?: boolean;
  agentStatus?: StudioAgentStatus | null;
  onChange: (artifact: Artifact, flush?: boolean) => void;
  onRetrySave?: () => void;
  onClose: () => void;
  onExportPdf: () => void;
  onAskAgent?: (instruction: string) => Promise<boolean>;
  onAskCanvasAgent?: (instruction: string, selection: { pageId: string; elementIds: string[] }) => Promise<boolean>;
  /** Whether the main project chat pane is shown beside Studio. Only canvas artifacts can hide it. */
  studioChatVisible?: boolean;
  /** True when the artifact is a khadim-canvas and may toggle the main chat pane. */
  canToggleStudioChat?: boolean;
  /** Toggle the main project chat pane visibility for the current canvas artifact. */
  onToggleStudioChat?: () => void;
}

export interface StudioAgentStatus {
  phase: "starting" | "running" | "complete" | "error";
  message?: string;
}

const kindLabels = { document: "Document", site: "Website", canvas: "Canvas" } as const;

function saveLabel(state: SaveState): string {
  if (state === "error") return "Changes not saved";
  if (state === "dirty") return "Unsaved changes";
  if (state === "saving" || state === "loading") return "Saving…";
  return "Saved on this device";
}

function textFromDocument(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(textFromDocument).filter(Boolean).join("\n");
}

function documentFromText(value: string): Record<string, unknown> {
  return {
    type: "doc",
    content: value.split(/\n+/).map((text) => ({
      type: "paragraph",
      content: text ? [{ type: "text", text }] : [],
    })),
  };
}

function updateContent(artifact: Artifact, content: ArtifactContent): Artifact {
  return { ...artifact, lifecycle: "draft", content, updatedAt: new Date().toISOString() };
}

function DocumentEditor({ artifact, content, onChange }: { artifact: Artifact; content: DocumentArtifactContent; onChange: StudioWorkspaceProps["onChange"] }): React.JSX.Element {
  const [text, setText] = useState(() => textFromDocument(content.document));
  useEffect(() => setText(textFromDocument(content.document)), [artifact.id, content.document]);

  function edit(next: string): void {
    setText(next);
    onChange(updateContent(artifact, { ...content, document: documentFromText(next) }));
  }

  return (
    <div className="studio-editor-layout document-layout">
      <aside className="studio-toolrail" aria-label="Document tools">
        <button className="active" type="button" aria-label="Write"><NotePencil size={18} /></button>
        <button type="button" aria-label="Text styles"><TextT size={18} /></button>
      </aside>
      <main className="document-stage">
        <div className="document-page" style={{ padding: `${content.page.margin}px` }}>
          <textarea value={text} onChange={(event) => edit(event.target.value)} aria-label="Document content" spellCheck />
        </div>
      </main>
      <aside className="studio-inspector" aria-label="Document settings">
        <header><SidebarSimple size={16} /><strong>Page</strong></header>
        <label>Size<select value={content.page.size} onChange={(event) => onChange(updateContent(artifact, { ...content, page: { ...content.page, size: event.target.value as "A4" | "Letter" } }))}><option>A4</option><option>Letter</option></select></label>
        <label>Orientation<select value={content.page.orientation} onChange={(event) => onChange(updateContent(artifact, { ...content, page: { ...content.page, orientation: event.target.value as "portrait" | "landscape" } }))}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        <p>Structured text stays editable and can be rendered consistently for PDF.</p>
      </aside>
    </div>
  );
}

type DocumentCommand = "bold" | "italic" | "formatBlock" | "insertUnorderedList" | "undo";

function EditableDocumentFrame({ title, html, page, onChange }: { title: string; html: string; page: HtmlDocumentArtifactContent["page"]; onChange: (html: string) => void }): React.JSX.Element {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const onChangeRef = useRef(onChange);
  const lastLocalHtmlRef = useRef<string | null>(null);
  const incomingHtmlRef = useRef(html);
  const captureRef = useRef<() => void>(() => undefined);
  const [frameHtml, setFrameHtml] = useState(html);
  const [frameRevision, setFrameRevision] = useState(0);
  const [ready, setReady] = useState(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    // A parent render after local typing is an acknowledgement, not a reason to
    // reload the iframe and destroy the selection. A different value is an
    // external revision (for example, an agent edit) and must replace the page.
    if (html === incomingHtmlRef.current) return;
    incomingHtmlRef.current = html;
    if (html === lastLocalHtmlRef.current) return;
    setReady(false);
    setFrameHtml(html);
    setFrameRevision((current) => current + 1);
  }, [html]);

  function connect(): (() => void) | undefined {
    const document = frameRef.current?.contentDocument;
    if (!document?.body) return;
    document.designMode = "on";
    document.body.spellcheck = true;
    document.body.setAttribute("aria-label", "Document page");
    const capture = (): void => {
      const doctype = document.doctype ? `<!doctype ${document.doctype.name}>\n` : "<!doctype html>\n";
      const nextHtml = `${doctype}${document.documentElement.outerHTML}`;
      lastLocalHtmlRef.current = nextHtml;
      onChangeRef.current(nextHtml);
    };
    captureRef.current = capture;
    document.addEventListener("input", capture);
    setReady(true);
    return () => {
      captureRef.current = () => undefined;
      document.removeEventListener("input", capture);
    };
  }

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let disconnect: (() => void) | undefined;
    const loaded = (): void => { disconnect?.(); disconnect = connect(); };
    frame.addEventListener("load", loaded);
    if (frame.contentDocument?.readyState === "complete") loaded();
    return () => { frame.removeEventListener("load", loaded); disconnect?.(); };
  }, [frameRevision]);

  function command(name: DocumentCommand, value?: string): void {
    const document = frameRef.current?.contentDocument;
    if (!document) return;
    document.execCommand(name, false, value);
    captureRef.current();
    frameRef.current?.contentWindow?.focus();
  }

  const portrait = page.orientation === "portrait";
  const pageWidth = page.size === "A4" ? (portrait ? 794 : 1123) : (portrait ? 816 : 1056);
  const pageHeight = page.size === "A4" ? (portrait ? 1123 : 794) : (portrait ? 1056 : 816);

  return (
    <main className="html-document-stage">
      <div className="document-formatbar" role="toolbar" aria-label="Document formatting">
        <button type="button" aria-label="Undo" title="Undo" disabled={!ready} onClick={() => command("undo")}><ArrowCounterClockwise size={15} /></button>
        <span />
        <button type="button" aria-label="Heading 1" title="Heading 1" disabled={!ready} onClick={() => command("formatBlock", "h1")}><TextHOne size={16} /></button>
        <button type="button" aria-label="Heading 2" title="Heading 2" disabled={!ready} onClick={() => command("formatBlock", "h2")}><TextHTwo size={16} /></button>
        <button type="button" aria-label="Bold" title="Bold" disabled={!ready} onClick={() => command("bold")}><TextB size={16} /></button>
        <button type="button" aria-label="Italic" title="Italic" disabled={!ready} onClick={() => command("italic")}><TextItalic size={16} /></button>
        <button type="button" aria-label="Bulleted list" title="Bulleted list" disabled={!ready} onClick={() => command("insertUnorderedList")}><ListBullets size={16} /></button>
        <small>Click the page and type</small>
      </div>
      <div className="html-document-canvas">
        <div className="html-document-page" style={{ width: pageWidth, minHeight: pageHeight }}>
          <iframe key={frameRevision} ref={frameRef} title={`${title} editable page`} srcDoc={frameHtml} sandbox="allow-same-origin" />
        </div>
      </div>
    </main>
  );
}

function DocumentTabs({ view, onChange }: { view: DocumentView; onChange: (view: DocumentView) => void }): React.JSX.Element {
  return (
    <div role="tablist" aria-label="Document editor view">
      <button type="button" role="tab" aria-selected={view === "write"} onClick={() => onChange("write")}><NotePencil size={15} /> Write</button>
      <button type="button" role="tab" aria-selected={view === "source"} onClick={() => onChange("source")}><Code size={15} /> Source</button>
      <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => onChange("preview")}><Eye size={15} /> Preview</button>
      <button type="button" role="tab" aria-selected={view === "split"} onClick={() => onChange("split")}><Monitor size={15} /> Split</button>
    </div>
  );
}

function HtmlDocumentEditor({ artifact, content, onChange }: { artifact: Artifact; content: HtmlDocumentArtifactContent; onChange: StudioWorkspaceProps["onChange"] }): React.JSX.Element {
  const [view, setView] = useState<DocumentView>("write");
  const [html, setHtml] = useState(content.html);
  useEffect(() => setHtml(content.html), [artifact.id, content.html]);

  function edit(next: string): void {
    setHtml(next);
    onChange(updateContent(artifact, { ...content, html: next }));
  }

  function setPage(patch: Partial<HtmlDocumentArtifactContent["page"]>): void {
    onChange(updateContent(artifact, { ...content, html, page: { ...content.page, ...patch } }));
  }

  const source = <CodeWorkspace files={{ "/document.html": html }} selected="/document.html" onSelect={() => undefined} onEdit={(_path, value) => edit(value)} />;
  const preview = <BrowserPreview title={artifact.title} html={renderHtmlDocument({ ...content, html })} />;
  const wordCount = useMemo(() => {
    const body = new DOMParser().parseFromString(html, "text/html").body;
    const text = body.innerText || body.textContent || "";
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }, [html]);
  const customMargin = ![16, 24, 32].includes(content.page.margin);

  return (
    <div className="studio-site-shell document-html-shell">
      <div className="studio-contextbar">
        <DocumentTabs view={view} onChange={setView} />
        <div className="document-page-controls" aria-label="Page settings">
          <span className="document-word-count">{wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}</span>
          <label><span>Size</span><select aria-label="Page size" value={content.page.size} onChange={(event) => setPage({ size: event.target.value as "A4" | "Letter" })}><option>A4</option><option>Letter</option></select></label>
          <label><span>Layout</span><select aria-label="Page orientation" value={content.page.orientation} onChange={(event) => setPage({ orientation: event.target.value as "portrait" | "landscape" })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label><span>Margin</span><select aria-label="Page margin" value={content.page.margin} onChange={(event) => setPage({ margin: Number(event.target.value) })}>{customMargin && <option value={content.page.margin}>Custom ({content.page.margin} mm)</option>}<option value={16}>Narrow</option><option value={24}>Normal</option><option value={32}>Wide</option></select></label>
        </div>
      </div>
      <div className={`studio-document-surface view-${view}`}>
        {view === "write" && <EditableDocumentFrame title={artifact.title} html={html} page={content.page} onChange={edit} />}
        {view === "source" && source}
        {view === "preview" && preview}
        {view === "split" && <>{source}{preview}</>}
      </div>
    </div>
  );
}

function EditorLoading(): React.JSX.Element {
  return <div className="studio-editor-loading"><span />Loading editor…</div>;
}

function FileTree({ files, selected, managedPath, onSelect }: { files: Record<string, string>; selected: string; managedPath?: string; onSelect: (path: string) => void }): React.JSX.Element {
  return (
    <aside className="artifact-file-tree" aria-label="Project files">
      <header><span>Files</span><small>{Object.keys(files).length}</small></header>
      <nav>
        {Object.keys(files).sort().map((path) => (
          <button key={path} type="button" className={selected === path ? "active" : ""} onClick={() => onSelect(path)} title={path}>
            <FileCode size={14} /><span>{path.split("/").pop()}</span>{path === managedPath && <small>Visual</small>}
          </button>
        ))}
      </nav>
    </aside>
  );
}

function CodeWorkspace({ files, selected, managedPath, onSelect, onEdit }: { files: Record<string, string>; selected: string; managedPath?: string; onSelect: (path: string) => void; onEdit: (path: string, value: string) => void }): React.JSX.Element {
  return (
    <section className="artifact-code-workspace">
      <FileTree files={files} selected={selected} managedPath={managedPath} onSelect={onSelect} />
      <div className="artifact-monaco">
        <header><span>{selected}</span>{selected === managedPath && <small>Generated by Design</small>}</header>
        <Suspense fallback={<EditorLoading />}><MonacoCodeEditor path={selected} value={files[selected] ?? ""} onChange={(value) => onEdit(selected, value)} /></Suspense>
      </div>
    </section>
  );
}

function SiteTabs({ view, visual, onChange }: { view: SiteView; visual: boolean; onChange: (view: SiteView) => void }): React.JSX.Element {
  return (
    <div role="tablist" aria-label="Website editor view">
      {visual && <button type="button" role="tab" aria-selected={view === "design"} onClick={() => onChange("design")}><Selection size={15} /> Design</button>}
      <button type="button" role="tab" aria-selected={view === "code"} onClick={() => onChange("code")}><Code size={15} /> Code</button>
      <button type="button" role="tab" aria-selected={view === "preview"} onClick={() => onChange("preview")}><Eye size={15} /> Preview</button>
      <button type="button" role="tab" aria-selected={view === "split"} onClick={() => onChange("split")}><Monitor size={15} /> Split</button>
    </div>
  );
}

function siteViewHint(view: SiteView): string {
  if (view === "design") return "Click text to edit · drag blocks to arrange";
  if (view === "code") return "Edit website files directly";
  if (view === "split") return "Edit files and preview changes side by side";
  return "Preview updates as you work";
}

function SiteEditor({ artifact, content, onChange }: { artifact: Artifact; content: SiteArtifactContent; onChange: StudioWorkspaceProps["onChange"] }): React.JSX.Element {
  const [view, setView] = useState<SiteView>("preview");
  const [html, setHtml] = useState(content.html);
  const [preview, setPreview] = useState(content.html);
  const lastLocalHtmlRef = useRef<string | null>(null);
  useEffect(() => {
    if (content.html === lastLocalHtmlRef.current) return;
    setHtml(content.html);
    setPreview(content.html);
  }, [artifact.id, content.html]);
  useEffect(() => {
    const timeout = window.setTimeout(() => setPreview(html), 180);
    return () => window.clearTimeout(timeout);
  }, [html]);

  function edit(next: string): void {
    lastLocalHtmlRef.current = next;
    setHtml(next);
    onChange(updateContent(artifact, { ...content, html: next }));
  }

  return (
    <div className="studio-site-shell">
      <div className="studio-contextbar">
        <SiteTabs view={view} visual={false} onChange={setView} />
        <span>{siteViewHint(view)}</span>
      </div>
      <div className={`studio-web-surface view-${view}`}>
        {(view === "code" || view === "split") && <CodeWorkspace files={{ "/index.html": html }} selected="/index.html" onSelect={() => undefined} onEdit={(_path, value) => edit(value)} />}
        {(view === "preview" || view === "split") && <BrowserPreview title={artifact.title} html={preview} />}
      </div>
    </div>
  );
}

function WebProjectEditor({ artifact, content, agentName, modelName, agentBusy, agentStatus, onChange, onAskAgent }: { artifact: Artifact; content: WebProjectArtifactContent; agentName: string; modelName: string; agentBusy?: boolean; agentStatus?: StudioAgentStatus | null; onChange: StudioWorkspaceProps["onChange"]; onAskAgent?: StudioWorkspaceProps["onAskAgent"] }): React.JSX.Element {
  const hasVisual = (content.framework === "react" || content.framework === "react-router") && content.visual?.editor === "puck";
  const runtimeAvailable = Boolean(window.khadim.artifacts.preview && window.khadim.artifacts.stopPreview);
  const [view, setView] = useState<SiteView>("preview");
  const [selected, setSelected] = useState(content.files[content.entryFile] !== undefined ? content.entryFile : Object.keys(content.files)[0] ?? content.entryFile);
  const [runtime, setRuntime] = useState<ExecutablePreviewState>({ status: "starting" });
  useEffect(() => setSelected(content.files[content.entryFile] !== undefined ? content.entryFile : Object.keys(content.files)[0] ?? content.entryFile), [artifact.id]);
  useEffect(() => () => { void window.khadim.artifacts.stopPreview?.(artifact.projectId, artifact.id); }, [artifact.id, artifact.projectId]);
  useEffect(() => {
    const previewArtifact = window.khadim.artifacts.preview;
    if (!previewArtifact) return;
    let cancelled = false;
    setRuntime((current) => ({ status: "starting", url: current.url }));
    const timeout = window.setTimeout(() => {
      void previewArtifact({
        projectId: artifact.projectId,
        artifactId: artifact.id,
        framework: content.framework,
        entryFile: content.entryFile,
        files: content.files,
      }).then((session) => {
        if (!cancelled) setRuntime({ status: "ready", url: session.url });
      }).catch((cause: unknown) => {
        if (!cancelled) setRuntime((current) => ({ ...current, status: "error", error: cause instanceof Error ? cause.message : "The website preview couldn’t start." }));
      });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [artifact.id, artifact.projectId, content.entryFile, content.files, content.framework]);

  function editFile(path: string, source: string): void {
    onChange(updateContent(artifact, updateWebProjectFile(content, path, source)));
  }

  function editVisual(data: VisualDocumentData): void {
    onChange(updateContent(artifact, applyVisualDocument(content, data)));
  }

  const code = <CodeWorkspace files={content.files} selected={selected} managedPath="/src/StudioPage.jsx" onSelect={setSelected} onEdit={editFile} />;
  const previewErrorFile = runtime.error
    ? Object.keys(content.files).find((path) => runtime.error?.includes(path) || runtime.error?.includes(path.replace(/^\//, "")))
    : undefined;
  const preview = <BrowserPreview
    title={artifact.title}
    html={content.previewHtml}
    runtime={runtimeAvailable ? runtime : undefined}
    onOpenSource={() => {
      if (previewErrorFile) setSelected(previewErrorFile);
      setView("code");
    }}
  />;

  return (
    <div className="studio-site-shell">
      <div className="studio-contextbar">
        <SiteTabs view={view} visual={hasVisual} onChange={setView} />
        <span>{siteViewHint(view)}</span>
      </div>
      <div className={`studio-web-surface view-${view}`}>
        {view === "design" && hasVisual && <Suspense fallback={<EditorLoading />}><PuckVisualEditor data={content.visual!.data} styles={webProjectStyles(content.files)} agentName={agentName} modelName={modelName} agentBusy={agentBusy} agentStatus={agentStatus} onChange={editVisual} onAskAgent={onAskAgent} /></Suspense>}
        {view === "code" && code}
        {view === "preview" && preview}
        {view === "split" && <>{code}{preview}</>}
      </div>
    </div>
  );
}

export function StudioWorkspace({ artifact, saveState, agentName = "Khadim", modelName = "Current model", agentAvailable = true, agentBusy = false, agentStatus = null, onChange, onRetrySave, onClose, onExportPdf, onAskAgent, onAskCanvasAgent, studioChatVisible = true, canToggleStudioChat = false, onToggleStudioChat }: StudioWorkspaceProps): React.JSX.Element {
  function rename(title: string): void {
    onChange({ ...artifact, title, updatedAt: new Date().toISOString() });
  }

  return (
    <section className="studio-workspace" aria-labelledby="studio-workspace-title">
      <header className="studio-workspace-header">
        <button className="studio-back" type="button" onClick={onClose} aria-label="Back to artifacts"><ArrowLeft size={18} /></button>
        <span className={`studio-kind-mark ${artifact.kind}`}>{artifact.kind === "document" ? <FileText size={18} /> : artifact.kind === "site" ? <GlobeHemisphereWest size={18} /> : <Selection size={18} />}</span>
        <div className="studio-title-block">
          <input id="studio-workspace-title" value={artifact.title} onChange={(event) => rename(event.target.value)} aria-label="Artifact title" />
          <span className={saveState === "error" ? "error" : ""} aria-live="polite">
            {kindLabels[artifact.kind]} · {saveLabel(saveState)}
            {saveState === "error" && onRetrySave && <button className="studio-save-retry" type="button" onClick={onRetrySave}><WarningCircle size={12} /> Retry</button>}
          </span>
        </div>
        {canToggleStudioChat && onToggleStudioChat && (
          <button
            className="studio-chat-toggle"
            type="button"
            aria-pressed={studioChatVisible}
            aria-label={studioChatVisible ? "Hide chat" : "Show chat"}
            onClick={onToggleStudioChat}
          >
            <ChatCircleDots size={15} />
            <span className="studio-chat-toggle-label">{studioChatVisible ? "Hide chat" : "Show chat"}</span>
          </button>
        )}
        {agentStatus && <span className={`studio-agent-status ${agentStatus.phase}`} role={agentStatus.phase === "error" ? "alert" : "status"} aria-live="polite">
          {(agentStatus.phase === "starting" || agentStatus.phase === "running") && <span className="activity-spinner" />}
          {agentStatus.message ?? (agentStatus.phase === "starting" ? "Preparing edit…" : agentStatus.phase === "running" ? `${agentName} is editing…` : agentStatus.phase === "complete" ? "Changes applied" : "Edit failed")}
        </span>}
        <button className="studio-export" type="button" onClick={onExportPdf}>Export PDF</button>
      </header>
      {artifact.content.format === "tiptap" && <DocumentEditor artifact={artifact} content={artifact.content} onChange={onChange} />}
      {artifact.content.format === "document-html" && <HtmlDocumentEditor key={artifact.id} artifact={artifact} content={artifact.content} onChange={onChange} />}
      {artifact.content.format === "html" && <SiteEditor artifact={artifact} content={artifact.content} onChange={onChange} />}
      {artifact.content.format === "web-project" && <WebProjectEditor artifact={artifact} content={artifact.content} agentName={agentName} modelName={modelName} agentBusy={agentBusy} agentStatus={agentStatus} onChange={onChange} onAskAgent={onAskAgent} />}
      {artifact.content.format === "khadim-canvas" && <CanvasEditor artifact={artifact} content={artifact.content} onChange={onChange} agentName={agentName} modelName={modelName} agentAvailable={agentAvailable} agentBusy={agentBusy} agentStatus={agentStatus} onAskCanvasAgent={onAskCanvasAgent} />}
    </section>
  );
}
