import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArtifactPreviewRuntime } from "../../../src/main/artifact-preview-runtime";
import type { ArtifactPreviewRequest } from "../../../src/shared/types";

function request(artifactId = "artifact-one", files?: Record<string, string>): ArtifactPreviewRequest {
  return {
    projectId: "project-one",
    artifactId,
    framework: "react",
    entryFile: "/src/App.jsx",
    files: files ?? {
      "/src/App.jsx": `import "./styles.css";
import Card from "./Card.jsx";
export default function App() { return <Card label="Live preview" />; }`,
      "/src/Card.jsx": `export default function Card({ label }) { return <main className="card">{label}</main>; }`,
      "/src/styles.css": `.card { color: rebeccapurple; background: url("./mark.svg"); }`,
      "/src/mark.svg": `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="4" r="4" /></svg>`,
    },
  };
}

describe("ArtifactPreviewRuntime", () => {
  let temporaryRoot: string;
  let runtime: ArtifactPreviewRuntime;

  beforeEach(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), "khadim-preview-test-"));
    runtime = new ArtifactPreviewRuntime({ temporaryRoot });
  });

  afterEach(async () => {
    await runtime.stopAll();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("serves a constrained multi-file React project with CSS and assets", async () => {
    const session = await runtime.start(request());

    const index = await fetch(session.url);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-security-policy")).toContain("connect-src 'self'");
    const indexHtml = await index.text();
    const scriptPath = indexHtml.match(/src="([^"]+\.js)"/)?.[1];
    const stylesheetPath = indexHtml.match(/href="([^"]+\.css)"/)?.[1];
    expect(scriptPath).toBeTruthy();
    expect(stylesheetPath).toBeTruthy();

    const app = await fetch(new URL(scriptPath!, session.url));
    expect(app.status).toBe(200);
    expect(await app.text()).toContain("Live preview");

    const styles = await fetch(new URL(stylesheetPath!, session.url));
    expect(styles.status).toBe(200);
    const stylesSource = await styles.text();
    expect(stylesSource).toContain(".card");
    expect(stylesSource).toContain("data:image/svg+xml");
  });

  it("compiles React Router v7 route modules without executing the authored Vite config", async () => {
    const routerRequest: ArtifactPreviewRequest = {
      projectId: "project-one",
      artifactId: "router-site",
      framework: "react-router",
      entryFile: "/src/router.jsx",
      files: {
        "/index.html": '<div id="authored-root"></div>',
        "/vite.config.js": 'throw new Error("authored config must not execute");',
        "/src/router.jsx": `import { createBrowserRouter, RouterProvider } from "react-router";
import Home from "./routes/home";
const router = createBrowserRouter([{ path: "/", Component: Home }]);
export default function ArtifactRouter() { return <RouterProvider router={router} />; }`,
        "/src/routes/home.jsx": `export default function Home() { return <h1>Router preview ready</h1>; }`,
      },
    };

    const session = await runtime.start(routerRequest);
    const indexHtml = await (await fetch(session.url)).text();
    expect(indexHtml).not.toContain("authored-root");
    const scriptPath = indexHtml.match(/src="([^"]+\.js)"/)?.[1];
    expect(scriptPath).toBeTruthy();
    expect(await (await fetch(new URL(scriptPath!, session.url))).text()).toContain("Router preview ready");
  });

  it("reuses the supervised server and updates its materialized files", async () => {
    const first = await runtime.start(request());
    const updated = request("artifact-one", {
      "/src/App.jsx": `export default function App() { return <h1>Updated source</h1>; }`,
    });

    const second = await runtime.start(updated);

    expect(new URL(second.url).origin).toBe(new URL(first.url).origin);
    expect(second.url).not.toBe(first.url);
    expect(await runtime.readMaterializedFile("project-one", "artifact-one", "/src/App.jsx")).toContain("Updated source");
    expect(await runtime.readMaterializedFile("project-one", "artifact-one", "/src/Card.jsx")).toBeNull();
  });

  it("keeps the last successful revision available when compilation fails", async () => {
    const first = await runtime.start(request());
    await expect(runtime.start(request("artifact-one", {
      "/src/App.jsx": `export default function App() { return <main>Broken; }`,
    }))).rejects.toThrow();

    const previous = await fetch(first.url);
    expect(previous.status).toBe(200);
    const previousHtml = await previous.text();
    const scriptPath = previousHtml.match(/src="([^"]+\.js)"/)?.[1];
    expect(scriptPath).toBeTruthy();
    expect(await (await fetch(new URL(scriptPath!, first.url))).text()).toContain("Live preview");
  });

  it("isolates concurrent artifacts and releases their servers", async () => {
    const first = await runtime.start(request("artifact-one"));
    const second = await runtime.start(request("artifact-two"));
    expect(second.url).not.toBe(first.url);

    await runtime.stop("project-one", "artifact-one");
    expect(await runtime.readMaterializedFile("project-one", "artifact-one", "/src/App.jsx")).toBeNull();
    expect((await fetch(second.url)).status).toBe(200);
  });

  it("rejects malformed and oversized projects before creating a server", async () => {
    await expect(runtime.start({ ...request(), entryFile: "/src/Missing.jsx" })).rejects.toThrow("entry file is missing");
    await expect(runtime.start(request("bad-path", { "/../outside.jsx": "export default 1" }))).rejects.toThrow();
    await expect(runtime.start(request("too-large", { "/src/App.jsx": "x".repeat(5 * 1024 * 1024 + 1) }))).rejects.toThrow("exceeds 5 MB");
  });
});
