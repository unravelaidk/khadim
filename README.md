# Khadim

Khadim is an AI workspace monorepo with a web app, a desktop app, and shared packages used across both runtimes.

## Repository Layout

- `apps/web`: React Router + Express web application
- `apps/desktop`: Tauri desktop application
- `apps/firecracker-sandbox`: sandbox-related app and tooling
- `packages/*`: shared workspace packages
- `examples/*`: example plugins and integrations

## Development

Requirements:

- `bun`
- Node.js-compatible local development environment

Common commands:

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run test`
- `bun run typecheck`
- `bun run desktop:dev`

## License

This repository is proprietary and not open source.

- See `LICENSE` for details.
- `license` is marked as `UNLICENSED` in the root `package.json`.

Copyright (c) 2026 Unravel AI. All rights reserved.
