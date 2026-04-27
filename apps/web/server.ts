import { loadEnv } from "./app/lib/load-env";
import compression from "compression";
import express, { type Request, type Response, type NextFunction } from "express";
import morgan from "morgan";
import { initDbos } from "./app/lib/dbos";

loadEnv();

// Start DBOS durable execution engine (non-blocking)
if (process.env.KHADIM_USE_DBOS === "true") {
  initDbos().catch((err) => {
    console.error("[DBOS] Failed to initialize:", err);
  });
}

// Short-circuit the type-checking of the built output.
const BUILD_PATH = "./build/server/index.js";
const DEVELOPMENT = process.env.NODE_ENV === "development";
const PORT = Number.parseInt(process.env.PORT || "3000");

const app = express();
let injectAgentWebSocket: ((server: import("node:http").Server) => void) | null = null;

app.use(compression());
app.disable("x-powered-by");

if (DEVELOPMENT) {
  console.log("Starting development server");
  const vite = await import("vite");
  const viteDevServer = await vite.createServer({
    server: { middlewareMode: true },
  });
  const source = await viteDevServer.ssrLoadModule("./server/app.ts");
  injectAgentWebSocket = source.injectAgentWebSocket;
  app.use(viteDevServer.middlewares);
  app.use(async (req: Request, res: Response, next: NextFunction) => {
    try {
      const nextSource = await viteDevServer.ssrLoadModule("./server/app.ts");
      return await nextSource.app(req, res, next);
    } catch (error) {
      if (typeof error === "object" && error instanceof Error) {
        viteDevServer.ssrFixStacktrace(error);
      }
      next(error);
    }
  });
} else {
  console.log("Starting production server");
  app.use(
    "/assets",
    express.static("build/client/assets", { immutable: true, maxAge: "1y" }),
  );
  app.use(morgan("tiny"));
  app.use(express.static("build/client", { maxAge: "1h" }));
  const mod = await import(BUILD_PATH);
  injectAgentWebSocket = mod.injectAgentWebSocket;
  app.use(mod.app);
}

const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

injectAgentWebSocket?.(server);
