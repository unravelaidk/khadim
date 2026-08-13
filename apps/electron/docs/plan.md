# Studio implementation plan and research handoff

This document gives the next agent the current state, architecture decisions,
research record, and ordered implementation plan for Khadim Studio. Start here
before changing artifact persistence, the design editor, preview execution, or
agent-assisted editing.

<!-- prettier-ignore -->
> [!IMPORTANT]
> The current implementation is an Electron prototype in `apps/electron`. The
> repository-level product context still describes the older Tauri desktop app.
> Don't copy Tauri-specific assumptions into this package without checking the
> Electron code.

## Product outcome

Studio is a local-first workspace where you can create and edit three artifact
families without leaving the project:

- **Documents** provide structured text editing and reliable page-based PDF
  output.
- **Websites** combine visual React composition, source files, responsive
  preview, and PDF output.
- **Canvases** provide an infinite spatial editor for diagrams and sketches.

Chat and Studio share the same project, selected agent, selected model, and run
engine. An agent edit must update the open artifact in place and preserve
unrelated content.

## Current implementation

The current branch already has the core artifact and website-editor path. Treat
the following behavior as working unless a focused test proves otherwise:

- Artifacts use a versioned, project-owned schema with `document`, `site`, and
  `canvas` kinds.
- A website stores editable files, a generated preview, and a Puck visual
  document in one `web-project` content record. New websites default to a real
  React Router v7 project with Vite scripts, browser route modules, and a
  standard `index.html` entry.
- Puck provides visual component selection, drag-and-drop composition, viewport
  controls, and direct inline text editing.
- The Puck registry now includes constrained section, stack, columns, spacer,
  navigation, image, card, text, and button primitives. Nested slot content is
  regenerated into both managed React source and printable HTML.
- Puck and the generated React project use the same semantic CSS classes. The
  Design iframe receives the artifact's local CSS files, so a Monaco stylesheet
  edit updates Design as well as Preview without leaking artifact styles into
  Khadim's renderer document.
- Monaco provides the source editor and uses a Khadim artifact URI for each
  model.
- Opening an artifact keeps the main project chat on the left and the editor
  on the right. Studio doesn't render a separate transcript or composer. The
  main chat preserves message history, tool activity, attachments, model and
  tool controls, run states, and keyboard behavior. While an artifact is open,
  prompts from this composer target that artifact through the normal run path.
  The divider supports pointer and keyboard resizing. At compact widths, the
  chat stacks above the editor.
- Preview is the default website surface. Design, Code, and Split remain one
  click away, so source editing is available without making code the primary
  Studio view.
- React preview materializes the artifact file map in an isolated temporary
  directory, runs an atomic Vite build, and serves the result from a supervised
  loopback-only origin. Each successful update returns a revisioned URL.
- The supervised runtime supports both legacy React projects and the React
  Router v7 template. It supplies Khadim's packaged React, React Router, and
  Vite dependencies, and doesn't execute artifact-authored Vite configuration.
- Project storage accepts the `react-router` framework discriminator. A new
  default website now survives its first save and reopens with the same file
  map, visual document, and preview metadata.
- Electron packaging stages Bun beside `khadim-cli` in the application
  resources. `KHADIM_BUN_BINARY` can provide a release-specific binary, and
  the staging script otherwise discovers Bun from `PATH`.
- The preview `iframe` is sandboxed and supports responsive, desktop, tablet,
  and mobile sizes. One persistent browser bar keeps the address, reload, build
  status, and viewport controls readable while only the artifact page scales.
  Device previews fit by width and scroll from the top. Clicking a live local
  address opens it through Electron's protocol-validated system-browser bridge.
  The app CSP permits HTTPS images in chat Markdown, but keeps scripts and
  arbitrary connections self-hosted and limits frames to self-hosted and
  `127.0.0.1` origins. The separate preview CSP still blocks external
  connections and object embedding.
- Closing an artifact or quitting the app stops its preview server and removes
  the temporary project. Compile failures keep the last successful preview
  visible, show a specific error, and link back to the affected Monaco file.
- New documents use one HTML source for direct page editing, Monaco source,
  scripts-disabled preview, agent revisions, persistence, and PDF export. Page
  size and orientation add an authoritative final `@page` rule.
- PDF export renders a safe artifact representation in a hidden Electron window
  and calls `webContents.printToPDF`.
- Selecting a Puck component exposes **Ask {agent}**. It opens a compact
  floating design chat instead of expanding a sidebar or shrinking the canvas.
- The design chat displays the active model, accepts the user's instruction,
  reports starting, running, complete, and error states, and remains open while
  the agent works.
- Agent edits use the normal run path. The run snapshot records the selected
  agent, model, harness, and tools before the main process starts the CLI.
- A targeted edit returns an `<artifact-edit>` JSON block. For a selected Puck
  component, `componentPatches` updates only that component by ID. Khadim
  applies a complete edit block as soon as it arrives in the text stream,
  records the edit in the main chat tool timeline, and removes the raw JSON
  from the visible response. Puck synchronizes the changed visual document
  into its live store without remounting the editor.
- An unreadable optional web-search credential no longer prevents the selected
  model from starting. The run falls back to DuckDuckGo, records the fallback
  as a completed web-search tool event, and keeps the configured provider
  selected so the user can reconnect it from **Apps**.
- **Apps** now treats Google Workspace as one account with independently
  visible Gmail, Drive, and Calendar grants. One desktop OAuth flow requests
  the read-only scopes, reports partial legacy grants, and lets you update or
  disconnect the account without exposing its tokens to the renderer.
- Gmail, Drive, and Calendar execute through bounded main-process native tools.
  Drive supports metadata and indexed-content search plus text export for Docs,
  Sheets, Slides, and text-like files. Calendar lists calendars and bounded
  event ranges. Every tool marks returned service content as untrusted.
- **Agents** is a public Alpha feature presented as a divided operational
  library rather than a persona gallery or permanent master-detail profile.
  Each row exposes the saved responsibility, model, runtime, access, current
  state, and latest run, then expands in place to show the full operating brief,
  service readiness, and recent work. Creation and editing use a focused object
  workspace ordered by responsibility, runtime, and least-privilege access.
  Job templates, custom instructions, per-agent Google allowlists, editing,
  deletion, and direct chat launch remain available. Each run saves the selected
  app allowlist in its immutable snapshot, and the main process exposes only the
  corresponding native tools. The supporting interface research is stored in
  [`agents-ui-patterns.json`](../research/agents-ui-patterns.json).
