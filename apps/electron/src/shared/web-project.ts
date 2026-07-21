import type { VisualDocumentData, WebProjectArtifactContent } from "./types";

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function safeHref(value: unknown): string {
  const href = text(value, "#").trim();
  return /^(?:https?:|mailto:|tel:|\/|#)/i.test(href) ? href : "#";
}

function safeImageSrc(value: unknown): string {
  const src = text(value).trim();
  return /^(?:https?:|data:image\/(?:png|jpeg|gif|webp|svg\+xml);|\/)/i.test(src) ? src : "";
}

function token<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function components(value: unknown): VisualDocumentData["content"] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is VisualDocumentData["content"][number] => Boolean(candidate) && typeof candidate === "object" && typeof (candidate as { type?: unknown }).type === "string" && Boolean((candidate as { props?: unknown }).props));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

function componentSource(component: VisualDocumentData["content"][number], depth = 3): string {
  const indent = "  ".repeat(depth);
  const childSource = (value: unknown, nextDepth = depth + 1): string => components(value).map((child) => componentSource(child, nextDepth)).join("\n");
  if (component.type === "Navigation") {
    const links = text(component.props.links, "Work, About, Contact").split(",").map((label) => label.trim()).filter(Boolean).slice(0, 5);
    return `${indent}<nav className="site-navigation"><a className="site-brand" href="#">{${JSON.stringify(text(component.props.brand, "Khadim"))}}</a><div className="site-links">${links.map((label) => `<a href={${JSON.stringify(`#${label.toLowerCase().replace(/\s+/g, "-")}`)}}>{${JSON.stringify(label)}}</a>`).join("")}</div></nav>`;
  }
  if (component.type === "Section") {
    const tone = token(component.props.tone, ["canvas", "muted", "accent"] as const, "canvas");
    const spacing = token(component.props.space, ["compact", "regular", "generous"] as const, "regular");
    return `${indent}<section className="site-section tone-${tone} space-${spacing}">\n${indent}  <div className="section-inner">\n${childSource(component.props.content, depth + 2)}\n${indent}  </div>\n${indent}</section>`;
  }
  if (component.type === "Stack") {
    const gap = token(component.props.gap, ["small", "medium", "large"] as const, "medium");
    const align = token(component.props.align, ["start", "center"] as const, "start");
    return `${indent}<div className="site-stack gap-${gap} align-${align}">\n${childSource(component.props.content)}\n${indent}</div>`;
  }
  if (component.type === "Columns") {
    const ratio = token(component.props.ratio, ["equal", "wide-left", "wide-right"] as const, "equal");
    const gap = token(component.props.gap, ["small", "medium", "large"] as const, "large");
    return `${indent}<div className="site-columns ratio-${ratio} gap-${gap}">\n${indent}  <div>\n${childSource(component.props.left, depth + 2)}\n${indent}  </div>\n${indent}  <div>\n${childSource(component.props.right, depth + 2)}\n${indent}  </div>\n${indent}</div>`;
  }
  if (component.type === "Eyebrow") return `${indent}<p className="eyebrow">{${JSON.stringify(text(component.props.text, "Eyebrow"))}}</p>`;
  if (component.type === "Heading") return `${indent}<h1>{${JSON.stringify(text(component.props.text, "Heading"))}}</h1>`;
  if (component.type === "Text") return `${indent}<p className="lede">{${JSON.stringify(text(component.props.text, "Add supporting copy."))}}</p>`;
  if (component.type === "Button") {
    const style = token(component.props.style, ["primary", "secondary"] as const, "primary");
    return `${indent}<a className="studio-button ${style}" href={${JSON.stringify(safeHref(component.props.href))}}>{${JSON.stringify(text(component.props.label, "Continue"))}}</a>`;
  }
  if (component.type === "Image") {
    const aspect = token(component.props.aspect, ["landscape", "square", "portrait"] as const, "landscape");
    return `${indent}<img className="site-image aspect-${aspect}" src={${JSON.stringify(safeImageSrc(component.props.src))}} alt={${JSON.stringify(text(component.props.alt))}} />`;
  }
  if (component.type === "Card") return `${indent}<article className="site-card"><h2>{${JSON.stringify(text(component.props.title, "A focused capability"))}}</h2><p>{${JSON.stringify(text(component.props.text, "Explain the value clearly."))}}</p><a href={${JSON.stringify(safeHref(component.props.href))}}>{${JSON.stringify(text(component.props.linkLabel, "Learn more"))}} →</a></article>`;
  if (component.type === "Spacer") return `${indent}<div className="site-spacer size-${token(component.props.size, ["small", "medium", "large"] as const, "medium")}" aria-hidden="true" />`;
  return `${indent}{/* Unsupported visual block: ${component.type.replace(/[^a-z0-9_-]/gi, "")} */}`;
}

