---
title: Getting help
description: Find command help, provider information, logs, and project resources.
---

Khadim includes help inside the CLI and keeps project documentation in this
site. Start with the CLI when you need command syntax, then use the docs for
workflow and architecture context.

## CLI help

Print the command help:

```bash
khadim --help
```

Show the installed version:

```bash
khadim --version
```

List providers:

```bash
khadim --providers
```

List models for a provider:

```bash
khadim --models anthropic
```

Inside the terminal UI, type `/help` or press `/` to open command suggestions.

## Configuration help

Open the settings panel from the terminal UI:

```text
/settings
```

You can also press `F2`. The settings panel manages provider, model, API key,
theme, and related preferences.

Use `/config` to show the configuration directory path.

## Project help

Use these project resources when you need more context:

- [GitHub repository](https://github.com/unravelaidk/khadim)
- [Issues](https://github.com/unravelaidk/khadim/issues)
- [Contributing guide](https://github.com/unravelaidk/khadim/blob/main/CONTRIBUTING.md)
- [Plugin SDK](../plugins/overview/)
- [Configuration reference](../reference/configuration/)