- **Studio** is labeled as a public Beta feature. Feature maturity is separate
  from the Electron package version, and neither public feature is hidden by a
  rollout flag. The shared policy and graduation criteria live in
  [`feature-maturity.md`](feature-maturity.md).
- A bundled Claude Code harness now mirrors the OpenCode plugin boundary. Its
  WASM adapter maps Claude stream JSON into normalized text, tool, usage,
  completion, and error events. A host-owned authenticated loopback bridge
  runs `claude` in the active project, resumes a durable UUID per chat, and
  terminates the process tree on cancellation, chat deletion, and shutdown.
- Selecting a plugin runtime keeps model choice in the chat composer. The
  selector now swaps to that runtime's own inventory: Claude Code uses a
  curated list gated by the installed CLI version, while OpenCode reads its
  connected-provider catalog from `opencode models --verbose` or an external
  server's `GET /provider`. The selection is remembered per harness, saved in
  the run snapshot, and passed to OpenCode or Claude Code, so Apps-level plugin
  settings can't silently override the visible chat choice.
- Codex, Cursor, and Grok are now bundled harness plugins beside Claude Code
  and OpenCode. Host-owned bridges adapt Codex app-server JSON-RPC and the
  Cursor and Grok ACP transports to the existing HTTP, event-stream, and WASM
  harness boundary. Each harness has its own composer model inventory.
- All five bundled harnesses can use the selected Studio artifact and the
  agent's allowed Google services through one host-owned MCP surface per chat.
  The main process replaces the tool registry for each immutable run snapshot,
  clears it at the terminal event, and keeps tokens out of renderer and WASM
  state. Claude Code, managed OpenCode, Codex, Cursor, and Grok receive the same
  bounded tool definitions through their native MCP attachment points.
- A shared composer question panel now handles single-choice, multi-choice,
  and custom answers. Claude `AskUserQuestion`, OpenCode `question.asked`,
  Codex `item/tool/requestUserInput`, Cursor `cursor/ask_question`, and Grok
  `x.ai/ask_user_question` all map to the same durable `question` event and
  answer IPC. Approvals remain a separate event type and use a dedicated card
  with once, session, decline, and cancel decisions. The runtime selector maps
  ask-first, automatic-edit, and full-access policies to Claude, OpenCode,
  Codex, Cursor, and Grok.
- The chat composer now merges all 26 Khadim CLI commands into an accessible
  slash-command picker. Every registry command has a desktop action, including
  conversation export, local history clearing, harness and harness-model
  selection, catalog refresh, and native multi-agent toggling. Claude Code's
  locally reported slash commands and skills join the same picker.
- Compact layouts keep the application grid, composer, sidebar overlay, and
  stacked Studio within the viewport after the desktop-density style pass.
- The renderer root now focuses on application orchestration. Chat composition,
  attachment presentation, tool activity, capabilities, settings, theme
  application, dialog focus, model branding, and message parsing live in
  focused modules under `src/renderer/src`. Preserve these seams when adding
  new chat or Studio behavior instead of moving feature state back into
  `App.tsx`.

The latest completed checks on July 25, 2026, were `642` passing tests, a clean
TypeScript check, and a successful production build. A packaging smoke check
also staged and executed Bun `1.3.13` beside the Khadim CLI slot. Packaged
Electron audits verified the main-chat and artifact split, light and dark
desktop layouts, the compact stacked layout, a live loopback React preview,
the complete Puck block registry, direct document editing and persistence, and
immediate server
shutdown after leaving Studio. A live configured-model run also verified that
an unreadable Parallel credential falls back without blocking chat, and a fresh
React Router v7 artifact verified preview startup, durable save, and cleanup.
A live Electron renderer probe also verified that an HTTPS chat image loads
under the scoped app CSP after the frontend module extraction. Focused renderer
tests verify that a changed artifact stylesheet replaces the CSS inside Puck's
iframe and that Puck blocks preserve the generated project's CSS hooks. Desktop
and compact visual audits also verify the browser preview's responsive page,
fixed browser controls, clickable local address, and top-aligned mobile view.

## Current artifact structure

The discriminated content union is the right boundary. Metadata, provenance,
and lifecycle stay common, while each editor owns its serializable content.

```text
Artifact
├── identity: id, projectId, schemaVersion
├── metadata: title, kind, lifecycle, createdAt, updatedAt
├── provenance: conversationId, messageId, runId
└── content
    ├── document-html: authored HTML + baseline + page settings
    ├── tiptap: legacy structured document + page settings
    ├── html: static HTML + baseline HTML
    ├── web-project
    │   ├── framework, entryFile
    │   ├── files, baselineFiles
    │   ├── previewHtml, baselinePreviewHtml
    │   └── visual: Puck data + editor identifier
    └── khadim-canvas: versioned pages, scene elements, assets, and app state
```

Keep this rule: the visual model is canonical for visually managed React
components, the file map is canonical for source-only files, and the rendered
preview is derived output. Don't make three independently editable sources of
truth.

Canvas persistence includes serializable `appState` and binary-file metadata.
The remaining lifecycle step is to store large binary assets outside
`artifacts.json` and reference them by stable local IDs.

## Editor structure

The editor uses one stable workspace shell with mode-specific tools. It does not
open each editor in a modal.

```text
Studio workspace
├── conversation pane: the existing main chat surface and composer
├── accessible resizable divider
└── editor pane
    ├── header: back, artifact identity, save state, PDF export
    ├── context bar: artifact-specific working modes
    └── active surface
        ├── Design: Puck canvas + component action + floating AI chat
        ├── Code or Source: compact file tree + Monaco
        ├── Write: directly editable, sandboxed HTML page
        ├── Preview: responsive browser frame
        └── Split: source and preview
```

The AI chat is a temporary parallel surface, not a permanent inspector. It
opens from the selected component, overlays the upper-right canvas edge, has no
scrim, and closes back to the same spatial context. Direct manipulation remains
the fastest path: click text and type; use the agent only for broader changes.

## Research conclusions

Web research was last run on August 6, 2026, against primary project
documentation and repositories. No academic sources are relevant because these
are software integration and license decisions. React Router now presents v8
as its current release, but v7 remains an intentional Khadim template boundary
and has an official non-breaking path to v8.

### Agent feedback: SoundCN and Thinking Orbs (August 6, 2026)

Parallel CLI extracts and searches compared the public SoundCN catalog with
Thinking Orbs `0.2.0`. The raw captures are
[`soundcn-ui-audio.json`](../research/soundcn-ui-audio.json),
[`orbs-thinking-animation.json`](../research/orbs-thinking-animation.json),
[`sound-orbs-comparison.json`](../research/sound-orbs-comparison.json), and
[`soundcn-khadim-shortlist.json`](../research/soundcn-khadim-shortlist.json).

