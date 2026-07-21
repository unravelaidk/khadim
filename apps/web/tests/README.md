# Web tests

The React Router web application keeps tests grouped by the interface they exercise:

- `unit/` covers pure domain logic and isolated React modules.
- `integration/` covers route handlers, Hono RPC, WebSocket/session behavior, repositories, and adapters. Tests here may inject fakes but do not require a browser.
- `e2e/` is reserved for browser-to-built-server journeys backed by isolated Postgres and Redis services. Application-module mocks do not belong here.
- `support/` contains shared test harnesses and fixtures; it is not a test suite.

Run the fast suites with `bun run test:unit` and `bun run test:integration`. `bun run test` runs both. Browser E2E receives its own command when the service-backed harness lands.