function componentHtml(component: VisualDocumentData["content"][number]): string {
  const childHtml = (value: unknown): string => components(value).map(componentHtml).join("");
  if (component.type === "Navigation") {
    const links = text(component.props.links, "Work, About, Contact").split(",").map((label) => label.trim()).filter(Boolean).slice(0, 5);
    return `<nav class="site-navigation"><a class="site-brand" href="#">${escapeHtml(text(component.props.brand, "Khadim"))}</a><div class="site-links">${links.map((label) => `<a href="#${escapeHtml(label.toLowerCase().replace(/\s+/g, "-"))}">${escapeHtml(label)}</a>`).join("")}</div></nav>`;
  }
  if (component.type === "Section") return `<section class="site-section tone-${token(component.props.tone, ["canvas", "muted", "accent"] as const, "canvas")} space-${token(component.props.space, ["compact", "regular", "generous"] as const, "regular")}"><div class="section-inner">${childHtml(component.props.content)}</div></section>`;
  if (component.type === "Stack") return `<div class="site-stack gap-${token(component.props.gap, ["small", "medium", "large"] as const, "medium")} align-${token(component.props.align, ["start", "center"] as const, "start")}">${childHtml(component.props.content)}</div>`;
  if (component.type === "Columns") return `<div class="site-columns ratio-${token(component.props.ratio, ["equal", "wide-left", "wide-right"] as const, "equal")} gap-${token(component.props.gap, ["small", "medium", "large"] as const, "large")}"><div>${childHtml(component.props.left)}</div><div>${childHtml(component.props.right)}</div></div>`;
  if (component.type === "Eyebrow") return `<p class="eyebrow">${escapeHtml(text(component.props.text, "Eyebrow"))}</p>`;
  if (component.type === "Heading") return `<h1>${escapeHtml(text(component.props.text, "Heading"))}</h1>`;
  if (component.type === "Text") return `<p class="lede">${escapeHtml(text(component.props.text, "Add supporting copy."))}</p>`;
  if (component.type === "Button") return `<a class="studio-button ${token(component.props.style, ["primary", "secondary"] as const, "primary")}" href="${escapeHtml(safeHref(component.props.href))}">${escapeHtml(text(component.props.label, "Continue"))}</a>`;
  if (component.type === "Image") return `<img class="site-image aspect-${token(component.props.aspect, ["landscape", "square", "portrait"] as const, "landscape")}" src="${escapeHtml(safeImageSrc(component.props.src))}" alt="${escapeHtml(text(component.props.alt))}">`;
  if (component.type === "Card") return `<article class="site-card"><h2>${escapeHtml(text(component.props.title, "A focused capability"))}</h2><p>${escapeHtml(text(component.props.text, "Explain the value clearly."))}</p><a href="${escapeHtml(safeHref(component.props.href))}">${escapeHtml(text(component.props.linkLabel, "Learn more"))} →</a></article>`;
  if (component.type === "Spacer") return `<div class="site-spacer size-${token(component.props.size, ["small", "medium", "large"] as const, "medium")}" aria-hidden="true"></div>`;
  return "";
}

export function visualDocumentSource(data: VisualDocumentData): string {
  return `export default function StudioPage() {
  return (
    <main className="page-shell">
${data.content.map((component) => componentSource(component, 3)).join("\n")}
    </main>
  );
}
`;
}

export function visualDocumentHtml(data: VisualDocumentData, styles = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Studio preview</title><style>${styles.replace(/<\/style/gi, "<\\/style")}</style></head><body><main class="page-shell">${data.content.map(componentHtml).join("")}</main></body></html>`;
}

export function webProjectStyles(files: Record<string, string>): string {
  return Object.entries(files)
    .filter(([path]) => path.toLowerCase().endsWith(".css"))
    .map(([path, source]) => `/* ${path} */\n${source}`)
    .join("\n\n");
}

export function updateWebProjectFile(content: WebProjectArtifactContent, path: string, source: string): WebProjectArtifactContent {
  const files = { ...content.files, [path]: source };
  const data = content.visual?.data;
  const previewHtml = data && path.toLowerCase().endsWith(".css")
    ? visualDocumentHtml(data, webProjectStyles(files))
    : content.previewHtml;
  return { ...content, files, previewHtml };
}

export function applyVisualDocument(content: WebProjectArtifactContent, data: VisualDocumentData): WebProjectArtifactContent {
  return {
    ...content,
    files: { ...content.files, "/src/StudioPage.jsx": visualDocumentSource(data) },
    previewHtml: visualDocumentHtml(data, webProjectStyles(content.files)),
    visual: { editor: "puck", data },
  };
}
