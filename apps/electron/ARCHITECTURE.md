# Electron onion architecture

The main process follows an inward dependency rule:

```text
Renderer UI -> preload adapter -> Electron IPC adapter (main/index.ts)
                                      |
                                      v
                              application modules
                                      |
                                      v
                           domain policies + repository interfaces
                                      ^
                                      |
                         filesystem / credential adapters
```

## Rings

`src/main/domain` contains persisted domain shapes, policies, and repository interfaces. It must not import Electron, Discord, filesystem adapters, or application modules.

`src/main/application` contains use-case orchestration for Settings, Projects, Search configuration, Discord configuration, and Project activation. These modules depend on domain interfaces and receive variable behavior through constructor dependencies.

`src/main/infrastructure` contains adapters for atomic JSON documents, Project/Chat/Artifact files, Settings files, filesystem Skill discovery, and Electron secure storage.

`src/main/index.ts` is the composition root and Electron IPC adapter. It creates adapters, injects them into application modules, supervises the CLI runtime, and preserves the existing preload contract.

The renderer is the outer UI ring. It communicates only through `KhadimDesktopApi`; the preload module is the adapter from that interface to IPC.

## WebAssembly plugin boundary

Plugins are outer runtime adapters, not domain or application modules. The
composition root discovers packages through `PluginManager`, invokes modules
through short-lived workers, and delegates harness lifecycle to
`PluginHarnessRunner`.

The worker imports only bounded memory. It cannot import Electron, Node.js,
filesystem, process, or network functions. A plugin returns declarative HTTP
request plans; the main process validates the manifest allowlist before it
performs a request. Plugin harness output re-enters the application through the
same normalized `AgentStreamEvent` contract as the built-in CLI harness.

The typed preload exposes plugin discovery, configuration, installation, and
enablement. Secrets remain in the main process credential vault. See the
[WebAssembly plugin guide](./docs/plugins.md) for the package format and SDK
contract.

## Repository seams

- `ProjectRepository` — Project registration and availability.
- `ConversationRepository` — Chat persistence.
- `ArtifactRepository` — Artifact persistence.
- `SettingsRepository` — serialized Settings snapshots and mutations.
- `SkillRepository` — Skill discovery and enabled-state persistence.
- `DocumentRepository<T>` — small configuration documents used by Search and Discord adapters.

Repositories represent persisted aggregates. CLI execution, Electron windows, Discord connection lifecycle, and credential encryption are runtime gateways/adapters, not repositories.

## Compatibility

The original `project-store.ts`, `settings-persistence.ts`, `project-activation.ts`, and credential-policy import paths remain available to avoid breaking tests and downstream imports. New composition code depends on the domain interfaces and named infrastructure adapters.

`architecture.test.ts` enforces the dependency direction for domain and application modules.
