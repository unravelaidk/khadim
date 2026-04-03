import { describe, expect, it } from "vitest";
import { generateHTMLFromSlides, parseSlidesFromHtml } from "../../app/components/SlidesPreview/utils";
import { getThemeById } from "../../app/components/agent-builder/slideTemplates";

describe("slides preview utils", () => {
  it("embeds slide-data in generated fallback html", () => {
    const slides = [
      { id: 1, type: "title" as const, title: "Cars", subtitle: "A concise deck" },
      { id: 2, type: "content" as const, title: "Overview", bullets: ["Past", "Present", "Future"] },
    ];

    const html = generateHTMLFromSlides(slides, "Cars", getThemeById("cobalt"));

    expect(html).toContain('<script id="slide-data" type="application/json">');
    expect(parseSlidesFromHtml(html)).toEqual(slides);
    expect(html).toContain('<meta name="slide-theme" content="cobalt">');
  });
});
