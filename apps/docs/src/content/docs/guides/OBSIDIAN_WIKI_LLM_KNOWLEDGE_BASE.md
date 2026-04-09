---
title: Obsidian Wiki and LLM Knowledge Base
description: Use the Obsidian wiki plugin to build a compounding, LLM-authored knowledge base inside an Obsidian vault.
---

Khadim includes an Obsidian wiki plugin that implements **Andrej Karpathy's LLM Knowledge Base pattern** — a self-maintaining, compounding knowledge system built entirely by AI.

## The Vision: AI-Authored Wiki

Traditional note-taking creates isolated notes that never connect. RAG systems query raw documents but hallucinate and lack transparency. Karpathy's insight: **treat the LLM as a compiler** that transforms raw source material into a living, interlinked wiki.

> *"Instead of re-deriving answers from raw documents every time, the LLM incrementally builds and maintains a structured, interlinked wiki."*
> — Andrej Karpathy

## Core Philosophy

### The Compiler Analogy

Think of your knowledge workflow like a compiler pipeline:

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   raw/      │ --> │   wiki/     │ --> │   index.md  │
│  (source)   │     │  (compiled) │     │  (symbols)  │
└─────────────┘     └─────────────┘     └─────────────┘
   Immutable        Read by LLM         Navigation
   Preserve truth   Synthesize knowledge  Find related
```

| Layer | Purpose | Contents |
|-------|---------|----------|
| `raw/` | **Source of truth** | Original articles, PDFs, web clips, notes — never edited after import |
| `wiki/` | **Compiled knowledge** | LLM-authored summaries, concept pages, entity pages, analyses |
| `index.md` | **Symbol table** | Quick navigation to all wiki pages by category |

### Why This Works

1. **Compounding growth** — Each new source enriches existing articles rather than creating isolated notes
2. **Transparency** — You can audit exactly what the LLM extracted and how it connected ideas
3. **No hallucination of retrieval** — Links point to real wiki pages, not guessed content
4. **Self-correcting** — The wiki can be updated when sources change or understanding evolves

## Three-Layer Architecture

### Layer 1: `raw/` — Immutable Source Archive

All upstream material goes here untouched:

```text
raw/
├── articles/
│   ├── attention-is-all-you-need.md
│   └── karpathy-llm-wiki-post.md
├── papers/
│   └── transformers-paper.md
├── web-clips/
│   └── HackerNews-thread-on-agents.md
└── README.md
```

**Rules:**
- Never edit files in `raw/` after import
- Include metadata (source URL, date, tags) in frontmatter
- Use Obsidian Web Clipper or paste raw content

### Layer 2: `wiki/` — LLM-Authored Knowledge Base

The compiled wiki with structured, interlinked pages:

```
Wiki/
├── index.md          # Main navigation (symlink table)
├── overview.md      # What this wiki is about
├── schema.md        # Page type definitions
├── log.md           # Operation history
│
├── sources/         # Summaries of raw documents
│   ├── karpathy-llm-wiki-post.md
│   └── transformers-paper.md
│
├── entities/        # Named things (people, products, orgs)
│   ├── andrej-karpathy.md
│   ├── openai.md
│   └── transformers.md
│
├── concepts/        # Reusable ideas and abstractions
│   ├── llm-knowledge-base.md
│   ├── rag-alternatives.md
│   └── attention-mechanism.md
│
└── analyses/        # Preserved query outputs
    ├── llm-wiki-vs-rag-comparison.md
    └── knowledge-management-trends.md
```

### Layer 3: `index.md` — Navigation Index

Quick-access navigation with section-based organization:

```md
# Hanan's Wiki

> Personal knowledge base powered by LLM compilation

## Entities (5)
- [[andrej-karpathy]] — AI researcher, creator of Andrej Karpathy channel
- [[openai]] — AI research company behind GPT models

## Concepts (12)
### AI & Technology
- [[llm-knowledge-base]] — Self-maintaining wiki compiled by AI
- [[attention-mechanism]] — Core transformer innovation

### Workflow
- [[second-brain]] — Personal knowledge compounding system
- [[compiler-analogy]] — Source → Compiled → Index pipeline
```

## Wiki Page Types

### Source Pages (`sources/`)

Summarize and annotate raw documents:

```md
---
source: https://gist.github.com/karpathy/442a6bf5...
date: 2025-04-06
tags: [llm, knowledge-management, karpathy]
---

# Karpathy's LLM Knowledge Base Post

## Summary
Andrej Karpathy describes a pattern for building personal knowledge bases 
using LLMs, replacing traditional RAG with a self-maintaining wiki.

## Key Claims
- Markdown-first approach beats vector databases for personal use
- The LLM acts as a "compiler" from raw sources to wiki
- Three-layer architecture: raw → wiki → index

## Connections
- Related to: [[second-brain]], [[zettelkasten]]
- Extends: [[rag-alternatives]]
```

### Entity Pages (`entities/`)

Document named things with rich context:

```md
---
type: person
tags: [ai, researcher]
sources: [karpathy-llm-wiki-post]
---

# Andrej Karpathy

AI researcher and educator. Former Tesla Autopilot director, 
CS professor at Stanford. Known for making deep learning accessible.

## Key Ideas
- [[llm-knowledge-base]] — His pattern for AI-authored wikis
- Compiler analogy for knowledge systems

## Contributions
- micrograd, minGPT, llm.c
- Extensive YouTube tutorials on neural networks
```

### Concept Pages (`concepts/`)

Abstract ideas that connect multiple sources:

```md
---
tags: [knowledge-management, llm, workflow]
linked-sources: [karpathy-llm-wiki-post, second-brain-article]
---

# LLM Knowledge Base

