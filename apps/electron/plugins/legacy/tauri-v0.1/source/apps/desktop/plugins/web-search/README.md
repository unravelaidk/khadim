# Khadim Plugin: Web Search

DuckDuckGo web search plugin for Khadim. Gives the agent access to
up-to-date information from the web.

## Tool

| Name | Description |
|------|-------------|
| `web_search` | Search the web via DuckDuckGo. Returns titles, URLs, and snippets. |

### Parameters

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | — | The search query |
| `max_results` | integer | no | 8 | Maximum results to return |

## How it works

1. Queries DuckDuckGo's HTML search endpoint (`html.duckduckgo.com`)
2. Parses result links, titles, and snippets from the response
3. Falls back to the DuckDuckGo Instant Answer JSON API if HTML parsing
   yields no results

No API key required.

## Permissions

| Permission | Required | Reason |
|-----------|----------|--------|
| `http` | yes | To make requests to DuckDuckGo |
| `fs` | no | — |
| `store` | no | — |

Allowed hosts: `*.duckduckgo.com`

## Build

```bash
# Build the WASM binary
./build.sh

# Build and install into ~/.local/share/khadim/plugins/
./build.sh --install
```

Requires `rustup target add wasm32-unknown-unknown`.

## Install (from the app)

Use the plugin install command and point it at this directory, or run
`build.sh --install` to copy the files directly into the plugin directory.

Once installed, enable the plugin from **Settings → Plugins** in the desktop app.
