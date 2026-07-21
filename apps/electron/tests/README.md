# Test Suite

Tests are grouped by the scope they exercise:

- `unit/` — isolated policies, reducers, lifecycle helpers, and pure domain behavior.
- `integration/` — filesystem repositories, application modules, and rendered feature behavior with adapters replaced by fakes.
- `e2e/` — complete renderer workflows through the runtime-neutral `KhadimClient` seam.

The current e2e suite runs the complete React application against an in-memory desktop bridge. It does not launch a packaged Electron binary or control the operating system.

Run a level with `bun run test:unit`, `bun run test:integration`, or `bun run test:e2e`. `bun run test` runs all levels.
