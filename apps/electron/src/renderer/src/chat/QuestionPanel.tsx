import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    setQuestionIndex(0);
    setAnswers({});
    setCustomAnswers({});
  }, [request.requestId]);

  const question = request.questions[questionIndex];
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
  const last = questionIndex === request.questions.length - 1;

  function toggle(label: string): void {
    setCustomAnswers((current) => ({ ...current, [question.id]: "" }));
    setAnswers((current) => {
      const existing = current[question.id] ?? [];
      const next = question.multiSelect
        ? existing.includes(label) ? existing.filter((value) => value !== label) : [...existing, label]
        : [label];
      return { ...current, [question.id]: next };
    });
  }

  return (
    <section className="question-panel" aria-label="Agent question">
      <header>
        <span>{question.header}</span>
        {request.questions.length > 1 && <small>{questionIndex + 1}/{request.questions.length}</small>}
      </header>
      <fieldset disabled={responding}>
        <legend>{question.question}</legend>
        {question.multiSelect && <p>Select one or more options.</p>}
        <div className="question-options">
          {question.options.map((option, index) => {
            const active = !custom.trim() && selected.includes(option.label);
            return (
              <button
                type="button"
                className={active ? "selected" : ""}
                aria-pressed={active}
                onClick={() => toggle(option.label)}
                key={`${question.id}:${option.label}`}
              >
                <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                {active ? <Check size={15} weight="bold" /> : index < 9 ? <kbd>{index + 1}</kbd> : null}
              </button>
            );
          })}
        </div>
        <label className="question-custom-answer">
          <span>Or write your own answer</span>
          <textarea
            aria-label="Custom answer"
            value={custom}
            rows={2}
            onChange={(event) => {
              const value = event.target.value;
              setCustomAnswers((current) => ({ ...current, [question.id]: value }));
              if (value) setAnswers((current) => ({ ...current, [question.id]: [] }));
            }}
          />
        </label>
      </fieldset>
      <footer>
        <button type="button" className="question-back" disabled={responding || questionIndex === 0} onClick={() => setQuestionIndex((current) => current - 1)}>
          <ArrowLeft size={15} /> Back
        </button>
        {last ? (
          <button type="button" className="question-submit" disabled={responding || !answered} onClick={() => void onAnswer(submittedAnswers)}>
            {responding ? "Sending…" : "Send answers"}
          </button>
        ) : (
          <button type="button" className="question-submit" aria-label="Next question" disabled={responding || !answered} onClick={() => setQuestionIndex((current) => current + 1)}>
            Next <ArrowRight size={15} />
          </button>
        )}
      </footer>
    </section>
  );
}
