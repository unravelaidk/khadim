import {
  log,
  fsReadFile,
  fsWriteFile,
  fsAppendFile,
  fsListDir,
  fsPathExists,
  fsLastError,
  FsDirEntry,
  jsonGetString,
  jsonEscapeString,
  toolResultOk,
  toolResultError,
  returnString,
  readArgs,
  __alloc,
} from "./sdk";

export { __alloc };

let wikiRoot = "Wiki";
let rawRoot = "raw";

export function khadim_info(): i64 {
  return returnString(
    '{"name":"Obsidian Wiki","version":"0.1.0",' +
    '"description":"Tools for bootstrapping and maintaining an Obsidian-based LLM wiki",' +
    '"author":"Khadim","license":"MIT","homepage":null,"min_host_version":null}'
  );
}

export function khadim_initialize(configPtr: i32, configLen: i32): i32 {
  const config = String.UTF8.decodeUnsafe(configPtr as usize, configLen, false);

  const configuredWikiRoot = jsonGetString(config, "wiki_root");
  if (configuredWikiRoot !== null && trimString(configuredWikiRoot!).length > 0) {
    wikiRoot = trimString(configuredWikiRoot!);
  }

  const configuredRawRoot = jsonGetString(config, "raw_root");
  if (configuredRawRoot !== null && trimString(configuredRawRoot!).length > 0) {
    rawRoot = trimString(configuredRawRoot!);
  }

  log.info("obsidian-wiki initialized (wiki_root=" + wikiRoot + ", raw_root=" + rawRoot + ")");
  return 0;
}

export function khadim_list_tools(): i64 {
  const json =
    '[' +
    '{"name":"bootstrap_llm_wiki","description":"Create a starter Obsidian LLM wiki structure in the current workspace.",' +
      '"params":[' +
        '{"name":"vault_name","description":"Display name for the vault/wiki","param_type":"string","required":false,"default_value":null}' +
      '],' +
      '"prompt_snippet":"- bootstrap_llm_wiki: Create the initial Obsidian wiki structure, index, log, schema, and AGENTS.md starter guide."},' +
    '{"name":"upsert_note","description":"Create or overwrite a markdown note, optionally updating the wiki index.",' +
      '"params":[' +
        '{"name":"path","description":"Vault-relative note path (for example Wiki/entities/Some Topic.md)","param_type":"string","required":true,"default_value":null},' +
        '{"name":"content","description":"Markdown body for the note","param_type":"string","required":true,"default_value":null},' +
        '{"name":"title","description":"Optional H1 title to prepend when the content has no heading","param_type":"string","required":false,"default_value":null},' +
        '{"name":"frontmatter","description":"Optional YAML frontmatter body without the surrounding --- markers","param_type":"string","required":false,"default_value":null},' +
        '{"name":"index_section","description":"Optional index.md section name to update","param_type":"string","required":false,"default_value":null},' +
        '{"name":"index_summary","description":"Optional one-line summary for the index entry","param_type":"string","required":false,"default_value":null}' +
      '],' +
      '"prompt_snippet":"- upsert_note: Write a structured wiki note to the Obsidian vault and optionally keep index.md in sync."},' +
    '{"name":"append_log_entry","description":"Append a structured chronological entry to the wiki log.",' +
      '"params":[' +
        '{"name":"date","description":"Entry date in YYYY-MM-DD format","param_type":"string","required":true,"default_value":null},' +
        '{"name":"kind","description":"Operation kind such as ingest, query, lint, or update","param_type":"string","required":true,"default_value":null},' +
        '{"name":"title","description":"Short title for the operation","param_type":"string","required":true,"default_value":null},' +
        '{"name":"body","description":"Markdown body for the log entry","param_type":"string","required":true,"default_value":null}' +
      '],' +
      '"prompt_snippet":"- append_log_entry: Record an ingest, query, or lint operation in log.md using the standard parseable heading format."},' +
    '{"name":"ensure_index_entry","description":"Insert or replace an entry inside the wiki index under a named section.",' +
      '"params":[' +
        '{"name":"section","description":"Index section heading without the leading ##","param_type":"string","required":true,"default_value":null},' +
        '{"name":"path","description":"Vault-relative note path for the linked page","param_type":"string","required":true,"default_value":null},' +
        '{"name":"summary","description":"One-line summary to show beside the link","param_type":"string","required":true,"default_value":null}' +
      '],' +
      '"prompt_snippet":"- ensure_index_entry: Keep index.md updated with a canonical bullet for a wiki page."},' +
    '{"name":"wiki_health_check","description":"Scan the wiki folder for missing core files, orphan pages, and broken wikilinks.",' +
      '"params":[],' +
      '"prompt_snippet":"- wiki_health_check: Lint the Obsidian wiki structure and report missing core files, orphan notes, and broken links."}' +
    ']';

  return returnString(json);
}

