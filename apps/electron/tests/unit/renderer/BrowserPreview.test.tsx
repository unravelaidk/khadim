// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserPreview, calculatePreviewScale } from "../../../src/renderer/src/studio/BrowserPreview";

describe("BrowserPreview", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("opens the live local URL in the system browser from the address control", async () => {
    let markRequestReceived: () => void = () => undefined;
    const requestReceived = new Promise<void>((resolve) => { markRequestReceived = resolve; });
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>Preview</title>");
      markRequestReceived();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const previewUrl = `http://127.0.0.1:${port}/?revision=2`;
    const openExternal = vi.fn(async () => undefined);
    Object.defineProperty(window, "khadim", {
      configurable: true,
      value: { shell: { openExternal } },
    });

    const { container } = render(
      <BrowserPreview
        title="Landing page"
        html=""
        runtime={{ status: "ready", url: previewUrl }}
      />,
    );

    const address = screen.getByRole("button", { name: "Open preview in browser" });
    expect(address).toHaveTextContent(`127.0.0.1:${port}`);
    expect(container.querySelector(".browser-frame-bar")?.contains(address)).toBe(true);
    expect(container.querySelector(".artifact-preview-toolbar")).toBeNull();

    fireEvent.click(address);
    expect(openExternal).toHaveBeenCalledWith(previewUrl);
    await requestReceived;
    await new Promise<void>((resolve, reject) => server.close((cause) => cause ? reject(cause) : resolve()));
  });

  it("fits device previews by width without shrinking them to the panel height", () => {
    expect(calculatePreviewScale(720, 1440)).toBe(0.5);
    expect(calculatePreviewScale(1600, 1440)).toBe(1);
  });

  it("describes preview progress without exposing implementation details", () => {
    const { rerender } = render(<BrowserPreview title="Landing page" html="" runtime={{ status: "starting" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("Starting preview…Preparing your website.");
    expect(screen.queryByText(/artifact files|local preview/i)).not.toBeInTheDocument();

    rerender(<BrowserPreview title="Landing page" html="" runtime={{ status: "error", url: "about:blank?revision=1", error: "A source error" }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Latest changes couldn’t be shown");
    expect(screen.getByText("Previous preview")).toBeInTheDocument();
  });
});
