# Electron Domain Context

## Vocabulary

- **Project** — a registered local folder that owns Chats and Artifacts.
- **Chat** — a persisted draft conversation in a Project. Its `engineSessionKey` links it to CLI context.
- **Artifact** — persisted generated output owned by a Project and optionally linked to a Chat run.
- **Run** — one supervised Khadim CLI execution with buffered, sequenced events.
- **Settings** — the active Project, model catalog selection, harness, and theme.
- **Credential** — encrypted provider or connector secret. Plaintext exists only at an execution adapter.
- **Skill** — discovered `SKILL.md` metadata plus a local enabled state.
- **Connector** — configuration and lifecycle for an external system such as Discord or search.

## Invariants

- A Chat and every Artifact belong to exactly one Project.
- A Project cannot be relocated or removed while it has an active Run.
- A model Credential remains attached only while provider, model ID, and endpoint are unchanged.
- Stored credentials are never returned through the preload interface.
- Repository writes are serialized and atomic.
- Electron IPC event names and `KhadimDesktopApi` are compatibility contracts.