export function khadim_execute_tool(
  namePtr: i32,
  nameLen: i32,
  argsPtr: i32,
  argsLen: i32,
): i64 {
  const parts = readArgs(namePtr, nameLen, argsPtr, argsLen);
  const toolName = parts[0];
  const argsJson = parts[1];

  if (toolName == "bootstrap_llm_wiki") return returnString(toolBootstrapWiki(argsJson));
  if (toolName == "upsert_note") return returnString(toolUpsertNote(argsJson));
  if (toolName == "append_log_entry") return returnString(toolAppendLogEntry(argsJson));
  if (toolName == "ensure_index_entry") return returnString(toolEnsureIndexEntry(argsJson));
  if (toolName == "wiki_health_check") return returnString(toolWikiHealthCheck());

  return returnString(toolResultError("Unknown tool: " + toolName));
}

function toolBootstrapWiki(argsJson: string): string {
  const vaultName = valueOr(jsonGetString(argsJson, "vault_name"), "LLM Wiki");
  const created = new Array<string>();
  const skipped = new Array<string>();

  let err = writeIfMissing("AGENTS.md", buildAgentsContent(vaultName), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(rawRoot, "README.md"), buildRawReadme(), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(wikiRoot, "index.md"), buildIndexContent(), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(wikiRoot, "log.md"), buildLogContent(), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(wikiRoot, "overview.md"), buildOverviewContent(vaultName), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(wikiRoot, "schema.md"), buildSchemaContent(), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(joinPath(wikiRoot, "sources"), "README.md"), buildSectionReadme("Sources", "Summaries of raw source documents, one source per page, with links into entity and concept pages."), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(joinPath(wikiRoot, "entities"), "README.md"), buildSectionReadme("Entities", "Pages about people, organizations, products, places, or any persistent named thing."), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(joinPath(wikiRoot, "concepts"), "README.md"), buildSectionReadme("Concepts", "Reusable ideas, themes, claims, frameworks, and synthesized abstractions."), created, skipped);
  if (err !== null) return toolResultError(err!);

  err = writeIfMissing(joinPath(joinPath(wikiRoot, "analyses"), "README.md"), buildSectionReadme("Analyses", "Query outputs worth preserving: comparisons, timelines, briefings, and other synthesized artifacts."), created, skipped);
  if (err !== null) return toolResultError(err!);

  const lines = new Array<string>();
  lines.push("Bootstrapped Obsidian LLM wiki in workspace root.");
  lines.push("");
  lines.push("Created files: " + created.length.toString());
  for (let i = 0; i < created.length; i++) {
    lines.push("- " + created[i]);
  }
  if (skipped.length > 0) {
    lines.push("");
    lines.push("Skipped existing files: " + skipped.length.toString());
    for (let i = 0; i < skipped.length; i++) {
      lines.push("- " + skipped[i]);
    }
  }

  return toolResultOk(
    lines.join("\n"),
    '{"created":' + created.length.toString() + ',"skipped":' + skipped.length.toString() + '}'
  );
}

