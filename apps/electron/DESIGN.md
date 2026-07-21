---
name: Khadim Electron
description: A quiet local-first command center for agentic work.
colors:
  shell: "oklch(0.105 0.006 255)"
  surface: "oklch(0.135 0.007 255)"
  surface-raised: "oklch(0.17 0.009 255)"
  surface-hover: "oklch(0.205 0.012 255)"
  line: "oklch(0.34 0.012 255 / 0.42)"
  text: "oklch(0.95 0.004 255)"
  text-secondary: "oklch(0.78 0.008 255)"
  text-tertiary: "oklch(0.66 0.01 255)"
  action-blue: "oklch(0.74 0.145 235)"
  action-blue-soft: "oklch(0.255 0.045 235)"
  success: "oklch(0.72 0.12 155)"
  warning: "oklch(0.75 0.14 75)"
  danger: "oklch(0.72 0.16 25)"
typography:
  headline:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 620
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "20px"
    fontWeight: 620
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  label:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 560
    lineHeight: 1.3
    letterSpacing: "0"
  metadata:
    fontFamily: "Atkinson Hyperlegible Next Variable, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0"
  code:
    fontFamily: "ui-monospace, Cascadia Code, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0"
rounded:
  xs: "6px"
  sm: "8px"
  md: "11px"
  lg: "14px"
  surface: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "36px"
  composer:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "14px"
  navigation-active:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    height: "38px"
---

# Design System: Khadim Electron

## Overview

**Creative North Star: “Quiet Command Center”**

Khadim is a focused operating surface for people delegating real work to local agents. It should feel calm enough to leave open all day, legible enough to trust during a long run, and precise enough for technical inspection. The shell is near-black and low-chroma in dark mode; light mode is a true cool neutral rather than cream or paper.

The core product remains restrained. Atmospheric violet, cyan, and coral may appear around creation, onboarding, live agent identity, or generated artifacts, but routine navigation stays neutral. Familiar controls and explicit state beat novelty. The interface should never feel like a crypto dashboard, a glowing terminal fantasy, or a stack of glass cards.

**Key characteristics:**

- Local-first and operational, not promotional.
- Dense navigation with a generous task canvas.
- One primary action color; semantic colors communicate state.
- Flat by default, with elevation reserved for temporary layers.
- Fast state transitions with complete reduced-motion behavior.

## Colors

The palette is a cool graphite architecture with a clear cyan-blue action signal and sparse atmospheric color.

### Primary

- **Action Blue** (`oklch(0.74 0.145 235)`): primary actions, focus rings, current selection, links, and live progress only.
- **Action Blue Soft** (`oklch(0.255 0.045 235)`): selected backgrounds and quiet active states in dark mode.

### Secondary

- **Ambient Violet** (`oklch(0.62 0.18 295)`): creation and onboarding atmosphere; never a routine control fill.
- **Ambient Cyan** (`oklch(0.77 0.13 205)`): connected tools and research atmosphere.
- **Ambient Coral** (`oklch(0.72 0.15 35)`): agent identity and rare warm emphasis.

### Neutral

- **Deep Shell** (`oklch(0.105 0.006 255)`): outer application background.
- **Native startup shell** (`#1a1c20`): BrowserWindow fallback shown before the renderer resolves its theme.
- **Task Surface** (`oklch(0.135 0.007 255)`): primary workspace canvas.
- **Raised Graphite** (`oklch(0.17 0.009 255)`): inputs, active navigation, and compact temporary surfaces.
- **Hover Graphite** (`oklch(0.205 0.012 255)`): interaction feedback and selected rows.
- **Primary Ink** (`oklch(0.95 0.004 255)`): headings and essential content.
- **Secondary Ink** (`oklch(0.78 0.008 255)`): body copy and control labels.
- **Tertiary Ink** (`oklch(0.66 0.01 255)`): metadata only; never placeholders below AA contrast.

**The One Signal Rule.** Action Blue is the only routine accent. Atmospheric colors create context; they do not compete for control meaning.

## Typography

**Display Font:** Atkinson Hyperlegible Next Variable (with Segoe UI and sans-serif fallbacks)

**Body Font:** Atkinson Hyperlegible Next Variable (with Segoe UI and sans-serif fallbacks)

**Label/Mono Font:** system monospace stack for code, paths, shortcuts, and machine output

**Character:** One highly legible humanist sans carries the product. Weight, spacing, and placement create hierarchy without introducing a decorative display face into operational UI.

### Hierarchy

- **Headline** (620, 32px, 1.15): empty-state and top-level page titles; sentence case and balanced.
- **Title** (620, 20px, 1.25): section and modal titles.
- **Body** (400, 14px, 1.6): messages and explanatory copy, capped at 70ch for prose.
- **Label** (560, 12px, 1.3): controls and navigation. Use sentence case; avoid tracked uppercase.
- **Metadata** (500, 11px, 1.4): persistent supporting text, counts, state descriptions, and field help. This is the minimum product text size.
- **Code** (400, 12px, 1.65): code, paths, command output, and shortcuts.

**The Read-It-Once Rule.** Supporting text must remain at least 11px and retain AA contrast. Density comes from spacing, not from unreadably small type.

