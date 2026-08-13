"use client";

import { useState } from "react";

export type RecommendationTone = "success" | "warning" | "neutral";

export interface RecommendationOption {
  id: string;
  body: string;
  short: string;
  signal: number;
  tone: RecommendationTone;
  label: string;
  action: string;
}

export interface RecommendationData {
  title: string;
  options: RecommendationOption[];
}

function Meter({ signal, tone }: { signal: number; tone: RecommendationTone }): React.JSX.Element {
  return (
    <span className={`recommendation-meter is-${tone}`} aria-hidden="true">
      {[0, 1, 2].map((bar) => <span className={bar < signal ? "is-filled" : ""} key={bar} />)}
    </span>
  );
}

function RecommendationBody({ children }: { children: string }): React.JSX.Element {
  const parts = children.split(/(`[^`]+`)/g);
  return <>{parts.map((part, index) => part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part)}</>;
}

export default function RecommendationCard({
  recommendation,
  onUse,
}: {
  recommendation: RecommendationData;
  onUse: (option: RecommendationOption) => void;
}): React.JSX.Element {
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const active = recommendation.options[selected];
  const alternatives = recommendation.options.map((option, index) => ({ option, index })).filter(({ index }) => index !== selected);

  return (
    <section className="recommendation-card" aria-label={recommendation.title}>
      <div className="recommendation-body">
        <strong>{recommendation.title}</strong>
        <p key={active.id}><RecommendationBody>{active.body}</RecommendationBody></p>
      </div>

      <div className="recommendation-expand" aria-hidden={!open} inert={!open} style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        <div className="recommendation-overflow">
          <div className="recommendation-alternatives">
            <p>Other options</p>
            {alternatives.map(({ option, index }) => (
              <button
                type="button"
                onClick={() => {
                  setSelected(index);
                  setUsed(false);
                  setOpen(false);
                }}
                key={option.id}
              >
                <Meter signal={option.signal} tone={option.tone} />
                <span>{option.short}</span>
                <small>{option.label}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer aria-live="polite">
        <span><Meter signal={active.signal} tone={active.tone} /><strong>{active.label}</strong></span>
        <span>
          {alternatives.length > 0 && <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)} className={open ? "is-open" : ""}>Alternatives</button>}
          <button
            type="button"
            className={`recommendation-accept${used ? " is-used" : ""}`}
            onClick={() => {
              onUse(active);
              setUsed(true);
            }}
          >
            {used ? "Added to message" : "Use option"}
          </button>
        </span>
      </footer>
    </section>
  );
}
