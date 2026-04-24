# Agent Tool Improvements

## Problem

The previous toolset made large file edits unnecessarily difficult:

1. **Bash file edits are brittle** — Using `cat << 'EOF'`, `sed`, or `awk` inside bash commands fails with special characters, large files hit argument-length limits, and heredoc escaping is error-prone.
2. **`write` is token-expensive** — Rewriting a 500-line file just to change 3 lines requires sending the entire file content through the LLM context.
3. **`edit` was too restrictive** — The old `edit` tool required `old_text` to be **globally unique** in the file. If a pattern appeared twice, the tool rejected the edit, forcing the agent to fall back to bash or `write`.

## Solution

We added three new first-class file tools and enhanced the existing `edit` tool:

| Tool | Purpose | When to use |
|------|---------|-------------|
| `append` | Add text to the end of a file | Adding imports, config entries, log lines, or new functions without reading the file first |
| `line_edit` | Replace a range of lines by 1-indexed line number | Large files where you know the line numbers from a previous `read`. Most reliable for big edits because it never depends on unique text matching. |
| `patch` | Apply a unified diff (`diff -u` format) | Complex multi-line changes, refactoring, or when you want to change several nearby lines at once. Very token-efficient. |
| `edit` (enhanced) | Find-and-replace with `count` control | Small surgical changes. `count=0` replaces all matches; `count=2` replaces the first two. No longer requires global uniqueness. |

## Tool Details

### `append`

```json
{
  "path": "src/lib.rs",
  "content": "pub mod new_module;\n"
}
```

- Creates the file if it does not exist.
- No need to read the file first — extremely token-efficient.

### `line_edit`

```json
{
  "path": "src/main.rs",
  "start_line": 42,
  "end_line": 45,
  "content": "    let x = 1;\n    println!(\"{}\", x);"
}
```

- `start_line` is 1-indexed and inclusive.
- `end_line` is optional; defaults to `start_line` (replace a single line).
- Use `read` with line numbers first, then `line_edit` for guaranteed success.

### `patch`

```json
{
  "path": "src/main.rs",
  "patch": "--- a/src/main.rs\n+++ b/src/main.rs\n@@ -10,3 +10,4 @@\n fn main() {\n     println!(\"hello\");\n+    println!(\"world\");\n }"
}
```

- Accepts standard unified diff format.
- If `path` is omitted, the tool extracts the file path from the `---` / `+++` headers (strips `a/` and `b/` prefixes automatically).
- Great for changing multiple contiguous lines with minimal tokens.

### `edit` (now with `count`)

```json
{
  "path": "src/main.rs",
  "edits": [
    {
      "old_text": "foo",
      "new_text": "bar",
      "count": 0
    }
  ]
}
```

- `count` defaults to `1` (first match only).
- `count: 0` replaces **all** matches.
- Any positive number replaces up to that many matches.

## Prompt Guidance

The system prompt now instructs the agent:

> - Use edit for small changes, write for new files or full rewrites.
> - Use line_edit for reliable changes to large files (replace by line number).
> - Use append to add content to the end of a file without reading it first.

## Bash is Still Available

The `bash` tool remains for:
- Running compilers, tests, and package managers
- One-off shell pipelines (`find`, `xargs`, etc.)
- Anything that genuinely requires a subprocess

But agents should **prefer the dedicated file tools** for file mutations — they are faster, deterministic, and use fewer tokens.
