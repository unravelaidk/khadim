"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentQuestionAnswers, AgentQuestionRequest } from "../../../shared/types";

interface QuestionPanelProps {
  request: AgentQuestionRequest;
  responding: boolean;
  onAnswer: (answers: AgentQuestionAnswers) => Promise<void>;
}

export function QuestionPanel({ request, responding, onAnswer }: QuestionPanelProps): React.JSX.Element | null {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<AgentQuestionAnswers>({});
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(true);
  const headingRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setQuestionIndex(0);
    setAnswers({});
    setCustomAnswers({});
    setOpen(true);
  }, [request.requestId]);

  const question = request.questions[questionIndex];

  useEffect(() => {
    if (open && question) headingRef.current?.focus();
  }, [open, question, questionIndex]);

  const submittedAnswers = useMemo<AgentQuestionAnswers>(() => Object.fromEntries(
    request.questions.map((candidate) => {
      const custom = customAnswers[candidate.id]?.trim();
      return [candidate.id, custom ? [custom] : (answers[candidate.id] ?? [])];
    }),
  ), [answers, customAnswers, request.questions]);

  if (!question) return null;

  const selected = answers[question.id] ?? [];
  const custom = customAnswers[question.id] ?? "";
  const answered = custom.trim().length > 0 || selected.length > 0;
  const answeredCount = request.questions.filter((candidate) => (
    Boolean(answers[candidate.id]?.length) || Boolean(customAnswers[candidate.id]?.trim())
  )).length;
  const last = questionIndex === request.questions.length - 1;

  function goTo(index: number): void {
    setQuestionIndex(Math.min(request.questions.length - 1, Math.max(0, index)));
  }

  function toggle(label: string): void {
    const existing = answers[question.id] ?? [];
    const nextSelection = question.multiSelect
      ? existing.includes(label) ? existing.filter((value) => value !== label) : [...existing, label]
      : [label];
    const nextAnswers = { ...answers, [question.id]: nextSelection };
    const nextCustom = { ...customAnswers, [question.id]: "" };
    setCustomAnswers(nextCustom);
    setAnswers(nextAnswers);
  }

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="question-panel-reopen">Open agent question</button>;
  }

  return (
    <section className="question-panel" role="dialog" aria-modal="false" aria-labelledby={`question-${request.requestId}-${question.id}`}>
      <div className="question-card">
        <fieldset disabled={responding} aria-labelledby={`question-${request.requestId}-${question.id}`} key={question.id}>
          <div className="question-card-heading">
            <span className="question-card-title" id={`question-${request.requestId}-${question.id}`} ref={headingRef} tabIndex={-1}>{question.question}</span>
            <button type="button" aria-label="Dismiss question" onClick={() => setOpen(false)} className="question-dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <span className="question-card-context">{question.header}{question.multiSelect ? " · Select one or more" : ""}</span>

          <div className="question-card-options">
            {question.options.map((option) => {
              const active = !custom.trim() && selected.includes(option.label);
              return (
                <button type="button" aria-pressed={active} onClick={() => toggle(option.label)} key={`${question.id}:${option.label}`}>
                  <span className={`question-choice-mark${question.multiSelect ? " is-check" : " is-radio"}${active ? " is-active" : ""}`}>
                    {question.multiSelect ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                    ) : <i />}
                  </span>
                  <span className="question-option-copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                </button>
              );
            })}
            <label className="question-card-custom">
              <span aria-hidden="true" />
              <input
                aria-label="Custom answer"
                value={custom}
                placeholder="Type something…"
                onChange={(event) => {
                  const value = event.target.value;
                  setCustomAnswers((current) => ({ ...current, [question.id]: value }));
                  if (value) setAnswers((current) => ({ ...current, [question.id]: [] }));
                }}
              />
            </label>
          </div>
        </fieldset>

        <footer className="question-card-footer">
          <span className="question-pager">
            <button type="button" aria-label="Previous" disabled={responding || questionIndex === 0} onClick={() => goTo(questionIndex - 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span>
              {request.questions.map((candidate, index) => (
                <button
                  type="button"
                  aria-label={`Go to question ${index + 1}`}
                  aria-current={index === questionIndex ? "step" : undefined}
                  disabled={responding}
                  onClick={() => goTo(index)}
                  className={index === questionIndex ? "is-current" : index < questionIndex || Boolean(answers[candidate.id]?.length || customAnswers[candidate.id]?.trim()) ? "is-complete" : ""}
                  key={candidate.id}
                />
              ))}
            </span>
            <button type="button" aria-label="Next" disabled={responding || last} onClick={() => goTo(questionIndex + 1)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </button>
          </span>
          <small className="question-answer-count">{answeredCount} of {request.questions.length} answered</small>
          <button
            type="button"
            aria-label={responding ? "Sending answers" : last ? "Send answers" : "Next question"}
            disabled={responding || !answered}
            onClick={() => {
              if (last) void onAnswer(submittedAnswers);
              else setQuestionIndex((current) => current + 1);
            }}
            className="question-advance"
          >
            <span>{responding ? "Sending…" : last ? "Send answers" : "Next"}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d={last ? "M12 19V5M5 12l7-7 7 7" : "M9 6l6 6-6 6"} />
            </svg>
          </button>
        </footer>
      </div>
    </section>
  );
}
