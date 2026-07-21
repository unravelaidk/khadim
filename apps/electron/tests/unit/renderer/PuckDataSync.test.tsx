// @vitest-environment happy-dom

import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const puck = vi.hoisted(() => ({
  appState: { data: { root: { props: {} }, content: [] } },
  dispatch: vi.fn(),
  props: null as Record<string, unknown> | null,
}));

vi.mock("@puckeditor/core", () => ({
  Puck: (props: Record<string, unknown>) => {
    puck.props = props;
    const overrides = props.overrides as { iframe?: (props: { children: React.ReactNode; document?: Document }) => React.ReactNode } | undefined;
    return overrides?.iframe?.({ children: <div data-testid="puck-canvas" />, document }) ?? null;
  },
  usePuck: () => ({ appState: puck.appState, dispatch: puck.dispatch }),
}));

import { PuckDataSync, PuckVisualEditor } from "../../../src/renderer/src/studio/PuckSurface";

describe("PuckDataSync", () => {
  afterEach(() => {
    puck.appState.data = { root: { props: {} }, content: [] };
    puck.dispatch.mockReset();
    puck.props = null;
  });

  it("pushes an agent-authored visual document into Puck's live store", async () => {
    const initial = { root: { props: {} }, content: [] };
    const incoming = {
      root: { props: {} },
      content: [{ type: "Heading", props: { id: "heading-1", text: "Updated live" } }],
    };

    const { rerender } = render(<PuckDataSync data={initial} />);
    expect(puck.dispatch).not.toHaveBeenCalled();

    rerender(<PuckDataSync data={incoming} />);

    await waitFor(() => expect(puck.dispatch).toHaveBeenCalledWith({ type: "setData", data: incoming }));
  });

  it("updates the CSS rendered inside the visual editor iframe", () => {
    const data = { root: { props: {} }, content: [] };
    const { container, rerender } = render(<PuckVisualEditor data={data} styles="h1 { color: tomato; }" agentName="Everyday" modelName="Claude Sonnet" onChange={vi.fn()} />);

    expect(puck.props?.iframe).toEqual({ syncHostStyles: false });
    expect(container.querySelector("style[data-khadim-artifact-styles]")).toHaveTextContent("color: tomato");

    rerender(<PuckVisualEditor data={data} styles="h1 { color: royalblue; }" agentName="Everyday" modelName="Claude Sonnet" onChange={vi.fn()} />);

    expect(container.querySelector("style[data-khadim-artifact-styles]")).toHaveTextContent("color: royalblue");
  });
});
