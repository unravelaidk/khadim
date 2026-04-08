# Khadim Desktop

Initial Tauri scaffold for the Khadim desktop app.

Useful commands:

- `bun --filter @khadim/desktop dev` for the frontend only
- `bun --filter @khadim/desktop tauri dev` for the desktop app
- `bun --filter @khadim/desktop build` for the frontend bundle

Current scope:

- React + Vite frontend
- Tauri 2 Rust shell
- Basic command bridge between the frontend and native layer

Next likely steps:

- Reuse shared UI/state from `apps/web`
- Add filesystem and project-open flows
- Add local settings, recent projects, and native menus
