import { Check, ShieldCheck, X } from "@phosphor-icons/react";
import type { AgentApprovalDecision, AgentApprovalRequest } from "../../../shared/types";

interface ApprovalPanelProps {
  request: AgentApprovalRequest;
  responding: boolean;
  onDecision: (decision: AgentApprovalDecision) => Promise<void>;
}

export function ApprovalPanel({ request, responding, onDecision }: ApprovalPanelProps): React.JSX.Element {
  return (
    <section className="approval-panel" aria-labelledby={`approval-${request.requestId}`}>
      <header>
        <ShieldCheck size={17} />
        <span>Permission required</span>
        <small>{request.kind.replace("-", " ")}</small>
      </header>
      <h3 id={`approval-${request.requestId}`}>{request.title}</h3>
      {request.detail && <pre>{request.detail}</pre>}
      <footer>
        <button type="button" disabled={responding} onClick={() => void onDecision("cancel")}>Cancel turn</button>
        <button type="button" disabled={responding} onClick={() => void onDecision("decline")}><X size={14} /> Decline</button>
        <button type="button" disabled={responding} onClick={() => void onDecision("acceptForSession")}>Always allow</button>
        <button className="approval-accept" type="button" disabled={responding} onClick={() => void onDecision("accept")}><Check size={14} /> Approve once</button>
      </footer>
    </section>
  );
}
