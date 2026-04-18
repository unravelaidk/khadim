# khadim-cli

CLI coding agent for Khadim.

## Usage

```bash
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --prompt "summarize this repo"
cargo run --manifest-path apps/khadim-cli/Cargo.toml -- --cwd /path/to/project
```

Environment defaults:

- `KHADIM_PROVIDER`
- `KHADIM_MODEL`
- provider-specific API keys like `OPENAI_API_KEY`
