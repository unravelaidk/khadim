---
title: Examples
description: Use the included example plugins as working references for your own SDK usage.
---

## TypeScript Hello World

Path: `examples/plugins/ts-hello-world`

This is the best starting point for the current Plugin SDK docs site.

It shows:

- plugin metadata export
- initialization from config JSON
- listing tool definitions as JSON
- executing tools from a host-provided name and args payload
- logging, HTTP, and simple string processing

Included tools:

- `greet`
- `count_words`
- `reverse`
- `fetch_title`

## Obsidian Wiki

Path: `examples/plugins/obsidian-wiki`

This is a more realistic plugin that manages files inside an Obsidian vault. It demonstrates how a plugin can wrap repeated workspace workflows into higher-level agent tools.

It is useful when you need examples of:

- larger plugin structure
- multiple tool exports
- filesystem-heavy flows
- workspace-specific automation

## How to use the examples

1. Start from `ts-hello-world` when you are learning the ABI and manifest shape.
2. Move to `obsidian-wiki` when you need a real plugin with richer file operations.
3. Keep your first custom plugin minimal until you have the install and permissions flow working.
