# Contributing to Khadim

Thank you for your interest in contributing to Khadim! This document provides guidelines and information to help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Messages](#commit-messages)
- [Reporting Issues](#reporting-issues)
- [Getting Help](#getting-help)

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

## How to Contribute

### Reporting Bugs

- Search [existing issues](https://github.com/unravel-ai/khadim/issues) before creating a new one
- Use the bug report template if available
- Include steps to reproduce, expected behavior, and actual behavior
- Include your OS, Bun version, Rust version, and Node.js version

### Suggesting Features

- Open an issue with the `enhancement` label
- Describe the problem you're trying to solve, not just the solution
- Include use cases and examples

### Contributing Code

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feat/my-feature`
3. **Make your changes** with appropriate tests
4. **Run checks** before submitting:
   ```bash
   bun run test
   bun run typecheck
   bun run build
   ```
5. **Submit a pull request** against `main`

### Contributing Documentation

Documentation improvements are always welcome. This includes:
- Fixing typos or unclear explanations
- Adding examples or tutorials
- Improving inline code comments
- Translating documentation

## Development Setup

### Prerequisites

- [Bun](https://bun.sh/) (latest)
- [Rust](https://rustup.rs/) (stable toolchain, for desktop app work)
- [Node.js](https://nodejs.org/) ≥ 20
- Docker (optional, for sandbox testing)

### Getting Started

```bash
git clone https://github.com/<your-username>/khadim.git
cd khadim
bun install
```

### Running the Apps

```bash
# Web app
bun run dev

# Desktop app (requires Rust toolchain)
bun run desktop:dev

# Run tests
bun run test

# Type-check
bun run typecheck
```

### Desktop Development

The desktop app uses Tauri with a Rust backend. Additional requirements:

- Rust stable toolchain via `rustup`
- System dependencies for Tauri (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/))

To check the Rust code:

```bash
cd apps/desktop/src-tauri
cargo check
```

## Project Structure

```
apps/
  web/                  # Web app (React Router + Express)
  desktop/              # Desktop app (Tauri + React)
    src/                # Frontend React code
    src-tauri/          # Rust backend
      src/
        commands/       # Tauri command handlers
        db.rs           # SQLite persistence
        git.rs          # Git operations
        opencode.rs     # OpenCode sidecar
        claude_code.rs  # Claude Code bridge
        terminal.rs     # PTY terminal
        ...
  firecracker-sandbox/  # Sandbox tooling
packages/               # Shared packages
examples/               # Plugin examples
```

## Pull Request Process

1. **Keep PRs focused** — one feature or fix per PR
2. **Write descriptive titles** — e.g., `feat(desktop): add fuzzy file finder` not `update stuff`
3. **Include context** in the PR description:
   - What does this change?
   - Why is it needed?
   - How was it tested?
   - Screenshots/recordings for UI changes
4. **Ensure CI passes** — tests, type-checks, and builds must be green
5. **Respond to review feedback** promptly
6. **Squash commits** if asked by maintainers

### PR Labels

- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `refactor` — code restructuring without behavior change
- `test` — adding or updating tests
- `chore` — maintenance, dependencies, CI

## Coding Standards

### TypeScript / React (Frontend)

- Use TypeScript strict mode
- Prefer functional components with hooks
- Use the existing CSS variable / glass token system for styling
- Keep components focused and composable

### Rust (Desktop Backend)

- Follow standard Rust formatting (`cargo fmt`)
- Run `cargo clippy` and address warnings
- Use `Result` types for fallible operations
- Keep Tauri commands thin — put logic in dedicated modules

### General

- Write meaningful variable and function names
- Add comments for non-obvious logic
- Keep functions short and focused
- Avoid introducing new dependencies without discussion

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`

**Scopes:** `web`, `desktop`, `agent`, `rpc`, `docker`, `plugins`, `db`

**Examples:**

```
feat(desktop): add PTY-backed terminal component
fix(web): handle WebSocket reconnection on network change
docs: add contribution guidelines
refactor(agent): extract tool trait to shared module
test(rpc): add integration tests for Hono routes
```

## Reporting Issues

When reporting issues, include:

- **Environment**: OS, Bun version, Rust version, Node.js version
- **Steps to reproduce**: minimal, clear steps
- **Expected behavior**: what should happen
- **Actual behavior**: what actually happens
- **Logs/screenshots**: any relevant output or visuals

## Getting Help

- **Issues**: for bugs and feature requests
- **Discussions**: for questions, ideas, and general conversation
- **Code comments**: read the existing code, especially `AGENTS.md` and `apps/desktop/DESIGN.md`

## License

By contributing to Khadim, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).

---

Thank you for helping make Khadim better! 🙏