function toolUpsertNote(argsJson: string): string {
  const rawPath = jsonGetString(argsJson, "path");
  const content = jsonGetString(argsJson, "content");

  if (rawPath === null) return toolResultError("Missing required parameter: path");
  if (content === null) return toolResultError("Missing required parameter: content");

  const notePath = normalizeMarkdownPath(rawPath!);
  const title = jsonGetString(argsJson, "title");
  const frontmatter = jsonGetString(argsJson, "frontmatter");
  const indexSection = jsonGetString(argsJson, "index_section");
  const indexSummary = jsonGetString(argsJson, "index_summary");

  const body = buildNoteDocument(title, frontmatter, content!);
  const writeErr = fsWriteFile(notePath, body);
  if (writeErr !== null) {
    return toolResultError(writeErr!);
  }

  const messages = new Array<string>();
  messages.push("Wrote note: " + notePath);

  if (indexSection !== null && indexSummary !== null) {
    const indexErr = ensureIndexEntry(indexSection!, notePath, indexSummary!);
    if (indexErr !== null) {
      return toolResultError(indexErr!);
    }
    messages.push("Updated index section: " + indexSection!);
  }

  return toolResultOk(messages.join("\n"));
}

function toolAppendLogEntry(argsJson: string): string {
  const date = jsonGetString(argsJson, "date");
  const kind = jsonGetString(argsJson, "kind");
  const title = jsonGetString(argsJson, "title");
  const body = jsonGetString(argsJson, "body");

  if (date === null) return toolResultError("Missing required parameter: date");
  if (kind === null) return toolResultError("Missing required parameter: kind");
  if (title === null) return toolResultError("Missing required parameter: title");
  if (body === null) return toolResultError("Missing required parameter: body");

  const logPath = joinPath(wikiRoot, "log.md");
  if (!fsPathExists(logPath)) {
    const initErr = fsWriteFile(logPath, buildLogContent());
    if (initErr !== null) return toolResultError(initErr!);
  }

  const entry =
    "## [" + trimString(date!) + "] " + trimString(kind!) + " | " + trimString(title!) + "\n\n" +
    trimString(body!) + "\n\n";

  const appendErr = fsAppendFile(logPath, entry);
  if (appendErr !== null) return toolResultError(appendErr!);

  return toolResultOk("Appended log entry to " + logPath);
}

function toolEnsureIndexEntry(argsJson: string): string {
  const section = jsonGetString(argsJson, "section");
  const rawPath = jsonGetString(argsJson, "path");
  const summary = jsonGetString(argsJson, "summary");

  if (section === null) return toolResultError("Missing required parameter: section");
  if (rawPath === null) return toolResultError("Missing required parameter: path");
  if (summary === null) return toolResultError("Missing required parameter: summary");

  const err = ensureIndexEntry(section!, normalizeMarkdownPath(rawPath!), summary!);
  if (err !== null) return toolResultError(err!);

  return toolResultOk("Updated index section " + section! + " for " + rawPath!);
}

