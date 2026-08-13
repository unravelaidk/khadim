// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionPanel } from "../../../src/renderer/src/chat/QuestionPanel";

afterEach(() => { vi.useRealTimers(); });

describe("QuestionPanel", () => {
  it("collects single, multiple, and custom answers before submitting once", async () => {
    const onAnswer = vi.fn(async () => undefined);
    render(<QuestionPanel
      request={{
        requestId: "request-one",
        questions: [
          {
            id: "delivery",
            header: "Delivery",
            question: "When should this ship?",
            options: [{ label: "Now", description: "Release immediately" }, { label: "Later", description: "Wait" }],
          },
          {
            id: "checks",
            header: "Checks",
            question: "Which checks should run?",
            options: [{ label: "Tests" }, { label: "Lint" }],
            multiSelect: true,
          },
          {
            id: "note",
            header: "Note",
            question: "What release note should be used?",
            options: [],
          },
        ],
      }}
      responding={false}
      onAnswer={onAnswer}
    />);

    expect(screen.getByText("When should this ship?")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /Now/ }));
    expect(screen.getByRole("button", { name: "Next question" })).toHaveTextContent("Next");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: /Tests/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lint/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.change(screen.getByLabelText("Custom answer"), { target: { value: "Mention the migration" } });
    expect(screen.getByRole("button", { name: "Send answers" })).toHaveTextContent("Send answers");
    fireEvent.click(screen.getByRole("button", { name: "Send answers" }));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
      delivery: ["Now"],
      checks: ["Tests", "Lint"],
      note: ["Mention the migration"],
    }));
  });

  it("keeps a single-choice answer reviewable until the user advances", () => {
    render(<QuestionPanel
      request={{
        requestId: "request-auto",
        questions: [
          { id: "first", header: "First", question: "Choose one", options: [{ label: "Alpha" }] },
          { id: "second", header: "Second", question: "Choose another", options: [{ label: "Beta" }] },
        ],
      }}
      responding={false}
      onAnswer={vi.fn(async () => undefined)}
    />);

    fireEvent.click(screen.getByRole("button", { name: "Alpha" }));
    expect(screen.getByText("Choose one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText("Choose another")).toBeInTheDocument();
    expect(screen.getByText("Choose another")).toHaveFocus();
  });
});
