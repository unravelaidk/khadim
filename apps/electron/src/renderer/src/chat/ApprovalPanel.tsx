"use client";

import { Check, ShieldCheck, X } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import type { AgentApprovalDecision, AgentApprovalRequest } from "../../../shared/types";

interface ApprovalPanelProps {
  request: AgentApprovalRequest;
  responding: boolean;
  onDecision: (decision: AgentApprovalDecision) => Promise<void>;
}

export function ApprovalPanel({ request, responding, onDecision }: ApprovalPanelProps): React.JSX.Element {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [request.requestId]);

  return (
    <section className="approval-panel" role="alertdialog" aria-modal="false" aria-labelledby={`approval-${request.requestId}`} aria-describedby={request.detail ? `approval-detail-${request.requestId}` : undefined} aria-busy={responding}>
      <div className="approval-heading">
        <span className="approval-mark"><ShieldCheck size={16} /></span>
        <span><strong>Permission required</strong><small>{request.kind.replaceAll("-", " ")}</small></span>
      </div>
      <h3 id={`approval-${request.requestId}`} ref={headingRef} tabIndex={-1}>{request.title}</h3>
      {request.detail && <pre id={`approval-detail-${request.requestId}`}>{request.detail}</pre>}
      <footer>
        <button className="approval-cancel" type="button" disabled={responding} onClick={() => void onDecision("cancel")}>Cancel turn</button>
        <span>
          <button type="button" disabled={responding} onClick={() => void onDecision("decline")}><X size={14} /> Decline</button>
          <button className="approval-accept" type="button" disabled={responding} onClick={() => void onDecision("accept")}><Check size={14} /> {responding ? "Approving…" : "Approve once"}</button>
        </span>
      </footer>
      <details className="approval-session-option">
        <summary>More permission options</summary>
        <div>
          <span><strong>Allow for this session</strong><small>Future requests of this type can run until Khadim closes.</small></span>
          <button type="button" disabled={responding} onClick={() => void onDecision("acceptForSession")}>Allow session</button>
        </div>
      </details>
    </section>
  );
}