function toolWikiHealthCheck(): string {
  if (!fsPathExists(wikiRoot)) {
    return toolResultOk("Wiki root does not exist yet: " + wikiRoot + "\nRun bootstrap_llm_wiki first.");
  }

  const missingCore = new Array<string>();
  const coreFiles = new Array<string>();
  coreFiles.push(joinPath(wikiRoot, "index.md"));
  coreFiles.push(joinPath(wikiRoot, "log.md"));
  coreFiles.push(joinPath(wikiRoot, "overview.md"));
  coreFiles.push(joinPath(wikiRoot, "schema.md"));

  for (let i = 0; i < coreFiles.length; i++) {
    if (!fsPathExists(coreFiles[i])) {
      missingCore.push(coreFiles[i]);
    }
  }

  const files = new Array<string>();
  const walkErr = collectMarkdownFiles(wikiRoot, files);
  if (walkErr !== null) return toolResultError(walkErr!);

  const noteRefs = new Array<string>();
  const inbound = new Array<i32>();
  for (let i = 0; i < files.length; i++) {
    noteRefs.push(toNoteRef(files[i]));
    inbound.push(0);
  }

  const broken = new Array<string>();
  for (let i = 0; i < files.length; i++) {
    const content = fsReadFile(files[i]);
    if (content === null) {
      return toolResultError("Failed to read " + files[i] + ": " + fsLastError());
    }

    const links = extractWikiLinks(content!);
    for (let j = 0; j < links.length; j++) {
      const normalized = normalizeLinkRef(links[j]);
      if (normalized.length == 0) continue;

      const index = indexOfString(noteRefs, normalized);
      if (index >= 0) {
        inbound[index] = inbound[index] + 1;
      } else if (!containsString(broken, normalized)) {
        broken.push(normalized);
      }
    }
  }

  const orphans = new Array<string>();
  for (let i = 0; i < files.length; i++) {
    if (inbound[i] == 0 && !isStructuralNote(files[i])) {
      orphans.push(noteRefs[i]);
    }
  }

  const report = new Array<string>();
  report.push("# Wiki health check");
  report.push("");
  report.push("- Wiki root: `" + wikiRoot + "`");
  report.push("- Markdown files scanned: " + files.length.toString());
  report.push("- Missing core files: " + missingCore.length.toString());
  report.push("- Orphan notes: " + orphans.length.toString());
  report.push("- Broken links: " + broken.length.toString());

  if (missingCore.length > 0) {
    report.push("");
    report.push("## Missing core files");
    for (let i = 0; i < missingCore.length; i++) {
      report.push("- " + missingCore[i]);
    }
  }

  if (orphans.length > 0) {
    report.push("");
    report.push("## Orphan notes");
    for (let i = 0; i < orphans.length; i++) {
      report.push("- [[" + orphans[i] + "]]");
    }
  }

  if (broken.length > 0) {
    report.push("");
    report.push("## Broken wikilinks");
    for (let i = 0; i < broken.length; i++) {
      report.push("- [[" + broken[i] + "]]");
    }
  }

  if (missingCore.length == 0 && orphans.length == 0 && broken.length == 0) {
    report.push("");
    report.push("No structural issues found.");
  }

  return toolResultOk(
    report.join("\n"),
    '{"files":' + files.length.toString() + ',"orphans":' + orphans.length.toString() + ',"broken_links":' + broken.length.toString() + ',"missing_core":' + missingCore.length.toString() + '}'
  );
}

function ensureIndexEntry(section: string, notePath: string, summary: string): string | null {
  const indexPath = joinPath(wikiRoot, "index.md");
  if (!fsPathExists(indexPath)) {
    const initErr = fsWriteFile(indexPath, buildIndexContent());
    if (initErr !== null) return initErr!;
  }

  const existing = fsReadFile(indexPath);
  if (existing === null) {
    return "Failed to read " + indexPath + ": " + fsLastError();
  }

  const header = "## " + trimString(section);
  const noteRef = toNoteRef(notePath);
  const bullet = "- [[" + noteRef + "]] — " + trimString(summary);

  const lines = existing!.split("\n");
  const output = new Array<string>();
  let sectionFound = false;
  let inSection = false;
  let inserted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (startsWithText(line, "## ")) {
      if (inSection && !inserted) {
        output.push(bullet);
        inserted = true;
      }
      inSection = line == header;
      if (inSection) sectionFound = true;
      output.push(line);
      continue;
    }

    if (inSection && startsWithText(line, "- [[" + noteRef + "]]")) {
      if (!inserted) {
        output.push(bullet);
        inserted = true;
      }
      continue;
    }

    output.push(line);
  }

  if (!sectionFound) {
    if (output.length > 0 && trimString(output[output.length - 1]).length > 0) {
      output.push("");
    }
    output.push(header);
    output.push(bullet);
  } else if (!inserted) {
    output.push(bullet);
  }

  let finalContent = output.join("\n");
  if (!endsWithText(finalContent, "\n")) {
    finalContent += "\n";
  }

  const writeErr = fsWriteFile(indexPath, finalContent);
  if (writeErr !== null) return writeErr!;
  return null;
}

