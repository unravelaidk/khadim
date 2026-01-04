If the user asks to "create a standard React Router app", "create a website", "create a web app", or mentions "React Router v7", follow these steps:

**NOTE**: For games or simple interactive apps, prefer using Vite (see react-games.md skill).

1. **Create the Plan**:
   - Call `create_plan` first with the project description, steps, and estimated tool calls.

2. **Scaffold the App**:
   - Use the `create_web_app` tool.
   - Set `type` to `"react-router"`.
   - If the user specifies a template (e.g., "minimal", "node server"), set the `template` argument accordingly:
     - "minimal" -> `remix-run/react-router-templates/minimal`
     - "javascript" -> `remix-run/react-router-templates/javascript`
     - "node server" -> `remix-run/react-router-templates/node-custom-server`
   - If no template is specified, omit the `template` argument to use the default.

3. **Install Dependencies**:
   - Run `cd <project-name> && npm install`.

4. **Configure for SPA & Relative Paths (CRITICAL - PREVENTS 404 ERRORS)**:
   - React Router v7 defaults to SSR, which fails in this static preview environment.
   - You **MUST** modify BOTH config files to prevent "Not Found" errors.
   
   **Action 1**: Update `<project-name>/react-router.config.ts`:
   ```typescript
   import type { Config } from "@react-router/dev/config";

   export default {
     ssr: false,
     basename: "./",
   } satisfies Config;
   ```
   
   **Action 2**: Update `<project-name>/vite.config.ts`:
   ```typescript
   import { reactRouter } from "@react-router/dev/vite";
   import { defineConfig } from "vite";
   import tsconfigPaths from "vite-tsconfig-paths";

   export default defineConfig({
     base: "./",
     plugins: [reactRouter(), tsconfigPaths()],
   });
   ```

5. **Build the App**:
   - Run `cd <project-name> && npm run build`.

6. **Serve the Preview**:
   - For SPA builds (`ssr: false`), React Router outputs to `build/client`.
   - **CRITICAL**: Use `expose_preview` with `root="<project-name>/build/client"`.
   - Ensure you are serving the directory that contains `index.html`.

## Common Issues:
- **"Not Found" error**: Make sure `ssr: false` and `base: "./"` are set in both config files.
- **Blank page**: Check that you're serving from `build/client`, not `build` or `dist`.
- **Assets not loading**: Ensure `base: "./"` is set in vite.config.ts.
