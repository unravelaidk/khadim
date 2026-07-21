import { Puck, usePuck, type Data, type UiState } from "@puckeditor/core";
import { MagicWand, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import "@puckeditor/core/puck.css";
import type { VisualDocumentData } from "../../../shared/types";
import { puckConfig, type StudioComponents } from "./puck-config";

export { puckConfig } from "./puck-config";

export const compactPuckUi: Partial<UiState> = {
  leftSideBarVisible: false,
  rightSideBarVisible: false,
  leftSideBarWidth: 210,
  rightSideBarWidth: 230,
};

function asPuckData(data: VisualDocumentData): Data<StudioComponents> {
  return data as Data<StudioComponents>;
}

export function PuckDataSync({ data }: { data: VisualDocumentData }): null {
  const { appState, dispatch } = usePuck<typeof puckConfig>();
  const incomingData = JSON.stringify(data);
  const editorData = JSON.stringify(appState.data);
  const lastIncomingData = useRef(incomingData);

  useEffect(() => {
    if (editorData === incomingData) {
      lastIncomingData.current = incomingData;
      return;
    }
    if (lastIncomingData.current === incomingData) return;
    lastIncomingData.current = incomingData;
    dispatch({ type: "setData", data: asPuckData(data) });
  }, [data, dispatch, editorData, incomingData]);

  return null;
}

export interface PuckAgentTarget { id: string; type: string }
export interface PuckAgentStatus { phase: "starting" | "running" | "complete" | "error"; message?: string }

export function PuckComponentAgentAction({ agentName, componentId, componentType, isSelected, onOpenAgent, children }: { agentName: string; componentId: string; componentType: string; isSelected: boolean; onOpenAgent?: (target: PuckAgentTarget) => void; children: ReactNode }): React.JSX.Element {
  return (
    <>
      {children}
      {isSelected && onOpenAgent && <div className="puck-agent-control" data-puck-overlay-portal>
        <button className="puck-agent-button" type="button" onClick={() => onOpenAgent({ id: componentId, type: componentType })}><MagicWand size={15} /> Ask {agentName}</button>
      </div>}
    </>
  );
}

export function PuckAgentPanel({ target, agentName, modelName, status, agentBusy = false, onClose, onAskAgent }: { target: PuckAgentTarget; agentName: string; modelName: string; status: PuckAgentStatus | null; agentBusy?: boolean; onClose: () => void; onAskAgent: (instruction: string) => Promise<boolean> }): React.JSX.Element {
  const [instruction, setInstruction] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const unavailable = sending || agentBusy || status?.phase === "starting" || status?.phase === "running";

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const request = instruction.trim();
    if (!request || unavailable) return;
    setFeedback(null);
    setSending(true);
    try {
      const started = await onAskAgent(`Edit the selected ${target.type} component (id: ${target.id}): ${request}`);
      if (!started) {
        setFeedback("The agent couldn’t start. Check the active model and try again.");
        return;
      }
      setMessages((current) => [...current, request]);
      setInstruction("");
    } catch {
      setFeedback("The agent couldn’t start. Check the active model and try again.");
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <aside className="puck-agent-panel" aria-label={`AI design chat for ${target.type}`}>
      <header className="puck-agent-panel-header">
        <span className="puck-agent-mark"><MagicWand size={16} /></span>
        <div><strong>Edit with {agentName}</strong><span className="puck-agent-target">{target.type}</span></div>
        <button type="button" aria-label="Close AI design chat" onClick={onClose}><X size={15} /></button>
      </header>
      <div className="puck-agent-model"><span className="puck-agent-model-dot" /><span>{modelName}</span><small>Active model</small></div>
      <div className="puck-agent-thread" aria-live="polite">
        <div className="puck-agent-message assistant">Tell me what to change. I’ll update only this {target.type.toLowerCase()} and keep you in the canvas.</div>
        {messages.map((message, index) => <div className="puck-agent-message user" key={`${message}-${index}`}>{message}</div>)}
        {(sending || status?.phase === "starting" || status?.phase === "running") && <div className="puck-agent-progress" role="status"><span />{status?.phase === "running" ? `${agentName} is editing…` : "Starting agent…"}</div>}
        {agentBusy && !status && <div className="puck-agent-message assistant">Another agent run is active. You can send this edit when it finishes.</div>}
        {status?.phase === "complete" && <div className="puck-agent-message assistant success">{status.message ?? "Change applied. You can ask for another revision."}</div>}
        {status?.phase === "error" && <div className="puck-agent-message assistant error" role="alert">{status.message ?? "The edit couldn’t be applied. Try again."}</div>}
        {feedback && <div className="puck-agent-message assistant error" role="alert">{feedback}</div>}
      </div>
      <form className="puck-agent-composer" onSubmit={(event) => void submit(event)}>
        <textarea aria-label="Describe the component change" value={instruction} onChange={(event) => setInstruction(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={`Ask ${agentName} to change this ${target.type.toLowerCase()}…`} rows={3} autoFocus />
        <footer><span>↵ Send · ⇧↵ New line</span><button type="submit" aria-label="Send to agent" disabled={!instruction.trim() || unavailable}><PaperPlaneTilt size={15} /></button></footer>
      </form>
    </aside>
  );
}

export function PuckVisualEditor({ data, styles, agentName, modelName, agentBusy = false, agentStatus = null, onChange, onAskAgent }: { data: VisualDocumentData; styles: string; agentName: string; modelName: string; agentBusy?: boolean; agentStatus?: PuckAgentStatus | null; onChange: (data: VisualDocumentData) => void; onAskAgent?: (instruction: string) => Promise<boolean> }): React.JSX.Element {
  const [agentTarget, setAgentTarget] = useState<PuckAgentTarget | null>(null);

  function closeAgentPanel(): void {
    setAgentTarget(null);
    window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".puck-agent-button")?.focus());
  }

  return (
    <div className="khadim-puck-shell">
      <div className="khadim-puck">
        <Puck
          config={puckConfig}
          data={asPuckData(data)}
          headerTitle="Visual editor"
          height="100%"
          iframe={{ syncHostStyles: false }}
          ui={compactPuckUi}
          viewports={[
            { width: "100%", height: "auto", label: "Responsive", icon: "Monitor" },
            { width: 834, height: "auto", label: "Tablet", icon: "Tablet" },
            { width: 390, height: "auto", label: "Mobile", icon: "Smartphone" },
          ]}
          overrides={{
            iframe: ({ children }) => <><style data-khadim-artifact-styles>{styles}</style>{children}</>,
            puck: ({ children }) => <><PuckDataSync data={data} />{children}</>,
            componentOverlay: ({ children, componentId, componentType, isSelected }) => <PuckComponentAgentAction agentName={agentName} componentId={componentId} componentType={componentType} isSelected={isSelected} onOpenAgent={onAskAgent ? setAgentTarget : undefined}>{children}</PuckComponentAgentAction>,
          }}
          onChange={(next) => onChange(next as VisualDocumentData)}
        />
      </div>
      {agentTarget && onAskAgent && <PuckAgentPanel key={`${agentTarget.id}:${agentTarget.type}`} target={agentTarget} agentName={agentName} modelName={modelName} agentBusy={agentBusy} status={agentStatus} onClose={closeAgentPanel} onAskAgent={onAskAgent} />}
    </div>
  );
}