function writeIfMissing(path: string, content: string, created: Array<string>, skipped: Array<string>): string | null {
  if (fsPathExists(path)) {
    skipped.push(path);
    return null;
  }

  const err = fsWriteFile(path, content);
  if (err !== null) return err!;
  created.push(path);
  return null;
}

function collectMarkdownFiles(dir: string, out: Array<string>): string | null {
  const entries = fsListDir(dir);
  if (entries === null) {
    return "Failed to list " + dir + ": " + fsLastError();
  }

  for (let i = 0; i < entries!.length; i++) {
    const entry = entries![i];
    const child = joinPath(dir, entry.name);
    if (entry.isDir) {
      const err = collectMarkdownFiles(child, out);
      if (err !== null) return err!;
    } else if (endsWithText(entry.name, ".md")) {
      out.push(child);
    }
  }

  return null;
}

function extractWikiLinks(content: string): Array<string> {
  const links = new Array<string>();
  let cursor = 0;

  while (cursor < content.length) {
    const start = content.indexOf("[[", cursor);
    if (start < 0) break;

    const end = content.indexOf("]]", start + 2);
    if (end < 0) break;

    const raw = content.substring(start + 2, end);
    if (trimString(raw).length > 0) {
      links.push(raw);
    }
    cursor = end + 2;
  }

  return links;
}

function normalizeLinkRef(raw: string): string {
  let out = trimString(raw);

  const pipe = out.indexOf("|");
  if (pipe >= 0) out = out.substring(0, pipe);

  const hash = out.indexOf("#");
  if (hash >= 0) out = out.substring(0, hash);

  out = trimString(out);
  if (endsWithText(out, ".md")) {
    out = out.substring(0, out.length - 3);
  }
  return out;
}

function toNoteRef(path: string): string {
  const normalized = normalizeMarkdownPath(path);
  return normalized.substring(0, normalized.length - 3);
}

function normalizeMarkdownPath(path: string): string {
  let out = trimString(path);
  while (startsWithText(out, "./")) {
    out = out.substring(2);
  }
  if (!endsWithText(out, ".md")) {
    out += ".md";
  }
  return out;
}

function buildNoteDocument(title: string | null, frontmatter: string | null, content: string): string {
  const parts = new Array<string>();

  if (frontmatter !== null && trimString(frontmatter!).length > 0) {
    parts.push("---");
    parts.push(trimString(frontmatter!));
    parts.push("---");
    parts.push("");
  }

  const trimmedContent = trimString(content);
  if (title !== null && trimString(title!).length > 0 && !startsWithHeading(trimmedContent)) {
    parts.push("# " + trimString(title!));
    parts.push("");
  }

  parts.push(trimmedContent);

  let out = parts.join("\n");
  if (!endsWithText(out, "\n")) out += "\n";
  return out;
}

function startsWithHeading(content: string): bool {
  const trimmed = trimString(content);
  return startsWithText(trimmed, "#");
}

function buildAgentsContent(vaultName: string): string {
  return (
    "# Khadim Obsidian Wiki Guide\n\n" +
    "This workspace is an Obsidian vault using the `Obsidian Wiki` plugin to maintain a persistent LLM-authored knowledge base.\n\n" +
    "## Structure\n" +
    "- `" + rawRoot + "/` — immutable source material\n" +
    "- `" + wikiRoot + "/index.md` — catalog of wiki pages\n" +
    "- `" + wikiRoot + "/log.md` — append-only operational history\n" +
    "- `" + wikiRoot + "/overview.md` — current synthesis\n" +
    "- `" + wikiRoot + "/schema.md` — wiki conventions\n\n" +
    "## Workflow\n" +
    "1. Add new source documents to `" + rawRoot + "/`.\n" +
    "2. Summarize them into `" + wikiRoot + "/sources/`.\n" +
    "3. Update entity, concept, and analysis pages as understanding compounds.\n" +
    "4. Keep `index.md` and `log.md` current on every meaningful update.\n\n" +
    "## Goal\n" +
    "Build a persistent, interlinked wiki for **" + jsonEscapeString(vaultName) + "** rather than re-deriving knowledge from raw documents on every question.\n"
  );
}

