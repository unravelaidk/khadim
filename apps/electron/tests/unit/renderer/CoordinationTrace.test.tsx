// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CoordinationTrace } from "../../../src/renderer/src/chat/CoordinationTrace";
import type { AgentCoordinationActivity } from "../../../src/shared/types";

afterEach(cleanup);

const activity: AgentCoordinationActivity = {
  status: "running",
  startedAt: "2026-08-06T12:00:00.000Z",
  goals: [
    { id: 0, kind: "explore", description: "Inspect the coordinator", status: "complete", targetFiles: [], dependencies: [] },
    { id: 1, kind: "build", description: "Build the control path", status: "running", targetFiles: ["src/main/index.ts"], dependencies: [0] },
  ],
  workers: [
    {
      id: "delegate-explore-123",
      task: "Inspect the coordinator",
      status: "running",
      goalIds: [1],
      activity: "Reading the relevant files",
      mode: "Explore",
      model: "gpt-5.6-sol",
      modelName: "GPT 5.6 Sol",
      provider: "openai",
      contextWindow: 100_000,
      usage: { input: 20_000, output: 5_000, cacheRead: 0, cacheWrite: 0 },
      startedAt: "2026-08-06T12:00:00.000Z",
    },
  ],
};

describe("CoordinationTrace", () => {
  it("does not render until the harness reports a real helper", () => {
    render(<CoordinationTrace activity={{
      status: "planning",
      goals: [],
      workers: [],
    }} runTitle="Simple question" />);

    expect(screen.queryByRole("button", { name: "Agent monitor" })).not.toBeInTheDocument();
  });

  it("shows the compact monitor summary and token health", () => {
    render(<CoordinationTrace activity={activity} runTitle="Improve the app" run={{
      createdAt: "2026-08-06T12:00:00.000Z",
      model: { id: "gpt", name: "GPT 5.6 Sol", provider: "openai", model: "gpt-5.6-sol" },
    }} />);

    expect(screen.getByRole("button", { name: "Agent monitor" }).closest("section")).toHaveTextContent("1 Running0 Idle0 Done");
    expect(screen.getByText("All agents under 30% token limit")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Highest agent token usage" })).toHaveAttribute("aria-valuenow", "25");
  });

  it("expands from the header to reveal the model, role, task, and status", () => {
    render(<CoordinationTrace activity={activity} runTitle="Improve the app" />);

    const toggle = screen.getByRole("button", { name: "Agent monitor" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("GPT 5.6 Sol")).toBeInTheDocument();
    expect(screen.getByText("Explore")).toBeInTheDocument();
    expect(screen.getByText("Reading the relevant files")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("1 Running")).toBeInTheDocument();
    expect(screen.queryByText("Plan")).not.toBeInTheDocument();
  });
});
