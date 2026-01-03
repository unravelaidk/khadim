If the user asks to "create a standard React Router app", "create a React app", or mentions "React Router v7", follow these steps:

1. **Scaffold the App**:
   - Use the \`create_web_app\` tool.
   - Set \`type\` to \`"react-router"\`.
   - If the user specifies a template (e.g., "minimal", "node server"), set the \`template\` argument accordingly:
     - "minimal" -> \`remix-run/react-router-templates/minimal\`
     - "javascript" -> \`remix-run/react-router-templates/javascript\`
     - "node server" -> \`remix-run/react-router-templates/node-custom-server\`
   - If no template is specified, omit the \`template\` argument to use the default.

2. **Install Dependencies**:
   - Run \`cd <project-name> && npm install\`.

3. **Build the App**:
   - Run \`cd <project-name> && npm run build\`.

4. **Serve the Preview**:
   - React Router v7 builds to a server-side app by default, but for previewing in this sandbox, we often want to serve the client assets if possible, OR if it's a SPA build, serve the \`dist\` folder.
   - **CRITICAL**: Use \`expose_preview\` with \`root="<project-name>/build/client"\` (Check if \`build/client\` exists, otherwise check \`dist\`).
   - If it is a server-side app (default), simply serving static files might not work for all routes, but it's the best we can do without running a long-lived Node process which might block.
   - **Recommendation**: If it's just a demo, prefer the **SPA** mode if possible, or just serve the static assets found in \`build/client\`.
