import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, posix, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import type { ArtifactPreviewRequest, ArtifactPreviewSession } from "../shared/types";

const maximumFiles = 200;
const maximumSourceBytes = 5 * 1024 * 1024;
const managedEntryPath = "/src/__khadim-preview-entry.jsx";
const managedIndexPath = "/index.html";
const previewCsp = [
  "default-src 'self' data: blob:",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const contentTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

interface RuntimeRecord {
  root: string;
  server: HttpServer;
  baseUrl: string;
  revision: number;
  serveRoot: string;
  setServeRoot: (root: string) => void;
  materializedFiles: Set<string>;
}

export interface ArtifactPreviewRuntimeOptions {
  temporaryRoot?: string;
}

function runtimeKey(projectId: string, artifactId: string): string {
  if (!/^[a-z0-9._-]+$/i.test(projectId) || !/^[a-z0-9._-]+$/i.test(artifactId)) {
    throw new Error("Invalid artifact preview identity.");
  }
  return `${projectId}:${artifactId}`;
}

function artifactPath(root: string, requestedPath: string): { relativePath: string; absolutePath: string } {
  if (typeof requestedPath !== "string" || requestedPath.includes("\0") || requestedPath.includes("\\") || requestedPath.split("/").includes("..")) {
    throw new Error("Artifact files must use safe absolute POSIX paths.");
  }
  const normalized = posix.normalize(`/${requestedPath.replace(/^\/+/, "")}`);
  if (normalized === "/") throw new Error("Artifact file path is empty.");
  const relativePath = normalized.slice(1);
  const absolutePath = resolve(root, ...relativePath.split("/"));
  const relativeToRoot = relative(root, absolutePath);
  if (relativeToRoot.startsWith("..") || relativeToRoot.includes(`..${sep}`)) {
    throw new Error("Artifact file path escapes the preview root.");
  }
  return { relativePath, absolutePath };
}

function validateRequest(request: ArtifactPreviewRequest): void {
  runtimeKey(request.projectId, request.artifactId);
  if (request.framework !== "react" && request.framework !== "react-router") {
    throw new Error("This website can’t run in the live preview.");
  }
  if (!request.entryFile || typeof request.entryFile !== "string") throw new Error("Artifact preview entry file is required.");
  const entries = Object.entries(request.files);
  if (entries.length === 0 || entries.length > maximumFiles) throw new Error("Artifact preview has an invalid file count.");
  let sourceBytes = 0;
  for (const [path, source] of entries) {
    if (typeof source !== "string") throw new Error(`Artifact file ${path} is not text.`);
    sourceBytes += Buffer.byteLength(source);
    if (sourceBytes > maximumSourceBytes) throw new Error("Artifact preview source exceeds 5 MB.");
    if (path === managedEntryPath) throw new Error("Artifact uses a reserved preview file path.");
    artifactPath("/tmp/khadim-preview-validation", path);
  }
  if (!(request.entryFile in request.files)) throw new Error("Artifact preview entry file is missing.");
}

function managedIndex(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Khadim Studio preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${managedEntryPath}"></script>
  </body>
</html>`;
}

function managedEntry(entryFile: string): string {
  // electron-vite's CommonJS compatibility pass scans static import text even
  // inside a template literal. Constructing the keyword at runtime keeps that
  // transform out of the artifact source while preserving normal ESM for Vite.
  const esmImport = String.fromCharCode(105, 109, 112, 111, 114, 116);
  return [
    `${esmImport} React from "react";`,
    `${esmImport} { createRoot } from "react-dom/client";`,
    `${esmImport} ArtifactEntry from ${JSON.stringify(entryFile)};`,
    "",
    "const root = document.getElementById(\"root\");",
    "if (!root) throw new Error(\"Khadim preview root is missing.\");",
    "createRoot(root).render(React.createElement(ArtifactEntry));",
    "",
  ].join("\n");
}

async function materialize(record: Pick<RuntimeRecord, "root" | "materializedFiles">, request: ArtifactPreviewRequest): Promise<void> {
  const nextFiles = new Set<string>();
  for (const [requestedPath, source] of Object.entries(request.files)) {
    // Keep the authored index in the artifact project, but use Khadim's
    // hardened index while the project runs inside the supervised preview.
    if (posix.normalize(`/${requestedPath.replace(/^\/+/, "")}`) === managedIndexPath) continue;
    const target = artifactPath(record.root, requestedPath);
    nextFiles.add(target.relativePath);
    await mkdir(dirname(target.absolutePath), { recursive: true });
    await writeFile(target.absolutePath, source, "utf8");
  }

  const entryTarget = artifactPath(record.root, managedEntryPath);
  nextFiles.add(entryTarget.relativePath);
  await mkdir(dirname(entryTarget.absolutePath), { recursive: true });
  await writeFile(entryTarget.absolutePath, managedEntry(request.entryFile), "utf8");

  const indexTarget = artifactPath(record.root, managedIndexPath);
  nextFiles.add(indexTarget.relativePath);
  await writeFile(indexTarget.absolutePath, managedIndex(), "utf8");

  for (const stalePath of record.materializedFiles) {
    if (nextFiles.has(stalePath)) continue;
    await unlink(resolve(record.root, ...stalePath.split("/"))).catch(() => undefined);
  }
  record.materializedFiles = nextFiles;
}

async function buildPreview(root: string, outputRoot: string): Promise<void> {
  const { build } = await import("vite");
  const require = createRequire(import.meta.url);
  await build({
    root,
    configFile: false,
    envFile: false,
    publicDir: false,
    clearScreen: false,
    logLevel: "silent",
    esbuild: { jsx: "automatic", jsxImportSource: "react" },
    resolve: {
      alias: [
        { find: /^react$/, replacement: require.resolve("react") },
        { find: /^react\/jsx-runtime$/, replacement: require.resolve("react/jsx-runtime") },
        { find: /^react\/jsx-dev-runtime$/, replacement: require.resolve("react/jsx-dev-runtime") },
        { find: /^react-dom$/, replacement: require.resolve("react-dom") },
        { find: /^react-dom\/client$/, replacement: require.resolve("react-dom/client") },
        { find: /^react-router$/, replacement: require.resolve("react-router") },
        { find: /^react-router\/dom$/, replacement: require.resolve("react-router/dom") },
      ],
      dedupe: ["react", "react-dom", "react-router"],
    },
    build: {
      target: "es2022",
      outDir: outputRoot,
      emptyOutDir: true,
      sourcemap: "inline",
      write: true,
    },
  });
}

function previewSession(record: RuntimeRecord): ArtifactPreviewSession {
  return { url: `${record.baseUrl}?revision=${record.revision}` };
}

function startStaticServer(initialServeRoot: string): Promise<{ server: HttpServer; baseUrl: string; setServeRoot: (root: string) => void }> {
  let serveRoot = initialServeRoot;
  const server = createHttpServer(async (request, response) => {
    response.setHeader("Content-Security-Policy", previewCsp);
    response.setHeader("Cross-Origin-Resource-Policy", "same-site");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
      const candidate = pathname === "/" ? "/index.html" : pathname;
      const target = artifactPath(serveRoot, candidate).absolutePath;
      const targetStat = await stat(target).catch(() => null);
      const filePath = targetStat?.isFile() ? target : artifactPath(serveRoot, "/index.html").absolutePath;
      const body = request.method === "HEAD" ? null : await readFile(filePath);
      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Preview file not found.");
    }
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectPromise);
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPromise(new Error("Preview server did not expose a local port."));
        return;
      }
      resolvePromise({ server, baseUrl: `http://127.0.0.1:${address.port}/`, setServeRoot: (root) => { serveRoot = root; } });
    });
  });
}