Khadim uses the 20-pixel Orbs preset because it is independently tuned for
inline status rather than downscaled from the 64-pixel avatar. `working` covers
pre-response thought, `searching` covers web tools, `shaping` covers file and
artifact edits, `solving` covers shell execution, and `connecting` covers app
connectors. The monochrome canvas follows the document theme, freezes under
reduced-motion preferences, and pauses when hidden or offscreen. Keep the orb
as a focused status signal; real tool names, paths, results, and failures stay
visible in the adjacent activity disclosure.

Audio is intentionally sparse. Khadim vendors SoundCN's CC0 `click-soft`,
`notification-pop`, `success-chime`, and `error-buzz` assets and its dependency-
free Web Audio helper. They map only to send/accept, question or approval,
successful completion, and failure. Hover, navigation, streaming-token, and
individual tool-step sounds remain silent. Appearance offers an Apple-style
sound mood control: Off, Subtle (the default), or Expressive. The latter two
keep the same semantic sounds and vary only their presence, while the legacy
boolean preference migrates to Off or Subtle. Playback failure is always
non-blocking. The SoundCN World of
Warcraft collection is explicitly out of scope because it is not freely
licensed.

### Harness-native subagent monitoring (August 6, 2026)

Parallel Web searches and primary-source extracts compared the observable
subagent lifecycle for every bundled harness. The raw captures are
[`claude-code-subagent-protocol-official.json`](../research/claude-code-subagent-protocol-official.json),
[`opencode-subagent-protocol-official.json`](../research/opencode-subagent-protocol-official.json),
[`codex-subagent-protocol-official.json`](../research/codex-subagent-protocol-official.json),
[`cursor-subagent-protocol-official.json`](../research/cursor-subagent-protocol-official.json),
[`grok-subagent-protocol-official.json`](../research/grok-subagent-protocol-official.json),
their `*-general.json` follow-up searches, and the focused `*-extract.json`
captures in `apps/electron/research/`.

Keep one durable `AgentCoordinationActivity` renderer contract instead of
building a separate monitor for each provider. Populate it only after a real
worker is observed; enabling Team mode by itself must not add an empty card to
the transcript. The harness boundaries are:

- Khadim native emits explicit `worker_spawned`, `worker_event`, and terminal
  worker events.
- Claude Code launches subagents with `Agent` (`Task` before v2.1.63). The tool
  call id is the stable provisional worker id; inputs expose `subagent_type`
  and the delegated prompt, nested messages use `parent_tool_use_id`, and some
  completed agents return an `agentId`. Internal subagent steps are not always
  forwarded by the top-level stream, so the monitor must not invent them.
- OpenCode uses the `task` tool. Its inputs include `description`, `prompt`,
  `subagent_type`, optional `task_id`, and optional `background`; completion
  metadata exposes the child `sessionId` and selected `{modelID, providerID}`.
  The child session itself is created with `parentID`.
- Codex app-server exposes `collabToolCall` items through the normal
  `item/started` and `item/completed` lifecycle. The item carries `id`, `tool`,
  `status`, `senderThreadId`, optional receiver/new thread ids, `prompt`, and
  `agentStatus`. Usage remains a thread-level notification unless Codex adds a
  worker-level value.
- Cursor ACP exposes ordinary Task tool calls and the `cursor/task`
  notification. The latter carries `toolCallId`, `description`, `prompt`,
  `subagentType`, optional `model`, `agentId`, and `durationMs`.
- Grok Build documents native parallel subagents and the standard ACP
  transport, but currently publishes no dedicated subagent notification
  schema. Detect only positively identified subagent/Task tool calls correlated
  by `toolCallId`; do not treat Team mode or generic ACP activity as a worker.

The Agent monitor belongs centered and slightly inset within the owning
assistant turn. It remains collapsed by default, appears as soon as the first
helper is actually spawned (the primary plus one helper is already a
multi-agent run), and stays attached to that turn after completion for durable
history.

### Token usage semantics (August 6, 2026)

Parallel CLI searches, source extracts, and a local source review of T3 Code
and OpenCode established two different quantities that must not share one
ambiguous “tokens used” label. The raw captures are
[`t3code-token-usage-implementation.json`](../research/t3code-token-usage-implementation.json),
[`t3code-token-contract-extract.json`](../research/t3code-token-contract-extract.json),
[`t3code-codex-usage-extract.json`](../research/t3code-codex-usage-extract.json),
[`t3code-context-meter-extract.json`](../research/t3code-context-meter-extract.json),
[`opencode-token-usage-semantics.json`](../research/opencode-token-usage-semantics.json),
[`opencode-session-token-normalization-extract.json`](../research/opencode-session-token-normalization-extract.json),
[`acp-token-usage-semantics.json`](../research/acp-token-usage-semantics.json), and
[`acp-session-usage-extract.json`](../research/acp-session-usage-extract.json).

Khadim keeps processed usage as four mutually exclusive buckets: non-cached
input, output, cache read, and cache write. Their sum is the cumulative work
processed by the model. An inclusive provider input count must first subtract
cache read/write before entering that contract; cached tokens are never added
to an already-inclusive input total. OpenCode follows the same normalization
for its durable message usage and the native Khadim provider adapters already
do this for OpenAI and Google responses.

Context occupancy is separate session state. ACP `usage_update.used` and
`size` mean tokens currently in the context window and its effective limit;
they are not an input/output usage event. Codex app-server similarly exposes
`tokenUsage.last.totalTokens` as active context, `modelContextWindow` as the
limit, and `tokenUsage.total.totalTokens` as lifetime processed work. The
renderer therefore stores the latest context snapshot without accumulating it,
while processed buckets continue to accumulate across model calls.

The compact composer control stays hidden until either quantity exists. With
context data it displays an honest percentage/ring and a used-of-limit detail;
otherwise it displays cumulative processed tokens. The popover labels the
processed value explicitly, separates cache read/write from uncached input,
uses a proportional distribution rather than an arbitrary activity meter, and
warns only when context exceeds 90 percent.

### Penpot canvas architecture

A source-level comparison against Penpot commit
`4383cf183aa5a15e27d6ef2c7e00427b3c4b9be5` informed the native canvas path.
The reusable boundary is semantic rather than visual: Penpot keeps shapes,
prototype interactions, paths, transforms, constraints, and snap points as
validated data; workspace gestures produce reversible document changes; and
editable, viewer, and export renderers consume the same model independently.

