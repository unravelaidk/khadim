# Khadim Desktop

Initial Tauri scaffold for the Khadim desktop app.

Useful commands:

- `pnpm --filter @khadim/desktop dev` for the frontend only
- `pnpm --filter @khadim/desktop tauri dev` for the desktop app
- `pnpm --filter @khadim/desktop build` for the frontend bundle

Current scope:

- React + Vite frontend
- Tauri 2 Rust shell
- Basic command bridge between the frontend and native layer

Next likely steps:

- Reuse shared UI/state from `apps/web`
- Add filesystem and project-open flows
- Add local settings, recent projects, and native menus
