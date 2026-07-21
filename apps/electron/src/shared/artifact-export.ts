import type { Artifact, HtmlDocumentArtifactContent } from "./types";

const inertPolicy = "default-src 'none'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; font-src data:";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function shell(title: string, body: string, styles = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${inertPolicy}"><title>${escapeHtml(title)}</title><style>${styles}</style></head><body>${body}</body></html>`;
}

function inertSite(html: string): string {
  const sanitized = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "$1=\"#\"");
  const meta = `<meta http-equiv="Content-Security-Policy" content="${inertPolicy}">`;
  if (/<head\b[^>]*>/i.test(sanitized)) return sanitized.replace(/<head\b[^>]*>/i, (head) => `${head}${meta}`);
  return `${meta}${sanitized}`;
}

function pageRule(content: HtmlDocumentArtifactContent): string {
  const margin = Number.isFinite(content.page.margin)
    ? Math.min(80, Math.max(0, content.page.margin))
    : 24;
  return `@page { size: ${content.page.size} ${content.page.orientation}; margin: ${margin}mm; }`;
}

/**
 * Produce the inert, paginated representation shared by document preview and
 * Electron's print pipeline. The final style is deliberately appended after
 * authored styles so the explicit Studio page settings win in print.
 */
export function renderHtmlDocument(content: HtmlDocumentArtifactContent): string {
  const pageStyle = `<style data-khadim-page>${pageRule(content)}</style>`;
  const paginated = /<\/head\s*>/i.test(content.html)
    ? content.html.replace(/<\/head\s*>/i, `${pageStyle}</head>`)
    : `${pageStyle}${content.html}`;
  return inertSite(paginated);
}

interface RichNode {
  type?: unknown;
  text?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  marks?: Array<{ type?: unknown }>;
}

function renderRichNode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as RichNode;
  if (typeof node.text === "string") {
    let text = escapeHtml(node.text);
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      if (mark.type === "italic") text = `<em>${text}</em>`;
      if (mark.type === "code") text = `<code>${text}</code>`;
    }
    return text;
  }
  const children = Array.isArray(node.content) ? node.content.map(renderRichNode).join("") : "";
  if (node.type === "heading") {
    const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
    return `<h${level}>${children}</h${level}>`;
  }
  if (node.type === "paragraph") return `<p>${children || "&nbsp;"}</p>`;
  if (node.type === "bulletList") return `<ul>${children}</ul>`;
  if (node.type === "orderedList") return `<ol>${children}</ol>`;
  if (node.type === "listItem") return `<li>${children}</li>`;
  if (node.type === "blockquote") return `<blockquote>${children}</blockquote>`;
  if (node.type === "hardBreak") return "<br>";
  return children;
}

interface CanvasNode {
  type?: unknown;
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  text?: unknown;
  color?: unknown;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function safeColor(value: unknown): string {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : "#6652d9";
}

function renderCanvasNode(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as CanvasNode;
  const x = finite(node.x, 0);
  const y = finite(node.y, 0);
  const color = safeColor(node.color);
  if (node.type === "text") return `<text x="${x}" y="${y + 28}" fill="${color}">${escapeHtml(typeof node.text === "string" ? node.text : "")}</text>`;
  if (node.type === "rectangle") return `<rect x="${x}" y="${y}" width="${finite(node.width, 120)}" height="${finite(node.height, 80)}" rx="8" fill="none" stroke="${color}" stroke-width="2"/>`;
  return "";
}

export function renderArtifactForPdf(artifact: Artifact): string {
  if (artifact.content.format === "html") return inertSite(artifact.content.html);
  if (artifact.content.format === "web-project") return inertSite(artifact.content.previewHtml);
  if (artifact.content.format === "document-html") return renderHtmlDocument(artifact.content);
  if (artifact.content.format === "tiptap") {
    const { page } = artifact.content;
    const styles = `@page { size: ${page.size} ${page.orientation}; margin: ${page.margin}mm; } body { margin: 0; color: #18191c; font: 12pt/1.6 Georgia, serif; } h1,h2,h3 { font-family: "Atkinson Hyperlegible Next Variable", "Segoe UI", sans-serif; line-height: 1.15; } p { orphans: 3; widows: 3; }`;
    return shell(artifact.title, renderRichNode(artifact.content.document), styles);
  }
  const elements = artifact.content.elements.map(renderCanvasNode).join("");
  return shell(artifact.title, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 650" role="img" aria-label="${escapeHtml(artifact.title)}"><style>text{font:600 24px "Atkinson Hyperlegible Next Variable","Segoe UI",sans-serif}</style>${elements}</svg>`, "@page { size: A4 landscape; margin: 0; } body { margin: 0; } svg { width: 100vw; height: 100vh; }");
}
