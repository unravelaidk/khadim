// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolChips } from "../../../src/renderer/src/chat/ToolChips";

afterEach(cleanup);

describe("ToolChips", () => {
  it("shows compact tool rows, expandable output, and file diff chips", () => {
    render(<ToolChips activities={[
      {
        id: "edit-one",
        tool: "edit",
        title: "Edit App",
        result: "Updated the streaming state.",
        metadata: { path: "/workspace/src/App.tsx", additions: 14, deletions: 3 },
        status: "complete",
      },
      {
        id: "test-one",
        tool: "shell",
        title: "Run tests",
        input: "npm test",
        result: "5 tests passed",
        status: "complete",
      },
    ]} />);

    const header = screen.getByRole("button", { name: "2 tool calls" });
    expect(header).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(header);
    expect(screen.getAllByText("App.tsx")).toHaveLength(2);
    expect(screen.getByText("+14")).toBeInTheDocument();
    expect(screen.getByText("−3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Wrote file App.tsx/ }));
    expect(screen.getByText("Updated the streaming state.")).toBeInTheDocument();
  });

  it("keeps failed tools explicit and out of successful diff summaries", () => {
    render(<ToolChips activities={[{
      id: "edit-failed",
      tool: "edit",
      title: "Edit App",
      result: "Permission denied",
      metadata: { path: "/workspace/src/App.tsx", additions: 14, deletions: 3 },
      status: "error",
    }]} />);

    expect(screen.getByRole("button", { name: "1 tool call · 1 failed" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Edit failed App.tsx/ })).toBeInTheDocument();
    expect(screen.queryByText("+14")).not.toBeInTheDocument();
  });
});