async function closeHttpServer(server: HttpServer): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

export class ArtifactPreviewRuntime {
  private readonly records = new Map<string, RuntimeRecord>();
  private readonly pending = new Map<string, Promise<ArtifactPreviewSession>>();
  private readonly temporaryRoot: string;

  constructor(options: ArtifactPreviewRuntimeOptions = {}) {
    this.temporaryRoot = options.temporaryRoot ?? tmpdir();
  }

  async start(request: ArtifactPreviewRequest): Promise<ArtifactPreviewSession> {
    validateRequest(request);
    const key = runtimeKey(request.projectId, request.artifactId);
    const existingPending = this.pending.get(key);
    if (existingPending) {
      await existingPending;
      return this.start(request);
    }
    const operation = this.startOrUpdate(key, request);
    this.pending.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this.pending.get(key) === operation) this.pending.delete(key);
    }
  }

  private async startOrUpdate(key: string, request: ArtifactPreviewRequest): Promise<ArtifactPreviewSession> {
    const existing = this.records.get(key);
    if (existing) {
      await materialize(existing, request);
      const nextRevision = existing.revision + 1;
      const nextServeRoot = join(existing.root, `dist-${nextRevision}`);
      await buildPreview(existing.root, nextServeRoot);
      const previousServeRoot = existing.serveRoot;
      existing.serveRoot = nextServeRoot;
      existing.setServeRoot(nextServeRoot);
      existing.revision = nextRevision;
      await rm(previousServeRoot, { recursive: true, force: true });
      return previewSession(existing);
    }

    await mkdir(this.temporaryRoot, { recursive: true });
    const root = await mkdtemp(join(this.temporaryRoot, "khadim-preview-"));
    let server: HttpServer | null = null;
    try {
      const draftRecord = { root, materializedFiles: new Set<string>() };
      await materialize(draftRecord, request);
      const serveRoot = join(root, "dist-1");
      await buildPreview(root, serveRoot);
      const staticServer = await startStaticServer(serveRoot);
      server = staticServer.server;
      const record: RuntimeRecord = {
        root,
        server,
        baseUrl: staticServer.baseUrl,
        revision: 1,
        serveRoot,
        setServeRoot: staticServer.setServeRoot,
        materializedFiles: draftRecord.materializedFiles,
      };
      this.records.set(key, record);
      return previewSession(record);
    } catch (error) {
      if (server) await closeHttpServer(server).catch(() => undefined);
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  }

  async stop(projectId: string, artifactId: string): Promise<void> {
    const key = runtimeKey(projectId, artifactId);
    const pending = this.pending.get(key);
    if (pending) await pending.catch(() => undefined);
    const record = this.records.get(key);
    if (!record) return;
    this.records.delete(key);
    await closeHttpServer(record.server).catch(() => undefined);
    await rm(record.root, { recursive: true, force: true });
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(Array.from(this.records.keys(), (key) => {
      const separator = key.indexOf(":");
      return this.stop(key.slice(0, separator), key.slice(separator + 1));
    }));
  }

  async readMaterializedFile(projectId: string, artifactId: string, path: string): Promise<string | null> {
    const record = this.records.get(runtimeKey(projectId, artifactId));
    if (!record) return null;
    return readFile(artifactPath(record.root, path).absolutePath, "utf8").catch(() => null);
  }
}
