# Obsidian Wiki Plugin

A Khadim WASM plugin for building and maintaining an **LLM-authored Obsidian wiki** inside the current workspace.

## What it does

This plugin gives Khadim higher-level tools for the workflow described in the “LLM Wiki” pattern:

- bootstrap a vault with `raw/`, `Wiki/index.md`, `Wiki/log.md`, `Wiki/schema.md`, and starter pages
- create or overwrite wiki notes with consistent markdown structure
- keep `index.md` in sync with canonical section entries
- append parseable log entries
- lint the wiki for missing core files, orphan notes, and broken wikilinks

## Important assumption

The plugin uses the Khadim **filesystem sandbox**, so it can only access files inside the active workspace root.

That means your Khadim workspace should point at the **Obsidian vault root** you want to manage.

## Tools exposed to the agent

After install, the agent sees namespaced tools like:

- `plugin_obsidian_wiki_bootstrap_llm_wiki`
- `plugin_obsidian_wiki_upsert_note`
- `plugin_obsidian_wiki_append_log_entry`
- `plugin_obsidian_wiki_ensure_index_entry`
- `plugin_obsidian_wiki_wiki_health_check`

## Config

`plugin.toml` declares two optional settings:

- `wiki_root` — default `Wiki`
- `raw_root` — default `raw`

## Build

```bash
cd examples/plugins/obsidian-wiki
npm install
npm run build
cp build/release.wasm plugin.wasm
```

Or use:

```bash
./build.sh
```

## Install

```bash
./build.sh --install
```

That copies the plugin into:

```text
~/.local/share/khadim/plugins/obsidian-wiki/
```

Then enable it in **Settings → Plugins**.

## Suggested workflow

1. Open your Obsidian vault as the Khadim workspace.
2. Run `bootstrap_llm_wiki` once.
3. Drop source material into `raw/`.
4. Ask Khadim to summarize sources into `Wiki/sources/` and update `entities/`, `concepts/`, and `analyses/`.
5. Periodically run `wiki_health_check`.

## Notes

- The bootstrap tool creates `AGENTS.md` only if it does not already exist.
- The plugin is intentionally simple and file-based; it does not depend on any Obsidian community plugin or local REST API.
- It is best suited for markdown-centric vaults where Khadim is the primary wiki maintainer.
