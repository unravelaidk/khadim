import type { Artifact, ArtifactContent, ArtifactKind, SiteArtifactContent, VisualDocumentData, WebProjectArtifactContent } from "../../shared/types";
import { visualDocumentHtml, visualDocumentSource } from "../../shared/web-project";

const starterDocumentHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Untitled document</title>
  <style>
    @page { size: A4 portrait; margin: 24mm; }
    :root { color: #20242a; background: #ffffff; font-family: "Source Serif 4", Georgia, serif; }
    * { box-sizing: border-box; }
    body { max-width: 760px; margin: 0 auto; padding: 72px 64px; line-height: 1.65; }
    header { margin-bottom: 48px; border-bottom: 1px solid #d9dde3; padding-bottom: 32px; }
    .kicker { margin: 0 0 12px; color: #526172; font: 600 12px/1.3 "Atkinson Hyperlegible Next", "Segoe UI", sans-serif; }
    h1, h2 { font-family: "Atkinson Hyperlegible Next", "Segoe UI", sans-serif; text-wrap: balance; }
    h1 { max-width: 14ch; margin: 0; font-size: 48px; line-height: 1.05; letter-spacing: -.035em; }
    h2 { margin: 36px 0 10px; font-size: 22px; }
    p { margin: 0 0 16px; }
    .lede { max-width: 58ch; color: #526172; font-size: 19px; }
  </style>
</head>
<body>
  <header>
    <p class="kicker">Khadim document</p>
    <h1>A clear title for the work.</h1>
  </header>
  <main>
    <p class="lede">Write directly on the page, refine the HTML source, or ask your agent for a structured revision.</p>
    <h2>Start with the outcome</h2>
    <p>Use this space for a brief, report, proposal, or one-page plan. The same HTML drives the editable page, preview, and PDF export.</p>
  </main>
</body>
</html>`;

const starterVisualData: VisualDocumentData = {
  root: { props: {} },
  content: [
    { type: "Navigation", props: { id: "starter-navigation", brand: "Khadim", links: "Work, About, Contact" } },
    {
      type: "Section",
      props: {
        id: "starter-section",
        tone: "muted",
        space: "generous",
        content: [
          {
            type: "Stack",
            props: {
              id: "starter-stack",
              gap: "medium",
              align: "start",
              content: [
                { type: "Eyebrow", props: { id: "starter-eyebrow", text: "Created in Khadim Studio" } },
                { type: "Heading", props: { id: "starter-heading", text: "Build the page beside the conversation." } },
                { type: "Text", props: { id: "starter-text", text: "Edit visually, work in source, and ask your agent for a precise revision without losing the preview." } },
                { type: "Button", props: { id: "starter-button", label: "Start building", href: "#", style: "primary" } },
              ],
            },
          },
        ],
      },
    },
  ],
};

const starterStyles = `:root { font-family: "Atkinson Hyperlegible Next Variable", "Segoe UI", sans-serif; color: #18202b; background: #fff; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
.page-shell { min-height: 100vh; background: #fff; }
.site-navigation { min-height: 64px; padding: 0 clamp(1.5rem, 7vw, 5.5rem); display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; border-bottom: 1px solid #d9dde3; }
.site-brand { color: #18202b; font-size: 1rem; font-weight: 700; text-decoration: none; }
.site-links { display: flex; flex-wrap: wrap; gap: 1.25rem; }
.site-links a { color: #526172; font-size: .875rem; text-decoration: none; }
.site-section { padding-inline: clamp(1.5rem, 7vw, 5.5rem); }
.section-inner { width: min(70rem, 100%); margin: 0 auto; }
.tone-canvas { background: #fff; }
.tone-muted { background: #f1f3f6; }
.tone-accent { background: #e9f2fb; }
.space-compact { padding-block: 3rem; }
.space-regular { padding-block: 4.75rem; }
.space-generous { padding-block: 7rem; }
.site-stack { display: grid; }
.align-start { justify-items: start; text-align: left; }
.align-center { justify-items: center; text-align: center; }
.gap-small { gap: .75rem; }
.gap-medium { gap: 1.25rem; }
.gap-large { gap: 2.25rem; }
.site-columns { display: grid; align-items: center; }
.ratio-equal { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ratio-wide-left { grid-template-columns: 1.35fr .65fr; }
.ratio-wide-right { grid-template-columns: .65fr 1.35fr; }
.eyebrow { margin: 0; color: #526172; font-size: .75rem; font-weight: 650; letter-spacing: .02em; text-transform: uppercase; }
h1 { max-width: 47.5rem; margin: 0; font-size: clamp(3rem, 7vw, 5rem); font-weight: 650; line-height: 1.02; letter-spacing: -.035em; text-wrap: balance; }
.lede { max-width: 36.875rem; margin: 0; color: #526172; font-size: clamp(1rem, 2vw, 1.25rem); line-height: 1.55; text-wrap: pretty; }
.studio-button { display: inline-block; padding: .8125rem 1.125rem; border: 1px solid #286da8; border-radius: .6875rem; font-size: .875rem; font-weight: 650; text-decoration: none; }
.studio-button.primary { color: #fff; background: #286da8; }
.studio-button.secondary { color: #286da8; background: transparent; }
.site-image { width: 100%; display: block; border-radius: .875rem; object-fit: cover; background: #f1f3f6; }
.aspect-landscape { aspect-ratio: 16 / 9; }
.aspect-square { aspect-ratio: 1; }
.aspect-portrait { aspect-ratio: 4 / 5; }
.site-card { display: grid; gap: .75rem; padding: 1.5rem; border: 1px solid #d9dde3; border-radius: .875rem; background: #fff; }
.site-card h2, .site-card p { margin: 0; }
.site-card p { color: #526172; line-height: 1.55; }
.site-card a { color: #286da8; font-size: .875rem; font-weight: 650; text-decoration: none; }
.site-spacer.size-small { height: .75rem; }
.site-spacer.size-medium { height: 1.25rem; }
.site-spacer.size-large { height: 2.25rem; }
@media (max-width: 700px) { .site-links { display: none; } .site-columns { grid-template-columns: 1fr; } .space-generous { padding-block: 4.75rem; } }`;

const starterReactRouterFiles = {
  "/package.json": JSON.stringify({
    name: "khadim-site",
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^19.2.0",
      "react-dom": "^19.2.0",
      "react-router": "^7.14.1",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^5.0.4",
      vite: "^7.3.2",
    },
  }, null, 2),
  "/vite.config.js": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});`,
  "/index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Khadim site</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
  "/src/main.jsx": `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ArtifactRouter from "./router";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ArtifactRouter />
  </StrictMode>,
);`,
  "/src/router.jsx": `import { createBrowserRouter, RouterProvider } from "react-router";
import HomeRoute from "./routes/home";
import NotFoundRoute from "./routes/not-found";

const router = createBrowserRouter([
  { path: "/", Component: HomeRoute },
  { path: "*", Component: NotFoundRoute },
]);

export default function ArtifactRouter() {
  return <RouterProvider router={router} />;
}`,
  "/src/routes/home.jsx": `import "../styles.css";
import StudioPage from "../StudioPage";

export default function HomeRoute() {
  return <StudioPage />;
}`,
  "/src/routes/not-found.jsx": `export default function NotFoundRoute() {
  return (
    <main style={{ padding: "4rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Page not found</h1>
      <a href="/">Return home</a>
    </main>
  );
}`,
  "/src/StudioPage.jsx": visualDocumentSource(starterVisualData),
  "/src/styles.css": starterStyles,
};

const starterReactPreview = visualDocumentHtml(starterVisualData, starterStyles);

function starterWebProject(): WebProjectArtifactContent {
  const files = { ...starterReactRouterFiles };
  return {
    format: "web-project",
    framework: "react-router",
    entryFile: "/src/router.jsx",
    files,
    baselineFiles: { ...files },
    previewHtml: starterReactPreview,
    baselinePreviewHtml: starterReactPreview,
    visual: {
      editor: "puck",
      data: starterVisualData,
    },
  };
}

export function createArtifact(kind: ArtifactKind, projectId: string, id: string, now: string): Artifact {
  const shared = {
    id,
    projectId,
    schemaVersion: 2 as const,
    kind,
    lifecycle: "draft" as const,
    provenance: { origin: "user" as const },
    createdAt: now,
    updatedAt: now,
  };
  if (kind === "document") return {
    ...shared,
    kind,
    title: "Untitled document",
    content: { format: "document-html", html: starterDocumentHtml, baselineHtml: starterDocumentHtml, page: { size: "A4", orientation: "portrait", margin: 24 } },
  };
  if (kind === "canvas") return {
    ...shared,
    kind,
    title: "Untitled canvas",
    content: { format: "excalidraw", elements: [], appState: { viewBackgroundColor: "#ffffff" }, files: {} },
  };
  return {
    ...shared,
    kind,
    title: "Untitled website",
    content: starterWebProject(),
  };
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function artifactTitle(content: string, fallback: string): string {
  const title = content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (title && plainText(title)) return plainText(title);
  const heading = content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return heading && plainText(heading) ? plainText(heading) : fallback;
}

export function isSiteContent(content: ArtifactContent): content is SiteArtifactContent {
  return content.format === "html";
}

export function isWebProjectContent(content: ArtifactContent): content is WebProjectArtifactContent {
  return content.format === "web-project";
}

export function artifactHtml(artifact: Artifact): string | null {
  if (isSiteContent(artifact.content)) return artifact.content.html;
  if (artifact.content.format === "document-html") return artifact.content.html;
  return isWebProjectContent(artifact.content) ? artifact.content.previewHtml : null;
}

export function artifactConversationTitle(artifact: Artifact): string | undefined {
  return artifact.provenance?.conversationTitle;
}

export function isAgentArtifact(artifact: Artifact): boolean {
  return artifact.provenance?.origin === "agent";
}

function emptyContent(content: ArtifactContent): ArtifactContent {
  if (content.format === "html") return { ...content, html: "", baselineHtml: "" };
  if (content.format === "web-project") return { ...content, files: {}, baselineFiles: {}, previewHtml: "", baselinePreviewHtml: "", visual: content.visual ? { ...content.visual, data: { root: { props: {} }, content: [] } } : undefined };
  if (content.format === "tiptap") return { ...content, document: { type: "doc", content: [] } };
  if (content.format === "document-html") return { ...content, html: "", baselineHtml: "" };
  return { ...content, elements: [], files: {} };
}

/**
 * A generated artifact is durable independently of its source chat. Editing it
 * creates a working draft over its baseline; discarding that work restores the
 * generated record. Only a draft created directly in the studio is removed.
 */
export function discardArtifactChanges(artifacts: Artifact[], artifactId: string, now: string): Artifact[] {
  return artifacts.flatMap((artifact) => {
    if (artifact.id !== artifactId) return [artifact];
    const hasGeneratedOrigin = isAgentArtifact(artifact);
    if (!hasGeneratedOrigin) return [];
    if (isWebProjectContent(artifact.content)) return [{
      ...artifact,
      lifecycle: "ready" as const,
      content: {
        ...artifact.content,
        files: { ...artifact.content.baselineFiles },
        previewHtml: artifact.content.baselinePreviewHtml,
      },
      updatedAt: now,
    }];
    if (artifact.content.format === "document-html") return [{
      ...artifact,
      lifecycle: "ready" as const,
      content: { ...artifact.content, html: artifact.content.baselineHtml },
      updatedAt: now,
    }];
    if (!isSiteContent(artifact.content)) return [artifact];
    return [{
      ...artifact,
      title: artifactTitle(artifact.content.baselineHtml, artifact.title),
      lifecycle: "ready" as const,
      content: { ...artifact.content, html: artifact.content.baselineHtml },
      updatedAt: now,
    }];
  });
}

/**
 * Delete a library artifact without allowing its source chat to recreate it.
 * Source-backed artifacts become content-free tombstones; local-only drafts can
 * be removed outright because no replay path can regenerate them.
 */
export function deleteArtifact(artifacts: Artifact[], artifactId: string, now: string): Artifact[] {
  return artifacts.flatMap((artifact) => {
    if (artifact.id !== artifactId) return [artifact];
    const hasRecoverableSource = isAgentArtifact(artifact);
    if (!hasRecoverableSource) return [];
    return [{
      ...artifact,
      lifecycle: "ready" as const,
      content: emptyContent(artifact.content),
      deletedAt: now,
      updatedAt: now,
    }];
  });
}
