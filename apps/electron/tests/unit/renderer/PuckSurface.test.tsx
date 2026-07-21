// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compactPuckUi, puckConfig, PuckAgentPanel, PuckComponentAgentAction } from "../../../src/renderer/src/studio/PuckSurface";

describe("Puck component agent action", () => {
  afterEach(cleanup);

  it("opens the design chat for the selected component", async () => {
    const openChat = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<PuckComponentAgentAction agentName="Everyday" componentId="heading-1" componentType="Heading" isSelected={false} onOpenAgent={openChat}><span /></PuckComponentAgentAction>);
    expect(screen.queryByRole("button", { name: "Ask Everyday" })).not.toBeInTheDocument();

    rerender(<PuckComponentAgentAction agentName="Everyday" componentId="heading-1" componentType="Heading" isSelected onOpenAgent={openChat}><span /></PuckComponentAgentAction>);
    await user.click(screen.getByRole("button", { name: "Ask Everyday" }));
    expect(openChat).toHaveBeenCalledWith({ id: "heading-1", type: "Heading" });
  });

  it("shows the active model and sends a scoped component edit from the chat", async () => {
    const ask = vi.fn(async () => true);
    const user = userEvent.setup();
    render(<PuckAgentPanel target={{ id: "heading-1", type: "Heading" }} agentName="Everyday" modelName="Claude Sonnet" status={null} onClose={vi.fn()} onAskAgent={ask} />);

    expect(screen.getByText("Claude Sonnet")).toBeInTheDocument();
    expect(screen.getByText("Heading", { selector: ".puck-agent-target" })).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Describe the component change" }), "Make it shorter");
    await user.click(screen.getByRole("button", { name: "Send to agent" }));

    expect(ask).toHaveBeenCalledWith("Edit the selected Heading component (id: heading-1): Make it shorter");
    expect(screen.getByText("Make it shorter")).toBeInTheDocument();
  });

  it("keeps the chat open with a useful error when the agent cannot start", async () => {
    const user = userEvent.setup();
    render(<PuckAgentPanel target={{ id: "heading-1", type: "Heading" }} agentName="Everyday" modelName="Claude Sonnet" status={null} onClose={vi.fn()} onAskAgent={vi.fn(async () => false)} />);

    await user.type(screen.getByRole("textbox", { name: "Describe the component change" }), "Make it shorter");
    await user.click(screen.getByRole("button", { name: "Send to agent" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t start");
    expect(screen.getByRole("textbox", { name: "Describe the component change" })).toHaveValue("Make it shorter");
  });

  it("sends with Enter, keeps Shift+Enter for a new line, and closes with Escape", async () => {
    const ask = vi.fn(async () => true);
    const close = vi.fn();
    const user = userEvent.setup();
    render(<PuckAgentPanel target={{ id: "heading-1", type: "Heading" }} agentName="Everyday" modelName="Claude Sonnet" status={null} onClose={close} onAskAgent={ask} />);

    const composer = screen.getByRole("textbox", { name: "Describe the component change" });
    await user.type(composer, "First line{Shift>}{Enter}{/Shift}Second line");
    expect(composer).toHaveValue("First line\nSecond line");
    await user.keyboard("{Enter}");
    expect(ask).toHaveBeenCalledWith("Edit the selected Heading component (id: heading-1): First line\nSecond line");

    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("makes text editable on the canvas and starts with both sidebars collapsed", () => {
    expect(puckConfig.components.Heading.fields?.text).toMatchObject({ contentEditable: true });
    expect(puckConfig.components.Text.fields?.text).toMatchObject({ contentEditable: true });
    expect(puckConfig.components.Button.fields?.label).toMatchObject({ contentEditable: true });
    expect(compactPuckUi).toMatchObject({ leftSideBarVisible: false, rightSideBarVisible: false });
  });

  it("offers constrained layout and content primitives for complete pages", () => {
    expect(puckConfig.categories?.layout?.components).toEqual(["Section", "Stack", "Columns", "Spacer"]);
    expect(puckConfig.components.Section.fields?.content).toMatchObject({ type: "slot" });
    expect(puckConfig.components.Columns.fields?.left).toMatchObject({ type: "slot" });
    expect(puckConfig.components.Columns.fields?.right).toMatchObject({ type: "slot" });
    expect(puckConfig.components).toHaveProperty("Navigation");
    expect(puckConfig.components).toHaveProperty("Image");
    expect(puckConfig.components).toHaveProperty("Card");
    expect(puckConfig.components.Navigation.fields?.links).not.toHaveProperty("contentEditable", true);
  });

  it("uses the same CSS hooks as the generated website", () => {
    const heading = puckConfig.components.Heading.render?.({ id: "heading", text: "Styled heading" } as never) as ReactElement<{ className?: string; style?: unknown }>;
    const button = puckConfig.components.Button.render?.({ id: "button", label: "Continue", href: "#", style: "primary" } as never) as ReactElement<{ className?: string; style?: unknown }>;

    expect(heading.props.className).toBeUndefined();
    expect(heading.props.style).toBeUndefined();
    expect(button.props.className).toBe("studio-button primary");
    expect(button.props.style).toBeUndefined();
  });

});