Reusable definitions can contain linked component instances, so you can build
a card from a shared button without flattening either asset. Primitive override
keys remain stable for existing generated IDs, while nested properties use a path such
as `action/label`; `/` and `~` inside local IDs use JSON Pointer-style segment
escaping so a direct ID cannot collide with a nested path. Existing definitions
retain raw-key fallback whenever the full expanded path set proves it unambiguous.
Edits and variant switches canonicalize those legacy keys, and persistence rejects a raw
key that could silently retarget from a direct primitive to a nested path.
Editing an outer main writes a local override on its nested
instance; editing an outer copy writes the full path on that copy. Detaching
expands only the selected level and preserves each nested instance, its link,
and its scoped overrides. Editor rendering, prototype hotspots and timed
actions, thumbnails, SVG, PNG, and PDF output all resolve the same recursive
tree. Every consumer has a depth and ancestry guard, and persistence rejects
missing references, nested mains, direct or indirect component cycles, graphs
deeper than 32 definitions, graphs that expand beyond 20,000 rendered nodes per
definition, and pages that expand beyond 100,000 nodes. This follows Penpot's
shape-tree component model and its mutation-time nesting-loop guard while
placing an additional strict boundary on saved Khadim artifacts.

Layer appearance follows the same contract. Primitive and component layers
store one of Penpot's 16 blend modes plus bounded, independently visible layer
and background blur effects. Rectangles, frames, and images can switch between
a uniform radius and four clockwise corner radii. Shared geometry normalizes
adjacent radii before both the editor and exporter build the same SVG path, so
frame and bitmap clipping match the visible shape. Layer blur and blend modes
remain available in static SVG, PNG, and PDF output. Background blur is a live
editor and prototype-player effect and is intentionally omitted from static
exports, matching Penpot's documented export limitation. All appearance
controls use the shared undo history, component instances can apply effects to
their complete subtree, and persistence rejects unknown blend modes, blur
values above 100 pixels, and malformed or unsupported corner records. Instance
detachment stays disabled while a group-level blend or blur is active because
flattening that effect onto overlapping children would change the composition.

Shape paint also uses ordered semantic records. Closed primitives and text can
store up to 16 fills, and every primitive can store up to 16 strokes. Each
paint has a stable ID, visibility, opacity, and color. Fills support solid,
linear-gradient, and radial-gradient paint. Strokes add width, inside, center,
or outside alignment, and solid, dotted, dashed, or mixed patterns with
independent dash and gap values. The inspector lists the top paint first and
supports add, duplicate, reorder, hide, and delete actions with undo. Open
paths and text use centered strokes because SVG doesn't provide a closed
interior for clipping. The editor, prototype player, component overrides,
boolean results, masks, and static exporter consume the same ordered stacks.
Selection export and large-scene culling include center and outside stroke
outsets. Legacy single-fill and single-stroke fields remain compatibility
mirrors, so existing scenes render unchanged while edited shapes opt into the
new arrays. Persistence bounds paint counts and numeric values, rejects
duplicate paint IDs, and validates radial geometry and stroke options.

Layer effects use the same ordered-record contract. A primitive can store up
to 16 drop or inner shadows, each with a stable ID, visibility, color, opacity,
horizontal and vertical offsets, blur, and spread. The inspector lists the top
effect first and provides undoable add, duplicate, reorder, hide, and delete
actions. A shared SVG filter builder places drop shadows behind the source and
inner shadows above it, so the editor, prototype player, component overrides,
boolean results, and SVG, PNG, and PDF exports stay consistent. Mask geometry
suppresses shadows, while selection export and large-scene culling include
only visible drop-shadow outsets. Effect styles preserve complete stacks, and
the top visible drop remains a legacy single-shadow mirror. Persistence bounds
counts and numeric values and rejects duplicate IDs, unknown effect types, and
empty effect styles. When a legacy CSS-filter shadow enters the new stack, its
stored deviation is normalized to the new blur-radius scale without changing
its rendered softness or its compatibility mirror.

Khadim now follows that boundary for prototype interactions. Primitive and
component layers can persist click, hover, and timed triggers for page
navigation, previous-screen navigation, protocol-validated external URLs, and
page-backed overlays. Overlays support nine anchor positions, optional dimmed
backgrounds, outside-click dismissal, nested stacks, toggle and close actions,
and the same transitions as page navigation. The Studio player interprets
those records without changing static SVG or PDF export.
Page deletion removes incoming links so saved artifacts cannot retain broken
destinations. Instant, dissolve, and directional slide transitions store their
duration and easing with the interaction. The preview is a modal interaction
boundary: editor shortcuts are suspended, background controls are inert, focus
is trapped and restored, overlays move focus into their active layer, hover
interactions remain keyboard operable, and hotspots respect hidden ancestors,
masks, and clipped frames. Escape closes the top overlay before it exits the
preview. Persistence rejects malformed actions, unsafe URL protocols, invalid
delay and overlay options, duplicate triggers, and stale page destinations.
Pages can be reordered and belong to multiple named prototype flows. Each flow
has an independent start screen, and the compact flow controls let you add,
rename, select, retarget, and delete journeys without leaving the page rail.
The preview can switch flows and reset directly to each starting screen.
Deleting a start screen repairs every affected flow, and undo restores the
prior flow set. The legacy `prototypeStartPageId` remains a compatibility
mirror of the first flow.

Pages can now use an optional prototype viewport that is smaller than the full
authored page. You can choose vertical, horizontal, or two-axis scrolling,
see the viewport boundary on the editing canvas, and choose whether returning
through prototype history restores the previous scroll position. Any primitive
or component layer can use **Fix when scrolling**. The player separates the
topmost fixed subtrees from scrolling SVG content, keeps their hotspots pinned
and keyboard operable, and applies the same behavior inside overlays. Enabling
the setting promotes the fixed subtree above scrolling layers to make the
stacking contract explicit. Boolean groups remain atomic when an operand is
fixed. Fresh navigation and flow changes reset to the origin. Smart transitions
involving a scrollable page fall back to dissolve because the two moving
coordinate systems don't define one stable matching-layer transform.
Persistence bounds viewport dimensions to the page, enforces the non-scrolling
axis and topmost fixed-layer order, and validates fixed flags as booleans.

Penpot currently documents dissolve, slide, and push transitions. Khadim keeps
its existing dissolve and slide transitions and adds a smart transition as an
extension. Equal-sized screens match explicit smart-animation keys at any
layer depth, then fall back to unique top-level names and stable IDs. The
preview moves, scales, rotates, and crossfades a bounded set of non-overlapping
layer trees while the unmatched screen content dissolves. Ambiguous matches or
different page sizes fall back to dissolve, and reduced-motion settings skip
the animated intermediate state. The page rail continues to render bounded,
idle-updated thumbnails so scene edits stay visually navigable without
regenerating every preview during a gesture. PDF output emits every canvas page
on a separate sheet.