function buildRawReadme(): string {
  return (
    "# Raw sources\n\n" +
    "Place immutable source documents here. Khadim should read from this folder but not rewrite source files.\n"
  );
}

function buildIndexContent(): string {
  return (
    "# Index\n\n" +
    "## Overview\n" +
    "- [[" + wikiRoot + "/overview]] — Current high-level synthesis and working thesis.\n\n" +
    "## Sources\n\n" +
    "## Entities\n\n" +
    "## Concepts\n\n" +
    "## Analyses\n\n" +
    "## Operations\n" +
    "- [[" + wikiRoot + "/log]] — Append-only chronology of ingests, queries, and lint passes.\n" +
    "- [[" + wikiRoot + "/schema]] — Conventions for maintaining the wiki.\n"
  );
}

function buildLogContent(): string {
  return (
    "# Log\n\n" +
    "Append entries using the format `## [YYYY-MM-DD] kind | title` so the timeline stays parseable with simple grep commands.\n\n"
  );
}

function buildOverviewContent(vaultName: string): string {
  return (
    "# Overview\n\n" +
    "This wiki is the persistent synthesis layer for **" + jsonEscapeString(vaultName) + "**.\n\n" +
    "Use this page to maintain the current thesis, major themes, and unresolved questions as new sources are added.\n"
  );
}

function buildSchemaContent(): string {
  return (
    "# Schema\n\n" +
    "## Operating model\n" +
    "- Raw sources live under `" + rawRoot + "/` and stay immutable.\n" +
    "- The wiki under `" + wikiRoot + "/` is entirely LLM-maintained.\n" +
    "- `index.md` is the content catalog; `log.md` is the chronological audit trail.\n\n" +
    "## Page families\n" +
    "- `sources/` — summaries of individual documents\n" +
    "- `entities/` — durable named things\n" +
    "- `concepts/` — reusable ideas and synthesized claims\n" +
    "- `analyses/` — saved outputs from important queries\n\n" +
    "## Maintenance rules\n" +
    "- Update cross-links when new evidence changes understanding.\n" +
    "- Note contradictions instead of silently overwriting them.\n" +
    "- File good ad hoc analyses back into the wiki so they compound.\n"
  );
}

function buildSectionReadme(title: string, description: string): string {
  return "# " + title + "\n\n" + description + "\n";
}

function isStructuralNote(path: string): bool {
  const ref = toNoteRef(path);
  return ref == joinPath(wikiRoot, "index") ||
    ref == joinPath(wikiRoot, "log") ||
    ref == joinPath(wikiRoot, "overview") ||
    ref == joinPath(wikiRoot, "schema") ||
    endsWithText(ref, "/README");
}

function joinPath(left: string, right: string): string {
  if (left.length == 0) return right;
  if (right.length == 0) return left;
  if (endsWithText(left, "/")) return left + right;
  return left + "/" + right;
}

function trimString(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && isWhitespace(value.charCodeAt(start))) start++;
  while (end > start && isWhitespace(value.charCodeAt(end - 1))) end--;

  return value.substring(start, end);
}

function isWhitespace(code: i32): bool {
  return code == 0x20 || code == 0x09 || code == 0x0A || code == 0x0D;
}

function startsWithText(value: string, prefix: string): bool {
  return value.indexOf(prefix) == 0;
}

function endsWithText(value: string, suffix: string): bool {
  if (suffix.length > value.length) return false;
  return value.substring(value.length - suffix.length) == suffix;
}

function containsString(values: Array<string>, needle: string): bool {
  return indexOfString(values, needle) >= 0;
}

function indexOfString(values: Array<string>, needle: string): i32 {
  for (let i = 0; i < values.length; i++) {
    if (values[i] == needle) return i as i32;
  }
  return -1;
}

function valueOr(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  const trimmed = trimString(value!);
  return trimmed.length > 0 ? trimmed : fallback;
}
