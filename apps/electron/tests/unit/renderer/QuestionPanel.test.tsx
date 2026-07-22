// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuestionPanel } from "../../../src/renderer/src/chat/QuestionPanel";

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

    fireEvent.click(screen.getByRole("button", { name: /Now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: /Tests/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lint/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.change(screen.getByLabelText("Custom answer"), { target: { value: "Mention the migration" } });
    fireEvent.click(screen.getByRole("button", { name: "Send answers" }));

    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith({
      delivery: ["Now"],
      checks: ["Tests", "Lint"],
      note: ["Mention the migration"],
    }));
  });
});