## Elevation

Khadim is flat by default. Surface tone and dividers establish structure. Shadows appear only on popovers, dialogs, menus, and the welcome mark—elements that physically sit above the task plane. Persistent cards do not combine a border with a wide soft shadow.

### Shadow Vocabulary

- **Control lift** (`0 2px 8px color-mix(in oklch, var(--shadow-color) 42%, transparent)`): small floating marks and temporary compact affordances.
- **Popover** (`0 16px 46px var(--shadow-color)`): menus and transient overlays with no competing decorative border.
- **Modal** (`0 28px 80px color-mix(in oklch, var(--shadow-color) 78%, transparent)`): settings and account dialogs only.

**The Flat-By-Default Rule.** If a surface is present for the entire session, depth comes from tone and placement—not a drop shadow.

On macOS 26+, the application window may use the native Liquid Glass layer. Keep the effect strongest beneath the title bar and sidebar; the task canvas remains at least 94% opaque. Linux uses app-local frosted chrome over Khadim's own restrained atmosphere—it never implies compositor or desktop blur. Windows, unsupported macOS releases, Reduced Transparency, and increased-contrast modes use the solid surface vocabulary above.

## Components

### Buttons

- **Shape:** compact rounded rectangle (`8px`); circular only for icon-only native controls.
- **Primary:** Action Blue with task-surface text, `36px` high and `13px` horizontal padding.
- **Hover / Focus:** a small color shift and a 2px Action Blue focus ring. Active state scales to `.98` for immediate pointer-down feedback.
- **Secondary / Ghost:** raised graphite or transparent; never a colorful inactive fill.
- **Disabled:** preserve shape and label, reduce opacity to `.42`, and remove active motion.

### Chips

- **Style:** use only for filters, small states, or compact metadata. Background is Action Blue Soft or Hover Graphite; labels remain sentence case.
- **State:** selected uses Action Blue text or icon. Unselected remains neutral.

### Cards / Containers

- **Corner Style:** `11–16px`; 16px is the maximum for persistent product surfaces.
- **Background:** use Task Surface, Raised Graphite, or tonal context color.
- **Shadow Strategy:** flat at rest; temporary overlays follow Elevation.
- **Border:** use a single low-contrast divider when separation cannot be achieved by tone or spacing.
- **Internal Padding:** `12–24px`, chosen by density and content rather than one universal card recipe.

### Inputs / Fields

- **Style:** Raised Graphite, `8–14px` radius depending on composition, minimum 40px touch height on compact screens.
- **Focus:** Action Blue border plus a low-opacity 2px outer ring.
- **Error / Disabled:** Danger changes border and supporting copy; disabled controls retain readable text.

### Navigation

Primary navigation uses a 264px desktop sidebar and collapses into a temporary drawer below 841px. Active rows use a tonal fill, stronger text, and a 2px Action Blue position marker. Headers and groups use sentence case with normal tracking.

### Workspace Pages

Projects, Agents, Artifacts, and Apps share one page grammar: a 30px title, a concise 62ch description, a bottom divider, and an optional 40px primary action aligned to the lower edge. Operational collections render as divided rows rather than collections of cards. Active rows use a tonal background and a changed icon state instead of a thick colored side stripe.

### Composer

The composer is the visual anchor: one 14px-radius raised surface with a crisp border, not a floating glass card. Tools live on the left, model and send controls on the right, and the run context sits below without competing with the prompt.

Welcome starter actions are a compact row of 44px icon buttons. Their command label and purpose appear in a temporary tooltip on hover or keyboard focus, keeping the default state quiet without hiding names from assistive technology.

### Motion

Motion communicates cause and place. Pointer-down feedback is `100ms`; ordinary state changes are `200ms`; drawers and panels are `220ms`, all with the shared ease-out-quint curve. Workspace changes use one 4px fade-and-settle transition instead of sequencing child entrances. Popovers scale from the control edge that opened them, modal dialogs scale from center, and exits are shorter than entrances. Reduced Motion removes transforms and preserves state through immediate color or opacity changes.

## Do's and Don'ts

### Do:

- **Do** keep routine chrome in the cool graphite neutral ramp.
- **Do** reserve Action Blue for actions, focus, selection, and live progress.
- **Do** use atmospheric color around creation, onboarding, and generated work only.
- **Do** preserve familiar desktop affordances and full keyboard navigation.
- **Do** keep product motion between 140–240ms and provide reduced-motion and reduced-transparency alternatives.
- **Do** use sentence case and normal letter spacing throughout operational UI.

### Don't:

- **Don't** use glassmorphism as the default material or layer blur across persistent panels.
- **Don't** build screens from identical icon-heading-description cards or nested cards.
- **Don't** use tracked uppercase labels as repeated page scaffolding.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored card accent.
- **Don't** pair a 1px decorative border with a wide soft shadow on the same persistent element.
- **Don't** exceed 16px corner radius on persistent cards, sections, or inputs.
- **Don't** use gradients for text, inactive navigation, or routine buttons.
- **Don't** invent ornamental motion; every transition must communicate state.
