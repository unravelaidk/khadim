// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalPanel } from "../../../src/renderer/src/chat/ApprovalPanel";

afterEach(cleanup);

describe("ApprovalPanel", () => {
  it.each([
    ["Approve once", "accept"],
    ["Always allow", "acceptForSession"],
    ["Decline", "decline"],
    ["Cancel turn", "cancel"],
  ] as const)("maps %s to %s", async (label, decision) => {
    const onDecision = vi.fn(async () => undefined);
    render(<ApprovalPanel
      request={{ requestId: "approval-one", kind: "command", title: "Run this command?", detail: "bun test" }}
      responding={false}
      onDecision={onDecision}
    />);

    fireEvent.click(screen.getByRole("button", { name: label }));

    await waitFor(() => expect(onDecision).toHaveBeenCalledWith(decision));
    expect(screen.getByText("bun test")).toBeInTheDocument();
  });
});
