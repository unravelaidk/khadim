// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RecommendationCard from "../../../src/renderer/src/chat/RecommendationCard";
import { extractHtml, extractRecommendation, messageCopyWithoutRecommendation, messageCopyWithoutStudioEdit } from "../../../src/renderer/src/chat/message-content";

const recommendation = {
  title: "Deployment recommendation",
  options: [
    { id: "safe", body: "Deploy `release-1` after checks pass.", short: "Deploy after checks", signal: 3, tone: "success" as const, label: "High confidence", action: "Accept" },
    { id: "wait", body: "Wait for the next maintenance window.", short: "Wait for maintenance", signal: 2, tone: "warning" as const, label: "Needs review", action: "Schedule" },
  ],
};

describe("RecommendationCard", () => {
  it("promotes alternatives and passes the active option back to the composer", () => {
    const onUse = vi.fn();
    render(<RecommendationCard recommendation={recommendation} onUse={onUse} />);

    expect(screen.getByText("release-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Alternatives" }));
    fireEvent.click(screen.getByRole("button", { name: /Wait for maintenance/ }));
    expect(screen.getByText("Wait for the next maintenance window.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Use option" }));
    expect(screen.getByRole("button", { name: "Added to message" })).toBeInTheDocument();
    expect(onUse).toHaveBeenCalledWith(recommendation.options[1]);
  });

  it("parses and removes a bounded structured recommendation block", () => {
    const content = `Summary before the card.\n<recommendation>${JSON.stringify(recommendation)}</recommendation>`;
    expect(extractRecommendation(content)).toEqual(recommendation);
    expect(messageCopyWithoutRecommendation(content)).toBe("Summary before the card.");
    expect(extractRecommendation("<recommendation>{bad}</recommendation>")).toBeNull();
  });

  it("removes legacy artifact edit payloads from chat copy", () => {
    const summary = "The document now includes a racing legacy section.";

    expect(messageCopyWithoutStudioEdit(`<artifact_edit><html>internal source</html></artifact_edit>\n${summary}`)).toBe(summary);
    expect(messageCopyWithoutStudioEdit(`<artifact-edit><html>internal source</html></artifact-edit>\n${summary}`)).toBe(summary);
    expect(messageCopyWithoutStudioEdit(`Reading the artifact.\n<artifact_read><artifact_id>draft-1</artifact_id></artifact_read>\n${summary}`)).toBe(`Reading the artifact.\n\n${summary}`);
  });

  it("never extracts artifacts from internal control blocks", () => {
    const html = "<!doctype html><html><body>Visible artifact</body></html>";
    const recommendationWithHtml = { ...recommendation, options: [{ ...recommendation.options[0], body: html }] };

    expect(extractHtml(`<artifact_edit>${html}</artifact_edit>`)).toBeNull();
    expect(extractHtml(`<artifact_read>${html}</artifact_read>`)).toBeNull();
    expect(extractHtml(`<recommendation>${JSON.stringify(recommendationWithHtml)}</recommendation>`)).toBeNull();
    expect(extractHtml(`<recommendation>${JSON.stringify(recommendation)}</recommendation>\n${html}`)).toBe(html);
  });
});