The command extraction now follows Penpot's change-builder model for targeted
agent and prototype edits. Direct editor gestures still use the older snapshot
commit path, so the next extraction is to route move, resize, add, delete, and
inspector mutations through the same semantic command transactions. The raw
comparison, exact upstream paths, and remaining gaps are recorded in
[`penpot-canvas-repo-comparison.json`](../research/penpot-canvas-repo-comparison.json).

The latest Penpot source check used `parallel-cli` against the current
`develop` branch on July 24, 2026. The relevant upstream boundaries remain
`common/src/app/common/files/changes_builder.cljc`,
`frontend/src/app/main/data/changes.cljs`,
`frontend/src/app/main/data/workspace/shapes.cljs`, and
`frontend/src/app/main/data/workspace/undo.cljs`. Penpot's current MCP and
Plugin API confirm the same rule: external callers resolve stable shape IDs and
emit validated workspace changes, while grouped undo records selection before
and after the transaction. Khadim keeps a smaller constrained command envelope
instead of executing arbitrary Plugin API code.

Large-scene interaction now builds one linear geometry/ancestor-state index per
scene revision and reuses it for hit testing, marquee selection, and snap
candidates. Persistence cycle detection is also linear and is covered at 8,000
nested elements. Scenes with 400 or more layers now reuse that index to render
only the padded viewport while retaining selected layers, ancestors, masks,
connector dependencies, active boolean operands, shadow overflow, and Bézier
extrema. The layer rail uses a fixed-row overscanned window with list position
metadata, page rows use browser-native content visibility, and page thumbnails
render only near the scroll viewport while the active page stays eager.
Large-scene tests cover culling, rail windowing, and editing a distant layer.

Page-level design controls now expose phone, tablet, desktop, presentation, and
A4 presets alongside bounded custom dimensions, orientation swapping, and page
background color. Every change stays page-local, participates in the shared
undo history, and updates the active-page compatibility mirror. Frame
auto-layout now supports fixed or hug sizing, main-axis distribution,
cross-axis alignment, padding, child gaps, fixed-frame wrapping, and a separate
gap between wrapped lines.

Pointer moves now resolve through deterministic snapping geometry instead of
component-local coordinate loops. A gesture builds peer, parent-frame, ruler,
and layout-grid targets once, then snaps selected bounds to edges, centers,
page geometry, equal peer spacing, or the configured pixel grid. Equal-spacing
feedback now extends through an existing run of three or more layers instead of
stopping at the moving layer's immediate neighbors. Rotated frame guides are
solved in the frame's local coordinate system, then returned as a world-space
movement vector with guide segments that follow the visible square, column, or
row grid. A rotated column-only or row-only grid keeps its unconstrained degree
of freedom, so it can combine with a compatible ruler or shape alignment. The
  viewport renders bounded alignment lines and labeled distance segments without
  writing feedback into the scene. Hold Control or Command while dragging to
  bypass every snap source for temporary free placement.

Canvas agent edits now use a pure semantic command boundary in
`src/shared/canvas-commands.ts`. Stable page, element, and interaction IDs
address bounded patch and prototype commands. A command group validates the
complete selection and prospective lock and interaction state before it
changes content, applies atomically, and returns exact inverse commands. The
inverse path preserves interaction ordering, optional-property presence,
legacy page-less content, explicit empty interaction lists, and undo for the
largest externally accepted command group.

Selecting one or more Canvas layers exposes a compact **Ask {agent}** panel.
The selected page and ordered layer IDs are saved in the immutable run
snapshot, verified again in the main process, and bound to `artifact_edit`.
Both the native tool path and legacy streamed edit fallback reject commands
outside that exact selection and reject unrelated artifact fields. Accepted
agent edits preserve the Canvas viewport and selection and enter history as
one undoable external revision.

Canvas artifacts now open with the project chat collapsed so the spatial editor
uses the full Studio width. A header-level **Show chat** control restores the
existing project conversation and resize separator on demand. The preference
is remembered per Canvas artifact for the current application session. The
collapsed pane remains mounted so unsent attachments and other composer-local
state survive, but `hidden`, `inert`, and `aria-hidden` keep it out of layout,
keyboard navigation, and the accessibility tree. Documents and websites retain
the always-visible conversation layout.

Direct prototype interaction authoring now uses the semantic command boundary
for add, patch, and remove operations. The inspector builds commands from the
live page and selection refs, applies the same persistence-compatible validation
as agent edits, and commits accepted results through the existing Canvas history
boundary. Each structural interaction change remains independently undoable and
redoable, while rejected stale interaction data leaves the scene unchanged.

`artifact_read` now returns a binary-free Canvas manifest with the active page,
bounded layer summaries, components, styles, tokens, prototype flows, and
structured omission counts. Every potentially large section is budgeted
incrementally, and the result remains valid JSON below the 240,000-character
tool response limit even for valid extreme scenes.

### Google Workspace read-only integrations

Use one Google desktop OAuth grant for the first read-only Workspace bundle:
Gmail, Drive, and Calendar. Keep service availability independent because old
grants can contain only Gmail. Use Drive `files.list` for bounded metadata and
indexed-content search, `files.get?alt=media` for text-like blob files, and
`files.export` for Google Docs, Sheets, and Slides. The official export table
confirms `text/plain` for Docs and Slides and `text/csv` for the first sheet of
a spreadsheet. Use Calendar's `calendarList.list` and `events.list` with a
bounded result count and explicit time range. The raw captures are in
[`google-workspace-readonly-apis.json`](../research/google-workspace-readonly-apis.json),
[`google-drive-readonly-api.json`](../research/google-drive-readonly-api.json),
and
[`google-drive-export-formats.json`](../research/google-drive-export-formats.json).

### Puck for React visual composition

