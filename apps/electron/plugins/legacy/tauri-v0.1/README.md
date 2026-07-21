# Legacy Tauri plugin reference

This directory restores the contract, host implementation, and example source
from the retired Tauri desktop plugin prototype as a read-only design
reference. These files don't run in the Electron v1 host.

The restored files come from Git commit `64312d4`. The `source/` directory
preserves their original paths under `apps/desktop/` so you can compare the old
host and packages with the Electron implementation. The prototype included a
Wasmtime host, manifest loader, plugin manager, native tool bridge, persistent
store, HTTP and workspace filesystem imports, UI events, and renderer custom
elements.

The archive excludes generated `Cargo.lock`, `plugin.wasm`, and bundled `ui.js`
files. Build products aren't needed to study the source, and the obsolete WASM
modules aren't compatible with the Electron v1 ABI.

The restored source contains these areas:

- `source/apps/desktop/src-tauri/src/plugins/` contains the Rust host, manager,
  manifest parser, and native bridge.
- `source/apps/desktop/plugins/calendar/` contains the calendar plugin's Rust
  tool implementation and React custom-tab source.
- `source/apps/desktop/plugins/pomodoro/` contains the timer plugin's Rust tool
  implementation and React custom-tab source.
- `source/apps/desktop/plugins/web-search/` contains the HTTP-enabled search
  tool implementation.
- `khadim-plugin-v0.1.wit` preserves the original tool-focused component model.

The archived React files intentionally retain their historical inline colors,
font sizes, and layout. They are reference material, not current design-system
code, and must not be imported into the Electron renderer.

See the [Electron migration notes](../../../docs/plugins.md#migration-from-the-tauri-prototype)
for the concepts retained in v1 and the unsafe surfaces that were removed.
