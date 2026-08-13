// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ThinkingState from "../../../src/renderer/src/chat/ThinkingState";

describe("ThinkingState", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows a neutral status without inventing a reasoning trace", () => {
    render(<ThinkingState />);

    expect(screen.getByRole("status")).toHaveTextContent("Thinking");
    expect(screen.queryByRole("button", { name: /Thinking/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Understanding the request")).not.toBeInTheDocument();
  });

  it("uses real running tool activity for the coding trace", () => {
    render(<ThinkingState activities={[{
      id: "edit-one",
      tool: "edit",
      title: "Edit file",
      metadata: { path: "/workspace/src/App.tsx", additions: 12, deletions: 3 },
      status: "running",
    }]} />);

    const header = screen.getByRole("button", { name: /Running tools/ });
    expect(header).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Editing App.tsx")).toBeInTheDocument();
    expect(screen.getByText("/workspace/src/App.tsx")).toBeInTheDocument();
    expect(screen.getByText("+12")).toBeInTheDocument();

    const tool = screen.getByRole("button", { name: /Editing App.tsx/ });
    fireEvent.click(tool);
    expect(tool).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the actual query for a web search trace", () => {
    render(<ThinkingState activities={[{
      id: "search-one",
      tool: "web_search",
      title: "Search",
      input: JSON.stringify({ query: "Electron streaming UI patterns" }),
      status: "running",
    }]} />);

    expect(screen.getByRole("button", { name: /Searching the web/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Electron streaming UI patterns")).toBeInTheDocument();
  });
});