Use Puck as the visual composition layer, not as the entire artifact runtime.
Puck is an MIT-licensed, modular React visual editor that accepts application
components and keeps the data under application control. Its documented model
supports component configuration, rich-text editing, data migration, viewports,
permissions, overlay portals, and UI overrides. This matches Khadim's need for
a branded editor and component-scoped agent actions without adopting a hosted
builder platform. See the [Puck repository](https://github.com/puckeditor/puck)
and [Puck documentation](https://puckeditor.com/docs).

### Monaco for source editing

Use Monaco as a code-editor component rather than embedding VS Code, Zed, or an
Atom-style desktop shell. Monaco is MIT licensed, browser-native, and built from
VS Code sources. Its model/editor/provider separation maps well to Khadim's
file-backed artifacts. Give every file a stable virtual URI, preserve view
state per file, and dispose models when an artifact closes. Monaco's own guide
also notes that URI choice affects TypeScript import resolution and JSON schema
selection. See the [Monaco repository](https://github.com/microsoft/monaco-editor)
and [official Monaco site](https://microsoft.github.io/monaco-editor).

### Native semantic canvas

Keep Khadim's native, versioned canvas scene instead of replacing it with an
embedded whiteboard. The editor now owns pages, frames, vector paths, editable
SVG import, reusable components and variants, auto layout, constraints, grids,
guides, masks, boolean shapes, connectors, tokens and styles, ordered fill,
stroke, and shadow stacks, radial gradients, prototype interactions, and
SVG/PNG/PDF export. Shared geometry, paint, effects, boolean, and export modules
keep the persisted model usable outside the editor UI. Penpot's architecture is
the reference for the next extraction: editor gestures should become semantic,
reversible commands while view and export remain independent consumers of the
same model.

### Vite for executable web-project previews

Use Vite when Studio needs real React module execution, imports, assets,
and hot updates. The Vite JavaScript API exposes typed `createServer` and
`build` entry points, including middleware mode. Run this lifecycle in the main
process or a supervised child process, bind it to one artifact workspace, and
serve the preview through a constrained local origin. Don't run an unrestricted
dev server inside the renderer. See the
[Vite JavaScript API](https://vite.dev/guide/api-javascript).

### React Router v7 and bundled Bun

Use React Router v7 Data Mode as the default website project boundary. The
starter uses `createBrowserRouter`, route modules, and `RouterProvider`, and it
ships the usual Vite project files. This gives the user a portable React Router
project without requiring the preview runtime to import authored route modules
in Electron's privileged main process. See the
[React Router Data Mode documentation](https://reactrouter.com/start/data/custom)
and the
[React Router route configuration guide](https://reactrouter.com/start/data/routing).

Don't enable React Router Framework Mode in the supervised preview yet. Its SPA
build can pre-render by importing route modules during the build. Artifact and
agent-authored code is untrusted, so route execution must remain in the
sandboxed browser preview until Khadim moves builds into the isolated runner.

Bundle Bun with Khadim instead of asking the user to install it. The packaging
stage copies a platform Bun executable into the same resource directory as the
Khadim CLI. Generated projects include normal `bun run dev` and
`bun run build` compatible scripts, while the in-app preview continues to use
the supervised Vite JavaScript API. See the
[Bun standalone executable documentation](https://bun.sh/docs/bundler/executables).

### Codex-style browser workbench

Keep the main chat visible beside the live preview. Don't create a second
Studio-specific transcript or composer. The Codex app treats the browser as a
shared user-and-agent view inside the thread, supports rendered-state review,
and keeps source changes available without turning the browser into a separate
application. Khadim follows the same spatial model while retaining its own
artifact modes and local-first runtime. See the Codex app
[browser documentation](https://developers.openai.com/codex/app/browser) and
[feature overview](https://developers.openai.com/codex/app/features).

### Claude Code harness integration

Use Claude Code through a bundled WASM harness plus a host-owned process
bridge. T3 Code's current Claude adapter confirms the important runtime
boundaries: use the project directory, preserve a durable SDK session UUID,
enable partial messages, keep tool events separate from assistant text, apply
model and permission settings explicitly, and interrupt the owned runtime on
cancel. Khadim keeps its existing HTTP and server-sent event harness ABI rather
than importing T3 Code's provider framework.

The bridge supplies an SDK session ID on the first turn and resumes it on later
turns. It binds to `127.0.0.1` on an ephemeral port, requires a random bearer
token, validates configuration before starting the SDK query, and never
invokes a shell. The WebAssembly plugin remains sandboxed and process-free. See
the
[T3 Code Claude adapter](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeAdapter.ts),
[T3 Code Claude provider](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeProvider.ts),
and [Claude Agent SDK permission documentation](https://platform.claude.com/docs/en/agent-sdk/permissions).

### Multi-harness questions and approval boundary

Follow T3 Code's provider-specific adapters but preserve one Khadim renderer
contract. T3 normalizes question request and resolution events across Claude,
OpenCode, Codex, Cursor, and Grok, while each adapter translates the answer
back to its native protocol. Khadim follows that division: plugins map events,
the host owns pending response state, and the composer renders one sequential
question flow.

Questions and approvals remain different event types. A question supplies
information the agent needs; an approval authorizes a potentially sensitive
action. The host keeps pending approval state, emits the normalized request to
the renderer, and returns once, session, decline, or cancel decisions in each
native protocol's response shape. Runtime access is saved in the immutable run
snapshot and caps native modes so an older saved mode can't silently grant more
access. The research captures are
[`t3code-harness-question-tools.json`](../research/t3code-harness-question-tools.json),
[`harness-question-protocols.json`](../research/harness-question-protocols.json),
and
[`codex-cursor-grok-harness-protocols.json`](../research/codex-cursor-grok-harness-protocols.json).
The cross-harness MCP captures are in
[`plugin-harness-native-tools.json`](../research/plugin-harness-native-tools.json),
[`acp-session-setup-extract.json`](../research/acp-session-setup-extract.json),
[`codex-app-server-dynamic-tools.json`](../research/codex-app-server-dynamic-tools.json),
and [`codex-http-mcp-config.json`](../research/codex-http-mcp-config.json).

### Electron for PDF output

Keep PDF generation in the Electron main process. `webContents.printToPDF`
returns a `Promise<Buffer>` and supports background graphics, page size,
margins, CSS page size, tagged PDF, and document outlines. Render a controlled
artifact document in a hidden, sandboxed window, wait for load completion, then
print and destroy the window. See the
[Electron `webContents` documentation](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions).

### Rejected directions

The research and product constraints rule out these directions for now:

- Don't use GrapesJS. The user rejected its product and licensing direction,
  and Puck fits React component ownership more directly.
- Don't embed VS Code, Zed, or Atom. Khadim needs a focused source editor, not a
  second application shell or extension host.
- Don't make raw generated HTML the only website format. Keep static HTML as a
  supported artifact, but use file-backed projects for React and future
  frameworks.
- Don't replace the semantic canvas with an embedded whiteboard. Khadim needs
  design-system assets, component instances, layout rules, and prototype links
  that remain available to agents, validators, viewers, and exporters.

## Ordered implementation plan

Work in the following order. Keep each phase independently testable and don't
start the next runtime layer while the current interaction is unreliable.

### Phase 0: verify the component AI loop

This is the immediate next task because the implementation is new and the
headless screenshot audit was incomplete.

1. Open a React artifact with a configured model.
2. Select each component type and confirm **Ask {agent}** opens the chat.
3. Submit an instruction and verify the saved `AgentRun` contains the active
   model and selected agent.
4. ~~Feed a real successful `<artifact-edit>` response and confirm the selected
   component changes without replacing siblings.~~
5. Verify launch failure, run failure, invalid edit JSON, artifact closure, and
   project switching.
6. Capture light, dark, compact-width, reduced-motion, and increased-contrast
   screenshots.
7. ~~Add a renderer workflow test for the complete Studio-to-agent-to-patch
   path.~~

Exit this phase only when the user can see a clear starting state within one
frame, a persistent running state, and either an applied change or a specific
error in the same panel.

### Phase 1: deepen the Puck editor

After the agent loop is reliable, turn the starter Puck configuration into a
real design system.

1. ~~Extract the Puck component registry from `PuckSurface.tsx`.~~
2. ~~Add layout primitives: section, stack, columns, spacer, image, card, and
   navigation.~~
3. ~~Add style fields through constrained tokens instead of arbitrary CSS
   text.~~
4. Add component migrations so saved visual documents survive registry changes.
5. ~~Add keyboard behavior: Enter sends to the agent, Shift+Enter inserts a
   line, Escape closes the panel, and focus returns to the selected
   component.~~
6. Add undo/redo coverage for direct edits and agent-applied edits.
7. Preserve the canvas viewport and selected component after an agent patch.

Exit this phase when common landing-page layouts can be built without opening
the source editor and remain editable after restart.

### Phase 2: add a supervised Vite preview runtime

Use Vite to execute file-backed React artifacts without weakening Electron's
renderer boundary.

The React and React Router v7 slices are complete. `ArtifactPreviewRuntime`
performs an atomic Vite build instead of leaving a dependency optimizer or
watcher alive. It serves built files through a loopback-only HTTP server, swaps
revisions only after successful compilation, and owns temporary-directory
cleanup. Typed IPC connects this lifecycle to the renderer. Static HTML
continues to use the scripts-disabled `srcDoc` path.

1. Define an artifact runtime service in the main process.
2. Materialize an artifact's file map in a dedicated temporary directory.
3. Start one constrained Vite server per active preview or reuse a supervised
   server with explicit artifact routing.
4. Return a local preview URL through typed IPC.
5. Stop watchers and child processes when the artifact, project, or application
   closes.
6. Surface compile errors in Preview and map them back to Monaco files.
7. Add tests for imports, CSS, assets, runtime cleanup, port collision, and
   malformed projects.

Exit this phase when a multi-file React artifact with imports and CSS renders
the same in Preview and PDF preparation.

### Phase 3: deepen the artifact editors

1. Extract semantic canvas commands and grouped undo transactions from
   `CanvasEditor`. The pure command layer, exact inverse generation, agent
   command path, direct prototype interaction path, and indexed large-scene
   geometry are complete; direct move, resize, add, delete, hierarchy, and the
   remaining appearance and layout inspector actions still need to migrate from
   snapshot commits.
2. ~~Add selection-aware agent patch protocols for prototype interactions.~~
3. Harden the HTML document editor with selection-scoped agent patches,
   revision history, and long-document pagination fixtures.
4. Add export fixtures for long documents, complex multi-page canvases, and compiled
   web-project print styles.

Exit this phase when all three artifact kinds support direct editing, targeted
agent editing, persistence, reload, and PDF output.

### Phase 4: harden artifact lifecycle

Finish the local-first product boundary after editor behavior is complete.

1. Store large artifact assets outside the JSON collection with atomic writes.
2. Add schema migrations for Puck data, native canvas scenes, and document nodes.
3. Add revision history and restore points before every agent edit.
4. Add explicit dirty, saving, saved, conflict, and recovery states.
5. Add import and export bundles that include files, visual data, and assets.
6. Add artifact-level permissions for tools, network access, and external URLs.

Exit this phase when a crash or failed agent edit cannot destroy the last saved
artifact revision.

## Guardrails

These constraints protect the local-first and agentic architecture:

- Keep artifact ownership scoped to one project.
- Keep credentials out of artifact files and renderer messages.
- Treat preview HTML, React source, and agent output as untrusted input.
- Use typed IPC for runtime and export operations.
- Preserve artifact identity, provenance, baselines, and schema version during
  agent edits.
- Prefer targeted patches over whole-artifact replacement.
- Record the model, agent, tools, and harness on every run before execution.
- Keep direct editing available even when no model is configured.
- Keep temporary panels non-blocking and avoid canvas-resizing inspectors for
  short tasks.

## Key files

Use these files as the starting map for the next implementation session:

- [`puck-config.tsx`](../src/renderer/src/studio/puck-config.tsx) owns the Puck
  component registry and constrained visual tokens.
- [`PuckSurface.tsx`](../src/renderer/src/studio/PuckSurface.tsx) owns the Puck
  surface, component action, and floating AI panel.
- [`BrowserPreview.tsx`](../src/renderer/src/studio/BrowserPreview.tsx) owns the
  browser chrome, live address action, runtime feedback, responsive viewport,
  and device scaling.
- [`StudioWorkspace.tsx`](../src/renderer/src/studio/StudioWorkspace.tsx) owns
  workspace modes, Monaco, preview sizing, and editor routing.
- [`studio-agent-edit.ts`](../src/renderer/src/studio/studio-agent-edit.ts) owns
  the agent prompt, edit validation, and targeted patch application.
- [`web-project.ts`](../src/renderer/src/studio/web-project.ts) derives managed
  React source and safe preview HTML from Puck data.
- [`artifact-preview-runtime.ts`](../src/main/artifact-preview-runtime.ts)
  validates and materializes React projects, runs Vite builds, serves revisioned
  loopback previews, and cleans up runtime state.
- [`artifact-model.ts`](../src/renderer/src/artifact-model.ts) creates and
  updates artifact records and owns the default React Router v7 template.
- [`Composer.tsx`](../src/renderer/src/chat/Composer.tsx) owns chat input,
  attachments, agent and model selection, tools, skills, and usage display.
- [`ToolActivityGroup.tsx`](../src/renderer/src/chat/ToolActivityGroup.tsx) owns
  the visible tool timeline and structured result details.
- [`AppsView.tsx`](../src/renderer/src/capabilities/AppsView.tsx) owns search,
  Google Workspace, Discord, skills, and planned capability presentation.
- [`AgentsView.tsx`](../src/renderer/src/agents/AgentsView.tsx) owns agent
  templates, profiles, configuration, access review, and lifecycle actions.
- [`google-workspace-native-tools.ts`](../src/main/google-workspace-native-tools.ts)
  owns the bounded Drive and Calendar native tool definitions and execution.
- [`SettingsDialogs.tsx`](../src/renderer/src/settings/SettingsDialogs.tsx) owns
  settings and account dialogs without coupling their local state to the app
  root.
- [`message-content.ts`](../src/renderer/src/chat/message-content.ts) owns
  artifact-edit and legacy attachment parsing for visible chat messages.
- [`bun-target.mjs`](../scripts/bun-target.mjs) resolves the platform Bun
  executable and its packaged destination.
- [`stage-sidecar.mjs`](../scripts/stage-sidecar.mjs) stages the Khadim CLI and
  bundled Bun runtime for Electron Builder.
- [`artifact-export.ts`](../src/shared/artifact-export.ts) renders artifacts for
  PDF.
- [`canvas-commands.ts`](../src/shared/canvas-commands.ts) parses, validates,
  applies, and reverses selection-scoped semantic Canvas command groups.
- [`project-store.ts`](../src/main/project-store.ts) validates and persists
  project artifacts.
- [`App.tsx`](../src/renderer/src/App.tsx) orchestrates project, chat, run, and
  Studio state and connects artifact edits to the selected agent and model run.

## Verification commands

Run these checks from `apps/electron` after every complete vertical slice:

```bash
bun run test -- tests/unit/renderer/PuckSurface.test.tsx
bun run test -- tests/unit/renderer/PuckDataSync.test.tsx
bun run test -- tests/unit/renderer/studio-agent-edit.test.ts
bun run test -- tests/unit/shared/canvas-commands.test.ts
bun run test -- tests/integration/main/artifact-agent-tools.test.ts
bun run test -- tests/integration/renderer/StudioWorkspace.test.tsx
bun run test -- tests/integration/main/artifact-preview-runtime.test.ts
bun run test -- tests/e2e/renderer/app-workflows.e2e.test.tsx
bun run test -- tests/unit/scripts/bun-target.test.mjs
bun run typecheck
bun run test
bun run build
```

For UI changes, also run the Electron app and inspect the Studio at desktop and
compact widths. Automated DOM tests don't validate Puck overlay placement,
canvas occlusion, animation quality, or preview scale.

## Sources

The research uses primary software documentation and repositories. Academic
sources were not applicable to these integration decisions.

- [Penpot workspace basics](https://help.penpot.app/user-guide/designing/workspace-basics/)
- [Penpot frontend architecture](https://help.penpot.app/technical-guide/developer/architecture/frontend/)
- [Penpot component guide](https://help.penpot.app/user-guide/design-systems/components/)
- [Penpot data model](https://help.penpot.app/technical-guide/developer/data-model/)
- [Penpot component nesting-loop helper](https://github.com/penpot/penpot/blob/4383cf183aa5a15e27d6ef2c7e00427b3c4b9be5/common/src/app/common/files/helpers.cljc#L430-L440)
- [Penpot component move guard](https://github.com/penpot/penpot/blob/4383cf183aa5a15e27d6ef2c7e00427b3c4b9be5/common/src/app/common/files/changes.cljc#L737-L748)
- [Penpot snap geometry source](https://github.com/penpot/penpot/blob/4383cf183aa5a15e27d6ef2c7e00427b3c4b9be5/common/src/app/common/geom/snap.cljc)
- [Puck repository and MIT license](https://github.com/puckeditor/puck)
- [Puck documentation](https://puckeditor.com/docs)
- [SoundCN catalog](https://soundcn.xyz/)
- [SoundCN repository and licensing notes](https://github.com/kapishdima/soundcn)
- [Thinking Orbs demo](https://orbs.jakubantalik.com/)
- [Thinking Orbs repository and MIT license](https://github.com/Jakubantalik/thinking-orbs)
- [Monaco Editor repository and MIT license](https://github.com/microsoft/monaco-editor)
- [Monaco Editor official site](https://microsoft.github.io/monaco-editor)
- [Vite JavaScript API](https://vite.dev/guide/api-javascript)
- [React Router Data Mode](https://reactrouter.com/start/data/custom)
- [React Router route configuration](https://reactrouter.com/start/data/routing)
- [Bun standalone executables](https://bun.sh/docs/bundler/executables)
- [Electron `webContents.printToPDF` API](https://www.electronjs.org/docs/latest/api/web-contents#contentsprinttopdfoptions)
- [T3 Code Claude adapter](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeAdapter.ts)
- [T3 Code Claude provider](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/ClaudeProvider.ts)
- [Claude Agent SDK permissions](https://platform.claude.com/docs/en/agent-sdk/permissions)
- [Claude Agent SDK user input](https://code.claude.com/docs/en/agent-sdk/user-input)
- [OpenAI Codex app-server](https://developers.openai.com/codex/app-server)
- [OpenAI Codex app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [T3 Code repository](https://github.com/pingdotgg/t3code)
- [T3 Code token usage contract](https://github.com/pingdotgg/t3code/blob/main/packages/contracts/src/providerRuntime.ts)
- [T3 Code Codex token normalization](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/provider/Layers/CodexAdapter.ts)
- [T3 Code context-window meter](https://github.com/pingdotgg/t3code/blob/main/apps/web/src/components/chat/ContextWindowMeter.tsx)
- [OpenCode token normalization](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts)
- [ACP session usage RFD](https://agentclientprotocol.com/rfds/session-usage)
- [Google Drive `files.list`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list)
- [Google Drive export MIME types](https://developers.google.com/workspace/drive/api/guides/ref-export-formats)
- [Google Calendar `events.list`](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)

## Next steps

Continue from the verified website and HTML-document runtime. Complete the
remaining work in this order:

1. Feed the last successful runtime output into PDF preparation so Preview and
   export use the same compiled website.
2. Add Puck migrations for saved component documents and preserve selection and
   viewport state across agent patches.
3. Add file creation, rename, and deletion to the source workspace while
   preserving the artifact path validation boundary.
4. Add long-document pagination and PDF fixtures, plus selection-scoped
   document agent edits.
5. Continue the native Canvas extraction by routing direct gestures and
   inspector mutations through `canvas-commands.ts`, then replace snapshot-only
   history entries with command transactions that store selection before and
   after each edit.
