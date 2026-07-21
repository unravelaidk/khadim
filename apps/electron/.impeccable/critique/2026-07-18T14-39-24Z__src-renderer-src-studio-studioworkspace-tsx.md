---
target: Studio
total_score: 24
p0_count: 0
p1_count: 2
timestamp: 2026-07-18T14-39-24Z
slug: src-renderer-src-studio-studioworkspace-tsx
---
Method: dual-agent (A: studio_design_review · B: studio_detector_evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of system status | 3/4 | Save, preview, and agent states are clear; PDF export lacks an equally explicit progress and completion state. |
| 2 | Match between system and real world | 3/4 | Design, Code, Preview, Split, Write, and Source are familiar; visual ownership and selection-scoped AI actions require interpretation. |
| 3 | User control and freedom | 2/4 | Direct editing is strong, but Puck, Canvas, source-wide agent edits, and component patches lack visible undo or revision restore. |
| 4 | Consistency and standards | 2/4 | Editor capabilities diverge; compact Split remains selected after CSS removes its preview, and tablists lack arrow-key behavior. |
| 5 | Error prevention | 2/4 | Preview sandboxing and last-good-output retention are strong; irreversible edits and agent patches have few guardrails. |
| 6 | Recognition rather than recall | 3/4 | Modes and files are named, but collapsed construction panels and selection-only agent actions hide important capabilities. |
| 7 | Flexibility and efficiency | 3/4 | Visual, source, preview, chat, and keyboard resizing support experts; file operations, undo/redo, and tab accelerators are missing. |
| 8 | Aesthetic and minimalist design | 2/4 | The palette is disciplined, but nested headers, bars, frames, browser chrome, and shadows compete with the artifact. |
| 9 | Error recognition and recovery | 3/4 | Compile errors retain the prior preview and link to source; save/export failures and artifact revisions lack equivalent recovery. |
| 10 | Help and documentation | 1/4 | Hints and tooltips exist, but there is no visible first-use guidance or explanation of Design/source/agent ownership. |
| **Total** | | **24/40** | **Acceptable; meaningful work remains before Studio earns sustained trust.** |

## Anti-Patterns Verdict

**Does this look AI-generated? Pass, with reservations.** Studio avoids the most common tells: the graphite material system is restrained, one blue signal carries action and selection, persistent surfaces are mostly flat, and the interface uses familiar desktop-tool modes rather than generic dashboard cards. It feels like a serious professional-tool prototype.

The reservations are product strangeness rather than decoration alone. The preview is wrapped in persistent pseudo-browser chrome, decorative traffic lights, a broad shadow, and another framed viewport while chat and several toolbars already consume space. The artifact can feel framed by the product instead of being the product's center.

**Deterministic scan:** the bundled detector returned a clean `[]` result for `src/renderer/src/studio/StudioWorkspace.tsx`: 0 findings, no rules or locations, and no false positives. This means the target avoids the detector's static anti-pattern families; it does not establish runtime quality.

**Rendered evidence:** no browser overlay was available because the Electron audit harness does not expose detector-script injection or Impeccable console collection. A fresh isolated 1320×860 Electron audit did render successfully. It exposed a runtime issue the static detector could not see: the fixed 794px A4 page extended beyond the document pane and produced a persistent horizontal scrollbar, obscuring the right side of the page.

## Overall Impression

Studio has the right product thesis: direct manipulation, code, preview, and agent assistance share one artifact and one project context. Status and preview failure handling are more mature than most prototypes. The largest opportunity is to make that power feel safe and spatially coherent: reversible edits, truthful responsive modes, and less persistent chrome would turn a capable editor into a trustworthy one.

## What's Working

- **Operational status is unusually thoughtful.** Local save state, preview progress, last-good-output retention, source-linked errors, and preserved agent prompts reassure users during fragile work.
- **Direct control remains first-class.** Puck, Monaco, document editing, preview, PDF export, and the main chat coexist without forcing an AI-only workflow.
- **The visual system fits Khadim.** Restrained graphite, one blue action signal, semantic states, reduced-motion/transparency rules, and clear labels support the quiet-command-center direction.

## Priority Issues

### [P1] Agent and visual edits are not safely reversible

**Why it matters:** Only the HTML document exposes undo. A Puck edit, Canvas change, component patch, or source-wide agent edit can alter meaningful work without a visible safe point, contradicting Khadim's principle that the user stays in command.

**Fix:** Create an artifact revision before every agent-authored change; expose shared undo/redo for direct edits; show an immediate “Undo agent change” action with a concise change summary; provide revision restore for saved checkpoints.

**Suggested command:** `$impeccable harden Studio edit recovery`

### [P1] Responsive editing modes are not spatially truthful

**Why it matters:** Below 960px, Split remains selected while the preview is hidden. In the rendered document view, the fixed A4 canvas also overflows its pane and forces horizontal navigation. Both make the selected mode promise more than the viewport delivers.

**Fix:** Make Split genuinely stacked or resizable at compact widths, or disable it with explicit copy. Add fit-page and zoom controls to the document canvas, defaulting to fit width when the pane cannot contain the physical page.

**Suggested command:** `$impeccable adapt Studio`

### [P2] Persistent chrome crowds the artifact

**Why it matters:** App chrome, chat controls, Studio header, context bar, pseudo-browser bar, viewport frame, and the optional agent panel compete for a narrow editing canvas. Decorative traffic lights and broad preview elevation add framing without improving the task.

**Fix:** Flatten the preview surface, remove inert traffic lights, reduce persistent elevation, and reveal address, device, and build details only when relevant. Preserve the artifact as the dominant plane.

**Suggested command:** `$impeccable distill Studio preview chrome`

### [P2] First-use discoverability depends on hidden selection state

**Why it matters:** A first-time user opens Preview and may not discover Design, component insertion, or component-scoped AI editing. Puck panels start collapsed, while “Ask agent” appears only after a selection, making Studio look more like a viewer than an editor.

**Fix:** Add a dismissible first-use orientation that demonstrates three actions: select text, add a block, and ask the agent about the selection. Keep the cues local to the canvas and retire them after successful use.

**Suggested command:** `$impeccable onboard Studio`

### [P2] Core controls remain small or pointer-biased

**Why it matters:** Formatting and preview controls fall below comfortable motor-access targets, tablists omit standard arrow-key navigation, and Canvas SVG nodes are click-only. Keyboard and motor-access users receive an incomplete version of the editor.

**Fix:** Raise compact target sizes, implement roving focus and arrow-key tab behavior, and make canvas objects focusable and operable through equivalent keyboard commands.

**Suggested command:** `$impeccable audit Studio interactions`

## Persona Red Flags

**Alex, automation power user — build and revise a website:** Alex can move efficiently between Monaco, Preview, Design, and chat, but cannot create, rename, or delete files and cannot safely undo an agent component patch. Compact Split is unreliable, so experimentation feels riskier than it should.

**Jordan, first-time office user — visually edit a generated page:** Jordan lands in a clear Preview but sees no obvious editing entry point. After discovering Design, collapsed panels and the selection-dependent agent action require hidden knowledge. Jordan may conclude that Studio is primarily a viewer.

**Sam, keyboard and screen-reader user — edit and inspect an artifact:** The named regions, live states, and keyboard-resizable divider are strong. Standard tab arrow navigation is missing, Canvas objects are non-focusable click targets, and several compact buttons are difficult to operate with limited motor precision.

## Minor Observations

- Canvas is presented as a peer artifact despite lacking the mature drag, resize, delete, undo, and spatial-editor behavior promised by the product plan.
- The browser traffic lights imply platform-specific controls but perform no action.
- The Studio region is labelled by an editable title input; a stable heading would provide a more reliable accessible name.
- Export PDF remains prominent even when the immediate task is editing or resolving a preview failure.
- Legacy structured documents and HTML documents expose noticeably different editing grammars.
- Puck exposes 11 components across three expanded categories, and the unbounded flat file tree can create scanning overload as projects grow.

## Questions to Consider

- If “keep the user in command” is a core principle, where is the visible safe point before every agent-authored change?
- Does Studio need to simulate a full browser persistently, or only reveal browser controls when they help the current decision?
- Should Split exist at widths where both surfaces cannot remain meaningfully visible?
- Is Canvas ready to be offered beside Website and Document, or does its current incompleteness reduce trust in Studio as a whole?