A personal knowledge management system where an LLM continuously 
compiles raw source material into an interlinked wiki.

## Core Principles
1. **Raw is sacred** — Original sources are never modified
2. **Compilation is incremental** — New sources update existing pages
3. **Links create meaning** — Wikilinks connect concepts across pages

## Implementation
- See: [[obsidian-wiki-plugin]] for the Khadim implementation
- Similar to: [[zettelkasten]], [[second-brain]]
```

### Analysis Pages (`analyses/`)

Preserved outputs from queries and investigations:

```md
---
query: Compare LLM wiki vs traditional RAG approaches
date: 2025-04-08
llm: claude-sonnet-4
---

# LLM Wiki vs Traditional RAG Comparison

| Aspect | LLM Wiki | Traditional RAG |
|--------|----------|-----------------|
| Retrieval | Exact wikilinks | Vector similarity |
| Hallucination | None in wiki | Possible in retrieval |
| Auditability | Full trace | Opaque chunks |
| Maintenance | Self-correcting | Static index |
```

## Workflow: Building Your LLM Wiki

### Step 1: Bootstrap

Open your Obsidian vault as a Khadim workspace and run:

```text
bootstrap_llm_wiki with vault_name: "My Knowledge Base"
```

This creates:
- `Wiki/index.md`, `Wiki/log.md`, `Wiki/schema.md`, `Wiki/overview.md`
- `Wiki/sources/`, `Wiki/entities/`, `Wiki/concepts/`, `Wiki/analyses/`
- `raw/` directory with README
- `AGENTS.md` with LLM instructions

### Step 2: Ingest Sources

Add raw material to the vault:

1. **Web clips** — Use Obsidian Web Clipper to save articles as Markdown
2. **PDFs** — Parse with the liteparse skill, save to `raw/`
3. **Notes** — Paste or import existing notes
4. **Research papers** — Download arXiv PDFs, extract text

### Step 3: Ask Khadim to Compile

```text
Please ingest the sources in raw/articles/ and:
1. Create source pages in Wiki/sources/
2. Extract entities and create pages in Wiki/entities/
3. Identify concepts and create pages in Wiki/concepts/
4. Update index.md with new entries
5. Log the operation in log.md
```

### Step 4: Query and Extend

Ask questions that compound knowledge:

```text
What does Karpathy say about the compiler analogy for knowledge bases?
How does this connect to the second-brain concept?
```

Khadim will:
1. Search the wiki for relevant pages
2. Synthesize an answer
3. Optionally preserve the answer as an analysis page

### Step 5: Maintenance

Periodically run health checks:

```text
wiki_health_check
```

This reports:
- Missing core files (`index.md`, `log.md`, `schema.md`)
- Orphan pages (not linked from anywhere)
- Broken wikilinks

## Khadim's Obsidian Wiki Plugin

The plugin implements all the LLM Wiki patterns:

### Available Tools

| Tool | Description |
|------|-------------|
| `bootstrap_llm_wiki` | Create starter vault structure |
| `upsert_note` | Write a wiki note with optional index update |
| `append_log_entry` | Record an operation in log.md |
| `ensure_index_entry` | Add entry to index.md section |
| `wiki_health_check` | Lint wiki structure |

### Installation

```bash
cd examples/plugins/obsidian-wiki
npm install
npm run build
./build.sh --install
```

Then enable in **Settings → Plugins**.

### Configuration

In `plugin.toml`:

```toml
[[config]]
key = "wiki_root"
description = "Root folder for generated wiki pages"
field_type = "string"
default_value = "Wiki"

[[config]]
key = "raw_root"
description = "Root folder for immutable raw source documents"
field_type = "string"
default_value = "raw"
```

## Design Principles

### 1. Raw is Sacred
Never edit files in `raw/`. This preserves the source of truth and allows reprocessing if LLM understanding changes.

### 2. Compounding Over Collection
Each new source should update existing wiki pages rather than creating isolated notes. If `transformers-paper.md` mentions "attention mechanism," it should link to or update `attention-mechanism.md`, not create a new page.

### 3. Links Create Meaning
Wikilinks (`[[page-name]]`) are first-class. They represent explicit connections the LLM has made, unlike vector similarity which is implicit.

### 4. Log Everything
The `log.md` tracks operations so you can audit how the wiki evolved. This also helps the LLM understand context when working on the wiki.

### 5. Index for Discovery
`index.md` is the quick-access navigation. Keep it organized by category so both humans and LLMs can find relevant pages quickly.

## Comparison with Alternatives

| Approach | Strengths | Weaknesses |
|----------|-----------|------------|
| **LLM Wiki (this)** | Compounding, transparent, auditable | Requires discipline in workflow |
| **Traditional RAG** | Scalable, mature tooling | Hallucination risk, opaque retrieval |
| **Vector search only** | Fast, simple | No synthesis, no links |
| **Manual notes** | Complete control | No AI assistance, siloed |

## Further Reading

- [Karpathy's LLM Knowledge Base Gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
- [ToolboxMD/karpathy-wiki](https://github.com/toolboxmd/karpathy-wiki) — Claude Code skills implementing the pattern
- [VentureBeat: How Karpathy's LLM KB Works](https://venturebeat.com/data/karpathy-shares-llm-knowledge-base-architecture-that-bypasses-rag-with-an)
- [Obsidian Documentation](https://help.obsidian.md/)

## Related Documentation

- [Examples](/guides/examples/) — Includes the `obsidian-wiki` example plugin
- [Getting Started](/getting-started/) — General plugin build and install flow
- [Manifest Reference](/reference/manifest/) — `plugin.toml` structure and config fields
- [AssemblyScript SDK](/reference/assemblyscript-sdk/) — Host ABI and SDK usage details
