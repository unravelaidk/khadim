// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoadingState from "../../../src/renderer/src/chat/LoadingState";

describe("LoadingState", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows the compact working orb and advances the elapsed timer", () => {
    vi.useFakeTimers();
    const { container } = render(<LoadingState />);

    expect(screen.getByText("Preparing response")).toBeInTheDocument();
    expect(container.querySelector("canvas.agent-thinking-orb")).toHaveAttribute("data-orb-state", "working");
    expect(screen.getByText("0.0s")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_200));
    expect(screen.getByText("1.2s")).toBeInTheDocument();
  });

  it("supports semantic orb states without changing the status copy", () => {
    const { container } = render(<LoadingState label="Searching sources" state="searching" />);

    expect(screen.getByText("Searching sources")).toBeInTheDocument();
    expect(container.querySelector("canvas.agent-thinking-orb")).toHaveAttribute("data-orb-state", "searching");
  });
});
