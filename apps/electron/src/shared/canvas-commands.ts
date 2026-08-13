import type {
  CanvasArtifactContent,
  CanvasBlendMode,
  CanvasElement,
  CanvasPage,
  CanvasPoint,
  CanvasPrototypeAction,
  CanvasPrototypeInteraction,
  CanvasPrototypeOverlay,
  CanvasPrototypeTransition,
  CanvasPrototypeTrigger,
} from "./types";

/**
 * Pure, semantic Canvas command layer.
 *
 * Commands operate over {@link CanvasArtifactContent} by stable element and
 * interaction ids. The application function is total, atomic, and produces
 * exact inverse commands so a single undo restores the prior scene. No
 * command mutates its inputs; every page, element, and interaction that is not
 * targeted is preserved by reference equality.
 */

export const CANVAS_COMMAND_MAX_GROUP_SIZE = 50;
export const CANVAS_COMMAND_MAX_SELECTION = 100;
/**
 * Maximum number of additive vector elements a single `add-elements` command
 * may introduce. Bounded so a single forward batch stays well under the 1MB
 * untrusted payload ceiling and a generated inverse stays applicable.
 */
export const CANVAS_COMMAND_MAX_ADD_ELEMENTS = 100;
/**
 * Maximum number of points an additive path/line/arrow element may carry.
 * Persistence permits up to 20_000, but the additive first version constrains
 * geometry to a safe bounded count so a single command cannot blow the 1MB
 * untrusted payload ceiling.
 */
export const CANVAS_COMMAND_MAX_ADD_POINTS = 1_000;
/**
 * Maximum number of elements a Canvas page may hold, matching project-store's
 * persistence validator. Prospective additions are checked against this so no
 * accepted additive group can produce a page persistence would reject.
 */
export const CANVAS_PAGE_MAX_ELEMENTS = 10_000;
/**
 * Internal group-size ceiling enforced by {@link applyCanvasCommandGroup}.
 *
 * The untrusted parser ({@link parseCanvasCommandGroup}) caps a forward batch
 * at {@link CANVAS_COMMAND_MAX_GROUP_SIZE} (50) commands, and each
 * `patch-elements` command may target up to {@link CANVAS_COMMAND_MAX_SELECTION}
 * (100) selected layers. A single accepted forward group therefore expands
 * to at most `50 * 100 = 5000` inverse `patch-elements` commands (one per
 * targeted layer per command). The applier accepts up to that mathematically
 * bounded worst case so any inverse it produces can always be re-applied. This
 * does not weaken the untrusted parser boundary, which still rejects forward
 * groups larger than 50 commands.
 */
export const CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE = CANVAS_COMMAND_MAX_GROUP_SIZE * CANVAS_COMMAND_MAX_SELECTION;
export const CANVAS_COMMAND_MAX_STRING_LENGTH = 2000;
/**
 * Persistence ID ceiling shared by project-store's
 * {@link isCanvasElement}/{@link isCanvasPrototypeInteraction} validators
 * (240 chars). The untrusted parser enforces a stricter 200-char bound
 * ({@link CANVAS_COMMAND_MAX_ID_LENGTH}); the applier caps at this 240-char
 * persistence bound so no accepted command can exceed what persistence rejects.
 */
export const CANVAS_PERSISTED_ID_MAX_LENGTH = 240;
/** Hard byte ceiling for a single untrusted command-group payload at the parser boundary. */
export const CANVAS_COMMAND_MAX_PAYLOAD_BYTES = 1_000_000;

/** Generic patch keys permitted on element patch commands. */
export type CanvasPatchElementKey =
  | "name"
  | "x"
  | "y"
  | "width"
  | "height"
  | "rotation"
  | "hidden"
  | "locked"
  | "opacity"
  | "color"
  | "text"
  | "fontSize"
  | "fontFamily"
  | "fontWeight"
  | "lineHeight"
  | "letterSpacing"
  | "textAlign"
  | "radius"
  | "cornerRadii"
  | "strokeColor"
  | "strokeWidth"
  | "strokeDash"
  | "blendMode"
  | "layerBlur"
  | "backgroundBlur";

/** Structural / identity fields that must never appear in a generic patch. */
export const CANVAS_PATCH_FORBIDDEN_KEYS = [
  "id",
  "type",
  "componentId",
  "componentRole",
  "parentId",
  "groupId",
] as const;

const PATCH_ALLOWED_KEYS: ReadonlySet<CanvasPatchElementKey> = new Set([
  "name",
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "hidden",
  "locked",
  "opacity",
  "color",
  "text",
  "fontSize",
  "fontFamily",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "radius",
  "cornerRadii",
  "strokeColor",
  "strokeWidth",
  "strokeDash",
  "blendMode",
  "layerBlur",
  "backgroundBlur",
]);

/**
 * Per-key string length ceilings aligned with project-store's
 * {@link isCanvasElement} persistence constraints, so no accepted generic
 * patch value can exceed what persistence would reject. The parser and
 * applier both enforce these via {@link validatePatchValue}.
 */
const PATCH_STRING_MAX_LENGTH: Record<string, number> = {
  name: 1_000,
  fontFamily: 1_000,
  color: 80,
  strokeColor: 80,
  text: 250_000,
};

/** Element types permitted to carry `cornerRadii`, matching persistence. */
const CORNER_RADII_ELEMENT_TYPES: ReadonlySet<string> = new Set(["rectangle", "frame", "image"]);

/** Patch values are intentionally loose; the applier validates each value. */
export type CanvasPatchElementFields = Partial<Record<CanvasPatchElementKey, unknown>>;

export interface CanvasPatchElementsCommand {
  type: "patch-elements";
  /** Stable element ids to patch. Each id must exist and be in the selection. */
  elementIds: string[];
  /** Per-element patch. A single shared patch applies to every target. */
  patch: CanvasPatchElementFields;
}

export interface CanvasAddInteractionCommand {
  type: "add-interaction";
  /** Stable element id that owns the new interaction. */
  elementId: string;
  /** Interaction to append to the element's interaction list. */
  interaction: CanvasPrototypeInteraction;
  /**
   * Internal inverse-only hint: insertion index for the interaction. The strict
   * untrusted parser rejects this field, so it can only be set by the applier
   * when building an inverse that must restore the exact prior ordering.
   */
  insertIndex?: number;
}

export interface CanvasPatchInteractionCommand {
  type: "patch-interaction";
  /** Stable element id that owns the interaction. */
  elementId: string;
  /** Stable interaction id to patch. */
  interactionId: string;
  /** Partial interaction fields. The id and trigger are preserved by the inverse. */
  patch: Partial<Omit<CanvasPrototypeInteraction, "id">>;
  /**
   * Internal inverse-only hint: the exact prior interaction object to restore.
   * When present, the applier replaces the matching interaction wholesale with
   * a clone of this object (preserving property presence and insertion order),
   * ignoring {@link patch}. The strict untrusted parser rejects this field, so
   * it can only be set by the applier when building an inverse that must restore
   * the exact prior interaction shape.
   */
  restoreInteraction?: CanvasPrototypeInteraction;
}

export interface CanvasRemoveInteractionCommand {
  type: "remove-interaction";
  /** Stable element id that owns the interaction. */
  elementId: string;
  /** Stable interaction id to remove. */
  interactionId: string;
  /**
   * Internal inverse-only hint: when true, the applier restores an explicit
   * empty `interactions: []` list instead of an absent field. The strict
   * untrusted parser rejects this field, so it can only be set by the applier
   * when building an inverse for an add that operated on `interactions: []`.
   */
  restoreEmptyList?: boolean;
}

/**
 * Safe additive vector primitive the agent may draw on a Canvas with no
 * selected layers. The schema is intentionally a constrained subset of
 * {@link CanvasElement}: only the safe vector primitives rectangle, ellipse,
 * line, arrow, path, and text are permitted, and only the core geometry and
 * appearance fields needed to make useful drawings. Agent-supplied ids must be
 * unique against the existing page and within the batch.
 */
export interface CanvasAddElementSpec {
  /** Stable element id, unique against the page and within the batch. */
  id: string;
  /** Primitive type. Only safe vector primitives are permitted. */
  type: "rectangle" | "ellipse" | "line" | "arrow" | "path" | "text";
  /** Page-space x coordinate. */
  x: number;
  /** Page-space y coordinate. */
  y: number;
  /** Element width. Must be a positive finite number. */
  width: number;
  /** Element height. Must be a positive finite number. */
  height: number;
  /** Fill color. Required persisted field. */
  color: string;
  /** Optional display name. */
  name?: string;
  /** Optional rotation in degrees. */
  rotation?: number;
  /** Optional opacity in [0,1]. */
  opacity?: number;
  /** Optional corner radius (rectangle only). Bounded 0..100000. */
  radius?: number;
  /** Optional stroke color. */
  strokeColor?: string;
  /** Optional stroke width. Bounded 0..100000. */
  strokeWidth?: number;
  /** Optional stroke dash pattern length. Bounded 0..100000. */
  strokeDash?: number;
  /** Text content (text only). Bounded length. */
  text?: string;
  /** Font size (text only). Bounded 0..100000. */
  fontSize?: number;
  /** Font family (text only). Bounded length. */
  fontFamily?: string;
  /** Font weight (text only). */
  fontWeight?: number;
  /** Text alignment (text only). */
  textAlign?: "left" | "center" | "right";
  /** Line height (text only). Bounded 0..100000. */
  lineHeight?: number;
  /** Letter spacing (text only). */
  letterSpacing?: number;
  /** Ordered vector points (path/line/arrow). */
  points?: CanvasPoint[];
  /** Whether the path is closed (path only). */
  pathClosed?: boolean;
  /** Path smoothing in [0,1] (path/line/arrow). */
  pathSmoothing?: number;
  /** Start cap (line/arrow/path). */
  startCap?: "none" | "arrow" | "round";
  /** End cap (line/arrow/path). */
  endCap?: "none" | "arrow" | "round";
}

export interface CanvasAddElementsCommand {
  type: "add-elements";
  /** Additive vector primitive specs to append to the page. */
  elements: CanvasAddElementSpec[];
}

export interface CanvasRemoveElementsCommand {
  type: "remove-elements";
  /** Stable element ids to remove. Internal inverse-only command. */
  elementIds: string[];
}

export type CanvasCommand =
  | CanvasPatchElementsCommand
  | CanvasAddInteractionCommand
  | CanvasPatchInteractionCommand
  | CanvasRemoveInteractionCommand
  | CanvasAddElementsCommand
  | CanvasRemoveElementsCommand;

/** Envelope binding a command batch to a page and selection scope. */
export interface CanvasCommandGroup {
  pageId: string;
  /** Stable element ids the commands are allowed to mutate. */
  selectionIds: string[];
  commands: CanvasCommand[];
}

/** Result of applying a command group. */
export interface CanvasCommandGroupResult {
  content: CanvasArtifactContent;
  /** Inverse commands, in undo order, that restore the prior content exactly. */
  inverse: CanvasCommand[];
  /** Stable element ids touched by the group (add/patch/remove interaction targets included). */
  affectedElementIds: string[];
}

/** Failure reason when a command group cannot be applied atomically. */
export type CanvasCommandGroupError =
  | { kind: "unknown-page"; pageId: string }
  | { kind: "unknown-element"; pageId: string; elementId: string }
  | { kind: "unknown-interaction"; pageId: string; elementId: string; interactionId: string }
  | { kind: "unknown-destination-page"; pageId: string; destinationPageId: string }
  | { kind: "duplicate-target"; elementId: string }
  | { kind: "duplicate-selection"; elementId: string }
  | { kind: "duplicate-interaction-id"; interactionId: string }
  | { kind: "locked"; elementId: string }
  | { kind: "out-of-selection"; elementId: string }
  | { kind: "forbidden-patch-key"; key: string }
  | { kind: "interactions-in-patch" }
  | { kind: "empty-patch" }
  | { kind: "empty-command-group" }
  | { kind: "invalid-patch-value"; key: string; reason: string }
  | { kind: "invalid-interaction"; reason: string }
  | { kind: "invalid-transition"; reason: string }
  | { kind: "invalid-overlay"; reason: string }
  | { kind: "duplicate-trigger"; elementId: string; trigger: CanvasPrototypeTrigger }
  | { kind: "unsafe-url"; url: string }
  | { kind: "group-too-large"; size: number }
  | { kind: "selection-too-large"; size: number }
  | { kind: "duplicate-element-id"; elementId: string }
  | { kind: "invalid-element"; reason: string }
  | { kind: "add-elements-empty" }
  | { kind: "too-many-add-elements"; size: number }
  | { kind: "page-element-cap-exceeded"; size: number };

const RECOGNIZED_TRIGGERS: ReadonlySet<CanvasPrototypeTrigger> = new Set(["click", "hover", "after-delay"]);
const RECOGNIZED_ACTIONS: ReadonlySet<CanvasPrototypeAction> = new Set([
  "navigate",
  "back",
  "open-url",
  "open-overlay",
  "toggle-overlay",
  "close-overlay",
]);
const RECOGNIZED_BLEND_MODES: ReadonlySet<CanvasBlendMode> = new Set([
  "normal",
  "darken",
  "multiply",
  "color-burn",
  "lighten",
  "screen",
  "color-dodge",
  "overlay",
  "soft-light",
  "hard-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
]);

const RECOGNIZED_TRANSITION_TYPES: ReadonlySet<CanvasPrototypeTransition["type"]> = new Set(["instant", "dissolve", "slide", "smart"]);
const RECOGNIZED_EASINGS: ReadonlySet<CanvasPrototypeTransition["easing"]> = new Set(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]);
const RECOGNIZED_TRANSITION_DIRECTIONS: ReadonlySet<NonNullable<CanvasPrototypeTransition["direction"]>> = new Set(["left", "right", "up", "down"]);
const RECOGNIZED_OVERLAY_POSITIONS: ReadonlySet<CanvasPrototypeOverlay["position"]> = new Set([
  "center",
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);
const RECOGNIZED_OVERLAY_BACKGROUNDS: ReadonlySet<CanvasPrototypeOverlay["background"]> = new Set(["none", "dim"]);

/** Actions that navigate to (or open) a destination page in this artifact. */
const DESTINATION_ACTIONS: ReadonlySet<CanvasPrototypeAction> = new Set(["navigate", "open-overlay", "toggle-overlay"]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Returns the UTF-8 byte length of an untrusted payload. Strings are measured
 * directly; objects/arrays are JSON-serialized first (matching what an agent
 * would transmit). Pure JS, no Node Buffer dependency, so the helper is safe
 * to run in any Khadim runtime (Electron main, renderer, future web).
 */
function utf8ByteLength(value: unknown): number {
  let str: string;
  if (typeof value === "string") {
    str = value;
  } else if (value && typeof value === "object") {
    str = JSON.stringify(value);
  } else {
    return 0;
  }
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      // High surrogate of a surrogate pair: 4 bytes for the whole pair.
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function isNonemptyBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= CANVAS_COMMAND_MAX_STRING_LENGTH;
}

/** Bounded nonempty string with a per-key persisted ceiling. */
function isNonemptyStringOfMaxLength(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isInteractionLike(value: unknown): value is CanvasPrototypeInteraction {
  return Boolean(value) && typeof value === "object" && typeof (value as { id?: unknown }).id === "string";
}

function cloneInteraction(interaction: CanvasPrototypeInteraction): CanvasPrototypeInteraction {
  // Preserve absent optional properties exactly: only clone transition/overlay
  // when those keys are actually present. The previous spread-then-overwrite
  // form injected `transition: undefined` / `overlay: undefined` keys onto
  // interactions that never carried them, breaking Object.keys/hasOwn parity
  // across an add -> remove -> inverse round trip.
  const clone: CanvasPrototypeInteraction = { ...interaction };
  if (interaction.transition !== undefined) {
    clone.transition = { ...interaction.transition };
  }
  if (interaction.overlay !== undefined) {
    clone.overlay = { ...interaction.overlay };
  }
  return clone;
}

/** Safely reads a keyed value from a typed object without weakening its type. */
function recordOf<T extends object>(value: T): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

function findPage(content: CanvasArtifactContent, pageId: string): CanvasPage | undefined {
  return content.pages?.find((page) => page.id === pageId);
}

function findElement(page: CanvasPage, elementId: string): CanvasElement | undefined {
  return page.elements.find((element) => element.id === elementId);
}

function findInteraction(element: CanvasElement, interactionId: string): CanvasPrototypeInteraction | undefined {
  return element.interactions?.find((interaction) => interaction.id === interactionId);
}

/**
 * Validates a URL is http/https only — matching the project-store persistence
 * validator, which rejects every other scheme (including mailto).
 */
export function isSafePrototypeUrl(url: unknown): boolean {
  if (!isNonemptyBoundedString(url)) return false;
  try {
    const parsed = new URL(url as string);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateTransition(transition: unknown, action?: CanvasPrototypeAction): CanvasCommandGroupError | undefined {
  if (!transition || typeof transition !== "object") return { kind: "invalid-transition", reason: "transition must be an object" };
  const value = transition as Record<string, unknown>;
  if (!RECOGNIZED_TRANSITION_TYPES.has(value.type as CanvasPrototypeTransition["type"])) {
    return { kind: "invalid-transition", reason: `unrecognized transition type: ${String(value.type)}` };
  }
  const type = value.type as CanvasPrototypeTransition["type"];
  // Persistence caps transition duration at 5000ms.
  const duration = value.duration;
  if (!isFiniteNumber(duration) || duration < 0 || duration > 5_000) {
    return { kind: "invalid-transition", reason: "transition duration must be finite and 0..5000" };
  }
  if (!RECOGNIZED_EASINGS.has(value.easing as CanvasPrototypeTransition["easing"])) {
    return { kind: "invalid-transition", reason: `unrecognized easing: ${String(value.easing)}` };
  }
  // Persistence only permits direction on slide transitions; smart only on navigate.
  if (value.direction !== undefined) {
    if (type !== "slide") {
      return { kind: "invalid-transition", reason: "direction is only valid for slide transitions" };
    }
    if (!RECOGNIZED_TRANSITION_DIRECTIONS.has(value.direction as NonNullable<CanvasPrototypeTransition["direction"]>)) {
      return { kind: "invalid-transition", reason: `unrecognized direction: ${String(value.direction)}` };
    }
  }
  if (type === "smart" && action !== "navigate") {
    return { kind: "invalid-transition", reason: "smart transitions are only valid for navigate" };
  }
  // Reject extra fields so untrusted payloads cannot smuggle arbitrary data.
  for (const key of Object.keys(value)) {
    if (key !== "type" && key !== "duration" && key !== "easing" && key !== "direction") {
      return { kind: "invalid-transition", reason: `unexpected transition field: ${key}` };
    }
  }
  return undefined;
}

function validateOverlay(overlay: unknown): CanvasCommandGroupError | undefined {
  if (!overlay || typeof overlay !== "object") return { kind: "invalid-overlay", reason: "overlay must be an object" };
  const value = overlay as Record<string, unknown>;
  if (!RECOGNIZED_OVERLAY_POSITIONS.has(value.position as CanvasPrototypeOverlay["position"])) {
    return { kind: "invalid-overlay", reason: `unrecognized overlay position: ${String(value.position)}` };
  }
  if (!RECOGNIZED_OVERLAY_BACKGROUNDS.has(value.background as CanvasPrototypeOverlay["background"])) {
    return { kind: "invalid-overlay", reason: `unrecognized overlay background: ${String(value.background)}` };
  }
  if (typeof value.closeOnOutsideClick !== "boolean") {
    return { kind: "invalid-overlay", reason: "overlay.closeOnOutsideClick must be a boolean" };
  }
  for (const key of Object.keys(value)) {
    if (key !== "position" && key !== "background" && key !== "closeOnOutsideClick") {
      return { kind: "invalid-overlay", reason: `unexpected overlay field: ${key}` };
    }
  }
  return undefined;
}

/** Returns the set of known page ids in the content, including the active mirror id. */
function knownPageIds(content: CanvasArtifactContent): Set<string> {
  const ids = new Set<string>();
  for (const page of content.pages ?? []) ids.add(page.id);
  if (content.activePageId) ids.add(content.activePageId);
  else if (content.pages?.[0]) ids.add(content.pages[0].id);
  else ids.add("page-1"); // legacy content: the implicit active page id is page-1.
  return ids;
}

/**
 * Validates the action-dependent shape of an interaction against the artifact's
 * known pages. Mirrors the project-store persistence validator exactly so no
 * command can apply and then fail persistence:
 *  - delay is required for after-delay and forbidden otherwise;
 *  - navigate requires a destinationPageId and forbids url/overlay;
 *  - back/close-overlay forbid destinationPageId/url/transition/overlay;
 *  - open-url forbids destinationPageId/transition/overlay (url optional);
 *  - open-overlay/toggle-overlay require destinationPageId + overlay, forbid url;
 *  - transition is only allowed on destination-opening actions.
 */
function validateInteractionShape(
  interaction: CanvasPrototypeInteraction,
  pageIds: Set<string>,
): CanvasCommandGroupError | undefined {
  const action = interaction.action;
  const opensDestination = DESTINATION_ACTIONS.has(action);
  // delay is required for after-delay and forbidden for every other trigger,
  // matching persistence exactly.
  if (interaction.trigger === "after-delay") {
    if (interaction.delay === undefined) {
      return { kind: "invalid-interaction", reason: "after-delay requires a delay" };
    }
  } else if (interaction.delay !== undefined) {
    return { kind: "invalid-interaction", reason: `${interaction.trigger} must not carry a delay` };
  }
  if (action === "navigate") {
    if (!isNonemptyBoundedString(interaction.destinationPageId)) {
      return { kind: "invalid-interaction", reason: "navigate requires a destinationPageId" };
    }
    if (!pageIds.has(interaction.destinationPageId)) {
      return { kind: "unknown-destination-page", pageId: interaction.destinationPageId, destinationPageId: interaction.destinationPageId };
    }
    if (interaction.url !== undefined) {
      return { kind: "invalid-interaction", reason: "navigate must not carry a url" };
    }
    if (interaction.overlay !== undefined) {
      return { kind: "invalid-overlay", reason: "overlay is only valid for open-overlay/toggle-overlay, not navigate" };
    }
  } else if (action === "back" || action === "close-overlay") {
    if (interaction.destinationPageId !== undefined) {
      return { kind: "invalid-interaction", reason: `${action} must not carry a destinationPageId` };
    }
    if (interaction.url !== undefined) {
      return { kind: "invalid-interaction", reason: `${action} must not carry a url` };
    }
    if (interaction.transition !== undefined) {
      return { kind: "invalid-transition", reason: `${action} must not carry a transition` };
    }
    if (interaction.overlay !== undefined) {
      return { kind: "invalid-overlay", reason: `overlay is only valid for open-overlay/toggle-overlay, not ${action}` };
    }
  } else if (action === "open-url") {
    if (interaction.destinationPageId !== undefined) {
      return { kind: "invalid-interaction", reason: "open-url must not carry a destinationPageId" };
    }
    if (interaction.transition !== undefined) {
      return { kind: "invalid-transition", reason: "open-url must not carry a transition" };
    }
    if (interaction.overlay !== undefined) {
      return { kind: "invalid-overlay", reason: "overlay is only valid for open-overlay/toggle-overlay, not open-url" };
    }
    if (interaction.url !== undefined && !isSafePrototypeUrl(interaction.url)) {
      return { kind: "unsafe-url", url: String(interaction.url) };
    }
  } else if (action === "open-overlay" || action === "toggle-overlay") {
    if (!isNonemptyBoundedString(interaction.destinationPageId)) {
      return { kind: "invalid-interaction", reason: `${action} requires a destinationPageId` };
    }
    if (!pageIds.has(interaction.destinationPageId)) {
      return { kind: "unknown-destination-page", pageId: interaction.destinationPageId, destinationPageId: interaction.destinationPageId };
    }
    if (interaction.url !== undefined) {
      return { kind: "invalid-interaction", reason: `${action} must not carry a url` };
    }
    if (interaction.overlay === undefined) {
      return { kind: "invalid-overlay", reason: `${action} requires an overlay` };
    }
  }
  // transition is only allowed on destination-opening actions (navigate/open-overlay/toggle-overlay).
  if (interaction.transition !== undefined) {
    if (!opensDestination) {
      return { kind: "invalid-transition", reason: "transition is only valid for navigate/open-overlay/toggle-overlay" };
    }
    const transitionError = validateTransition(interaction.transition, action);
    if (transitionError) return transitionError;
  }
  if (interaction.overlay !== undefined) {
    if (action !== "open-overlay" && action !== "toggle-overlay") {
      return { kind: "invalid-overlay", reason: `overlay is only valid for open-overlay/toggle-overlay, not ${action}` };
    }
    const overlayError = validateOverlay(interaction.overlay);
    if (overlayError) return overlayError;
  }
  return undefined;
}

function validateInteraction(
  interaction: CanvasPrototypeInteraction,
  existingTriggers: Set<CanvasPrototypeTrigger>,
  pageIds: Set<string>,
): CanvasCommandGroupError | undefined {
  // Interaction ids must be <=240 chars to match project-store persistence
  // (isCanvasPrototypeInteraction caps interaction.id at 240). The untrusted
  // parser is stricter (200); the applier caps at the persistence bound so an
  // internally generated inverse can never carry an id persistence would reject.
  if (!isNonemptyStringOfMaxLength(interaction.id, CANVAS_PERSISTED_ID_MAX_LENGTH)) {
    return { kind: "invalid-interaction", reason: `interaction id must be a nonempty string of length <= ${CANVAS_PERSISTED_ID_MAX_LENGTH}` };
  }
  if (!RECOGNIZED_TRIGGERS.has(interaction.trigger)) {
    return { kind: "invalid-interaction", reason: `unrecognized trigger: ${String(interaction.trigger)}` };
  }
  if (!RECOGNIZED_ACTIONS.has(interaction.action)) {
    return { kind: "invalid-interaction", reason: `unrecognized action: ${String(interaction.action)}` };
  }
  // Reject extra fields so untrusted payloads cannot smuggle arbitrary data.
  for (const key of Object.keys(interaction as unknown as Record<string, unknown>)) {
    if (key !== "id" && key !== "trigger" && key !== "action" && key !== "delay" && key !== "destinationPageId" && key !== "url" && key !== "transition" && key !== "overlay") {
      return { kind: "invalid-interaction", reason: `unexpected interaction field: ${key}` };
    }
  }
  if (interaction.delay !== undefined && (!isFiniteNumber(interaction.delay) || interaction.delay < 0 || interaction.delay > 60_000)) {
    return { kind: "invalid-interaction", reason: "delay must be a finite non-negative number of milliseconds (<=60000)" };
  }
  const shapeError = validateInteractionShape(interaction, pageIds);
  if (shapeError) return shapeError;
  if (existingTriggers.has(interaction.trigger)) {
    return { kind: "duplicate-trigger", elementId: "", trigger: interaction.trigger };
  }
  return undefined;
}

/** Keys that are always present on every canvas element and cannot be cleared. */
const REQUIRED_PATCH_KEYS: ReadonlySet<CanvasPatchElementKey> = new Set(["x", "y", "width", "height", "color"]);

function validatePatchValue(key: CanvasPatchElementKey, value: unknown): CanvasCommandGroupError | undefined {
  // `undefined` clears an optional field, restoring absence on undo.
  if (value === undefined) {
    if (REQUIRED_PATCH_KEYS.has(key)) {
      return { kind: "invalid-patch-value", key, reason: "required field cannot be cleared" };
    }
    return undefined;
  }
  switch (key) {
    case "name":
    case "fontFamily":
    case "color":
    case "strokeColor":
    case "text": {
      // Per-key persisted ceilings so an accepted patch can never exceed what
      // project-store's isCanvasElement would reject.
      const max = PATCH_STRING_MAX_LENGTH[key] ?? CANVAS_COMMAND_MAX_STRING_LENGTH;
      if (!isNonemptyStringOfMaxLength(value, max)) {
        return { kind: "invalid-patch-value", key, reason: `must be a nonempty string of length <= ${max}` };
      }
      return undefined;
    }
    case "x":
    case "y":
    case "width":
    case "height":
    case "rotation":
    case "opacity":
    case "fontWeight":
    case "letterSpacing":
      if (!isFiniteNumber(value)) {
        return { kind: "invalid-patch-value", key, reason: "must be a finite number" };
      }
      if ((key === "width" || key === "height") && value <= 0) {
        return { kind: "invalid-patch-value", key, reason: "must be a positive finite number" };
      }
      if (key === "opacity" && (value < 0 || value > 1)) {
        return { kind: "invalid-patch-value", key, reason: "must be in [0,1]" };
      }
      return undefined;
    case "fontSize":
    case "lineHeight":
    case "radius":
    case "strokeWidth":
    case "strokeDash":
      // Persistence caps these at 0..100_000.
      if (!isFiniteNumber(value) || value < 0 || value > 100_000) {
        return { kind: "invalid-patch-value", key, reason: "must be a finite number in [0, 100000]" };
      }
      return undefined;
    case "hidden":
    case "locked":
      if (typeof value !== "boolean") {
        return { kind: "invalid-patch-value", key, reason: "must be a boolean" };
      }
      return undefined;
    case "textAlign":
      if (value !== "left" && value !== "center" && value !== "right") {
        return { kind: "invalid-patch-value", key, reason: "must be left|center|right" };
      }
      return undefined;
    case "blendMode":
      if (!RECOGNIZED_BLEND_MODES.has(value as CanvasBlendMode)) {
        return { kind: "invalid-patch-value", key, reason: "unrecognized blend mode" };
      }
      return undefined;
    case "cornerRadii":
      if (!value || typeof value !== "object") {
        return { kind: "invalid-patch-value", key, reason: "must be a corner radii object" };
      }
      {
        const radii = value as Record<string, unknown>;
        for (const corner of ["topLeft", "topRight", "bottomRight", "bottomLeft"]) {
          if (!isFiniteNumber(radii[corner]) || (radii[corner] as number) < 0 || (radii[corner] as number) > 100_000) {
            return { kind: "invalid-patch-value", key, reason: `cornerRadii.${corner} must be a finite number in [0, 100000]` };
          }
        }
        for (const sub of Object.keys(radii)) {
          if (sub !== "topLeft" && sub !== "topRight" && sub !== "bottomRight" && sub !== "bottomLeft") {
            return { kind: "invalid-patch-value", key: sub, reason: `unexpected cornerRadii field: ${sub}` };
          }
        }
      }
      return undefined;
    case "layerBlur":
    case "backgroundBlur":
      if (!value || typeof value !== "object") {
        return { kind: "invalid-patch-value", key, reason: "must be a blur effect object" };
      }
      {
        const blur = value as Record<string, unknown>;
        // Persistence caps blur.value at 0..100.
        if (!isFiniteNumber(blur.value) || (blur.value as number) < 0 || (blur.value as number) > 100) {
          return { kind: "invalid-patch-value", key, reason: "blur.value must be a finite number in [0, 100]" };
        }
        if (typeof blur.visible !== "boolean") {
          return { kind: "invalid-patch-value", key, reason: "blur.visible must be a boolean" };
        }
        for (const sub of Object.keys(blur)) {
          if (sub !== "value" && sub !== "visible") {
            return { kind: "invalid-patch-value", key, reason: `unexpected blur field: ${sub}` };
          }
        }
      }
      return undefined;
    default:
      return { kind: "invalid-patch-value", key, reason: "unrecognized patch key" };
  }
}

function validatePatchFields(patch: CanvasPatchElementFields): CanvasCommandGroupError | undefined {
  const keys = Object.keys(patch);
  if (keys.length === 0) return { kind: "empty-patch" };
  for (const key of keys) {
    if (key === "interactions") return { kind: "interactions-in-patch" };
    if ((CANVAS_PATCH_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      return { kind: "forbidden-patch-key", key };
    }
    if (!PATCH_ALLOWED_KEYS.has(key as CanvasPatchElementKey)) {
      return { kind: "invalid-patch-value", key, reason: "unrecognized patch key" };
    }
    const valueError = validatePatchValue(key as CanvasPatchElementKey, (patch as Record<string, unknown>)[key]);
    if (valueError) return valueError;
  }
  return undefined;
}

/** Additive vector primitive types permitted by `add-elements`. */
const ADD_ELEMENT_TYPES: ReadonlySet<string> = new Set(["rectangle", "ellipse", "line", "arrow", "path", "text"]);

/** Keys permitted on an additive element spec. Enforced strictly by the parser. */
const ADD_ELEMENT_ALLOWED_KEYS: ReadonlySet<string> = new Set([
  "id", "type", "x", "y", "width", "height", "color",
  "name", "rotation", "opacity", "radius",
  "strokeColor", "strokeWidth", "strokeDash",
  "text", "fontSize", "fontFamily", "fontWeight", "textAlign", "lineHeight", "letterSpacing",
  "points", "pathClosed", "pathSmoothing", "startCap", "endCap",
]);

/** Per-key string length ceilings for additive element specs, matching persistence. */
const ADD_ELEMENT_STRING_MAX: Record<string, number> = {
  name: 1_000,
  color: 80,
  strokeColor: 80,
  text: 250_000,
  fontFamily: 1_000,
};

/**
 * Validates an additive vector element spec against the constrained subset
 * and persistence ceilings. Returns a {@link CanvasCommandGroupError} on the
 * first failure, or undefined when the spec is acceptable.
 */
function validateAddElement(spec: CanvasAddElementSpec): CanvasCommandGroupError | undefined {
  if (!isNonemptyStringOfMaxLength(spec.id, CANVAS_PERSISTED_ID_MAX_LENGTH)) {
    return { kind: "invalid-element", reason: "id must be a nonempty string of length <= 240" };
  }
  if (!ADD_ELEMENT_TYPES.has(spec.type)) {
    return { kind: "invalid-element", reason: `type must be one of rectangle, ellipse, line, arrow, path, text (got ${String(spec.type)})` };
  }
  for (const key of ["x", "y", "width", "height"]) {
    const value = (spec as unknown as Record<string, unknown>)[key];
    if (!isFiniteNumber(value)) {
      return { kind: "invalid-element", reason: `${key} must be a finite number` };
    }
  }
  if (spec.width <= 0 || spec.height <= 0) {
    return { kind: "invalid-element", reason: "width and height must be positive finite numbers" };
  }
  if (!isNonemptyStringOfMaxLength(spec.color, ADD_ELEMENT_STRING_MAX.color)) {
    return { kind: "invalid-element", reason: `color must be a nonempty string of length <= ${ADD_ELEMENT_STRING_MAX.color}` };
  }
  // Optional bounded strings.
  for (const key of ["name", "strokeColor", "fontFamily"] as const) {
    const value = (spec as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (!isNonemptyStringOfMaxLength(value, ADD_ELEMENT_STRING_MAX[key])) {
      return { kind: "invalid-element", reason: `${key} must be a nonempty string of length <= ${ADD_ELEMENT_STRING_MAX[key]}` };
    }
  }
  // Optional finite numbers.
  for (const key of ["rotation", "opacity", "radius", "strokeWidth", "strokeDash", "fontSize", "lineHeight", "letterSpacing", "fontWeight"] as const) {
    const value = (spec as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (!isFiniteNumber(value)) {
      return { kind: "invalid-element", reason: `${key} must be a finite number` };
    }
    if (key === "opacity" && (value < 0 || value > 1)) {
      return { kind: "invalid-element", reason: "opacity must be in [0,1]" };
    }
    if (["radius", "strokeWidth", "strokeDash", "fontSize", "lineHeight"].includes(key) && (value < 0 || value > 100_000)) {
      return { kind: "invalid-element", reason: `${key} must be in [0, 100000]` };
    }
  }
  // radius is only valid on rectangles.
  if (spec.radius !== undefined && spec.type !== "rectangle") {
    return { kind: "invalid-element", reason: `radius is only valid on rectangle, not ${spec.type}` };
  }
  // Text fields are only valid on text elements.
  const textOnlyKeys = ["text", "fontSize", "fontFamily", "fontWeight", "textAlign", "lineHeight", "letterSpacing"] as const;
  for (const key of textOnlyKeys) {
    if ((spec as unknown as Record<string, unknown>)[key] !== undefined && spec.type !== "text") {
      return { kind: "invalid-element", reason: `${key} is only valid on text elements` };
    }
  }
  if (spec.text !== undefined) {
    if (!isNonemptyStringOfMaxLength(spec.text, ADD_ELEMENT_STRING_MAX.text)) {
      return { kind: "invalid-element", reason: `text must be a nonempty string of length <= ${ADD_ELEMENT_STRING_MAX.text}` };
    }
  }
  if (spec.textAlign !== undefined && spec.textAlign !== "left" && spec.textAlign !== "center" && spec.textAlign !== "right") {
    return { kind: "invalid-element", reason: "textAlign must be left|center|right" };
  }
  // Points are only valid on path/line/arrow.
  if (spec.points !== undefined) {
    if (spec.type !== "path" && spec.type !== "line" && spec.type !== "arrow") {
      return { kind: "invalid-element", reason: `points are only valid on path, line, or arrow, not ${spec.type}` };
    }
    if (!Array.isArray(spec.points) || spec.points.length < 2 || spec.points.length > CANVAS_COMMAND_MAX_ADD_POINTS) {
      return { kind: "invalid-element", reason: `points must be an array of 2..${CANVAS_COMMAND_MAX_ADD_POINTS} points` };
    }
    for (const point of spec.points) {
      const pointError = validateAddPoint(point);
      if (pointError) return pointError;
    }
  } else if (spec.type === "path" || spec.type === "line" || spec.type === "arrow") {
    return { kind: "invalid-element", reason: `${spec.type} requires points` };
  }
  if (spec.pathClosed !== undefined) {
    if (typeof spec.pathClosed !== "boolean") {
      return { kind: "invalid-element", reason: "pathClosed must be a boolean" };
    }
    if (spec.type !== "path") {
      return { kind: "invalid-element", reason: "pathClosed is only valid on path elements" };
    }
  }
  if (spec.pathSmoothing !== undefined) {
    if (!isFiniteNumber(spec.pathSmoothing) || spec.pathSmoothing < 0 || spec.pathSmoothing > 1) {
      return { kind: "invalid-element", reason: "pathSmoothing must be in [0,1]" };
    }
    if (spec.type !== "path" && spec.type !== "line" && spec.type !== "arrow") {
      return { kind: "invalid-element", reason: `pathSmoothing is only valid on path, line, or arrow, not ${spec.type}` };
    }
  }
  for (const capKey of ["startCap", "endCap"] as const) {
    const value = (spec as unknown as Record<string, unknown>)[capKey];
    if (value === undefined) continue;
    if (value !== "none" && value !== "arrow" && value !== "round") {
      return { kind: "invalid-element", reason: `${capKey} must be none|arrow|round` };
    }
    if (spec.type !== "path" && spec.type !== "line" && spec.type !== "arrow") {
      return { kind: "invalid-element", reason: `${capKey} is only valid on path, line, or arrow, not ${spec.type}` };
    }
  }
  return undefined;
}

function validateAddPoint(point: unknown): CanvasCommandGroupError | undefined {
  if (!point || typeof point !== "object" || Array.isArray(point)) {
    return { kind: "invalid-element", reason: "point must be an object" };
  }
  const p = point as Record<string, unknown>;
  for (const key of ["x", "y"]) {
    if (!isFiniteNumber(p[key]) || (p[key] as number) < -10 || (p[key] as number) > 10) {
      return { kind: "invalid-element", reason: `point.${key} must be a finite number in [-10, 10]` };
    }
  }
  if (p.nodeType !== undefined && p.nodeType !== "corner" && p.nodeType !== "smooth") {
    return { kind: "invalid-element", reason: "point.nodeType must be corner|smooth" };
  }
  for (const handleKey of ["handleIn", "handleOut"]) {
    const handle = p[handleKey];
    if (handle === undefined) continue;
    if (!handle || typeof handle !== "object" || Array.isArray(handle)) {
      return { kind: "invalid-element", reason: `point.${handleKey} must be an object` };
    }
    const h = handle as Record<string, unknown>;
    for (const key of ["x", "y"]) {
      if (!isFiniteNumber(h[key]) || (h[key] as number) < -100_000 || (h[key] as number) > 100_000) {
        return { kind: "invalid-element", reason: `point.${handleKey}.${key} must be a finite number in [-100000, 100000]` };
      }
    }
    for (const sub of Object.keys(h)) {
      if (sub !== "x" && sub !== "y") {
        return { kind: "invalid-element", reason: `unexpected point.${handleKey} field: ${sub}` };
      }
    }
  }
  for (const sub of Object.keys(p)) {
    if (sub !== "x" && sub !== "y" && sub !== "handleIn" && sub !== "handleOut" && sub !== "nodeType") {
      return { kind: "invalid-element", reason: `unexpected point field: ${sub}` };
    }
  }
  return undefined;
}

/** Optional action-specific interaction fields that JSON `null` may clear. */
const NULLABLE_INTERACTION_FIELDS = ["delay", "destinationPageId", "url", "transition", "overlay"] as const;

/**
 * Builds the merged interaction for a patch-interaction command. Both JSON
 * `null` (the explicit clear sentinel accepted by the parser) and `undefined`
 * (the internal "absent prior" value produced by inverses) delete the field;
 * any other value replaces it. Existing key order is preserved, and new keys
 * are appended in patch order, so apply + inverse restores the exact original
 * JSON shape (including field ordering). `trigger`/`action` are never
 * clearable via null (rejected upstream) and are copied verbatim when present.
 */
function mergeInteractionPatch(
  existing: CanvasPrototypeInteraction,
  patch: Partial<Omit<CanvasPrototypeInteraction, "id">>,
): CanvasPrototypeInteraction {
  const merged = {} as Record<string, unknown>;
  const patchRecord = patch as Record<string, unknown>;
  // First pass: walk the existing keys in order, replacing or clearing.
  for (const key of Object.keys(existing)) {
    if (Object.prototype.hasOwnProperty.call(patchRecord, key)) {
      const value = patchRecord[key];
      if (value === null || value === undefined) continue; // clear: omit
      merged[key] = value;
    } else {
      merged[key] = (existing as unknown as Record<string, unknown>)[key];
    }
  }
  // Second pass: append new keys introduced by the patch, in patch order.
  for (const key of Object.keys(patchRecord)) {
    if (!Object.prototype.hasOwnProperty.call(existing, key)) {
      const value = patchRecord[key];
      if (value === null || value === undefined) continue; // clear of absent key: stays absent
      merged[key] = value;
    }
  }
  return merged as unknown as CanvasPrototypeInteraction;
}

function validateInteractionPatch(
  patch: Partial<Omit<CanvasPrototypeInteraction, "id">>,
  existing: CanvasPrototypeInteraction,
  pageIds: Set<string>,
): CanvasCommandGroupError | undefined {
  const keys = Object.keys(patch);
  if (keys.length === 0) return { kind: "empty-patch" };
  // Reject id and any unknown/forbidden keys.
  for (const key of keys) {
    if (key === "id") return { kind: "forbidden-patch-key", key };
    if (key !== "trigger" && key !== "action" && key !== "delay" && key !== "destinationPageId" && key !== "url" && key !== "transition" && key !== "overlay") {
      return { kind: "forbidden-patch-key", key };
    }
  }
  // JSON null is only permitted for the optional action-specific fields; it
  // means delete/clear the field. null for trigger/action is rejected.
  for (const key of keys) {
    const value = (patch as Record<string, unknown>)[key];
    if (value === null && !(NULLABLE_INTERACTION_FIELDS as readonly string[]).includes(key)) {
      return { kind: "invalid-interaction", reason: `null is not permitted for ${key}` };
    }
  }
  if (patch.trigger !== undefined && patch.trigger !== null && !RECOGNIZED_TRIGGERS.has(patch.trigger)) {
    return { kind: "invalid-interaction", reason: `unrecognized trigger: ${String(patch.trigger)}` };
  }
  if (patch.trigger === null) {
    return { kind: "invalid-interaction", reason: "null is not permitted for trigger" };
  }
  if (patch.action !== undefined && patch.action !== null && !RECOGNIZED_ACTIONS.has(patch.action)) {
    return { kind: "invalid-interaction", reason: `unrecognized action: ${String(patch.action)}` };
  }
  if (patch.action === null) {
    return { kind: "invalid-interaction", reason: "null is not permitted for action" };
  }
  if (patch.delay !== undefined && patch.delay !== null && (!isFiniteNumber(patch.delay) || patch.delay < 0 || patch.delay > 60_000)) {
    return { kind: "invalid-interaction", reason: "delay must be a finite non-negative number of milliseconds (<=60000)" };
  }
  if (patch.transition !== undefined && patch.transition !== null) {
    // Validate transition in the merged action context (smart/direction rules depend on action).
    const mergedAction = patch.action !== undefined && patch.action !== null ? patch.action : existing.action;
    const transitionError = validateTransition(patch.transition, mergedAction);
    if (transitionError) return transitionError;
  }
  if (patch.overlay !== undefined && patch.overlay !== null) {
    const overlayError = validateOverlay(patch.overlay);
    if (overlayError) return overlayError;
  }
  // Validate the merged action-dependent shape against the artifact's pages.
  const merged = mergeInteractionPatch(existing, patch);
  const shapeError = validateInteractionShape(merged, pageIds);
  if (shapeError) return shapeError;
  return undefined;
}

/** Returns true when the element is locked, considering inherited lock state. */
function elementLockedWithAncestors(page: CanvasPage, element: CanvasElement): boolean {
  if (element.locked) return true;
  if (!element.parentId) return false;
  const byId = new Map(page.elements.map((node) => [node.id, node]));
  const visited = new Set<string>();
  let parentId: string | undefined = element.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    if (parent.locked) return true;
    parentId = parent.parentId;
  }
  return false;
}

/**
 * Returns true when the element is locked by an ancestor (inherited lock), as
 * opposed to being locked directly on itself. Inherited locks can never be
 * cleared by patching the locked target, so any edit to such a target is
 * rejected unconditionally.
 */
function elementLockedByAncestor(page: CanvasPage, element: CanvasElement): boolean {
  if (element.locked) return false;
  if (!element.parentId) return false;
  return elementLockedWithAncestors(page, element);
}

/**
 * A patch may edit a directly-locked target only when that same atomic patch
 * explicitly clears the lock (sets `locked: false` or clears it via the
 * internal `undefined` sentinel) so undo can restore all prior fields. Any other
 * edit to a directly-locked target is rejected. Inherited locks are always
 * rejected (the target cannot unlock an ancestor).
 */
function patchUnlocksTarget(patch: CanvasPatchElementFields): boolean {
  if (!Object.prototype.hasOwnProperty.call(patch, "locked")) return false;
  const value = (patch as Record<string, unknown>).locked;
  return value === false || value === undefined;
}

/**
 * Builds a persisted {@link CanvasElement} from a validated additive spec,
 * copying only the present spec fields (preserving absence of optionals) and
 * deep-cloning points/handles so the stored element never aliases the
 * untrusted command input.
 */
function buildAddElement(spec: CanvasAddElementSpec): CanvasElement {
  const out: Record<string, unknown> = {
    id: spec.id,
    type: spec.type,
    x: spec.x,
    y: spec.y,
    width: spec.width,
    height: spec.height,
    color: spec.color,
  };
  const setIfPresent = (key: string, value: unknown): void => {
    if (value !== undefined) out[key] = value;
  };
  setIfPresent("name", spec.name);
  setIfPresent("rotation", spec.rotation);
  setIfPresent("opacity", spec.opacity);
  setIfPresent("radius", spec.radius);
  setIfPresent("strokeColor", spec.strokeColor);
  setIfPresent("strokeWidth", spec.strokeWidth);
  setIfPresent("strokeDash", spec.strokeDash);
  setIfPresent("text", spec.text);
  setIfPresent("fontSize", spec.fontSize);
  setIfPresent("fontFamily", spec.fontFamily);
  setIfPresent("fontWeight", spec.fontWeight);
  setIfPresent("textAlign", spec.textAlign);
  setIfPresent("lineHeight", spec.lineHeight);
  setIfPresent("letterSpacing", spec.letterSpacing);
  if (spec.points !== undefined) {
    out.points = spec.points.map((point) => {
      const p: Record<string, unknown> = { x: point.x, y: point.y };
      if (point.nodeType !== undefined) p.nodeType = point.nodeType;
      if (point.handleIn !== undefined) p.handleIn = { ...point.handleIn };
      if (point.handleOut !== undefined) p.handleOut = { ...point.handleOut };
      return p;
    });
  }
  setIfPresent("pathClosed", spec.pathClosed);
  setIfPresent("pathSmoothing", spec.pathSmoothing);
  setIfPresent("startCap", spec.startCap);
  setIfPresent("endCap", spec.endCap);
  return out as unknown as CanvasElement;
}

/** Inverse of {@link buildAddElement}: extracts the additive subset from a stored element. */
function specFromElement(element: CanvasElement): CanvasAddElementSpec {
  const e = element as unknown as Record<string, unknown>;
  const spec: Record<string, unknown> = {
    id: e.id,
    type: e.type,
    x: e.x,
    y: e.y,
    width: e.width,
    height: e.height,
    color: e.color,
  };
  for (const key of [
    "name", "rotation", "opacity", "radius",
    "strokeColor", "strokeWidth", "strokeDash",
    "text", "fontSize", "fontFamily", "fontWeight", "textAlign", "lineHeight", "letterSpacing",
    "points", "pathClosed", "pathSmoothing", "startCap", "endCap",
  ]) {
    if (e[key] !== undefined) spec[key] = e[key];
  }
  return spec as unknown as CanvasAddElementSpec;
}

/**
 * Applies a command group atomically.
 *
 * On any validation failure the input content is returned unchanged and an
 * error is thrown carrying the first {@link CanvasCommandGroupError}. The
 * returned inverse commands, when applied in order to the result, restore the
 * exact prior content (including absence vs presence of fields/interactions).
 */
export function applyCanvasCommandGroup(content: CanvasArtifactContent, group: CanvasCommandGroup): CanvasCommandGroupResult {
  if (group.commands.length > CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE) {
    throw new CanvasCommandError({ kind: "group-too-large", size: group.commands.length });
  }
  if (group.selectionIds.length > CANVAS_COMMAND_MAX_SELECTION) {
    throw new CanvasCommandError({ kind: "selection-too-large", size: group.selectionIds.length });
  }

  const page = findPage(content, group.pageId);
  // The active page may be represented only by the top-level mirror when pages is absent.
  const activePageId = content.activePageId ?? content.pages?.[0]?.id ?? "page-1";
  const hasPageEntry = Boolean(page);
  const isActivePage = group.pageId === activePageId;
  // Legacy content carries no `pages` array and no `activePageId`; only the
  // top-level compatibility mirror (frame/elements/appState) is authoritative.
  // Edits stay in that mirror and never materialize pages/activePageId, so an
  // apply + inverse restores the exact original JSON shape.
  const isLegacyContent = content.pages === undefined && content.activePageId === undefined;
  if (!hasPageEntry && !(isActivePage && isLegacyContent)) {
    throw new CanvasCommandError({ kind: "unknown-page", pageId: group.pageId });
  }

  // Build the working page from the entry or the top-level mirror.
  const workingPage: CanvasPage = page ?? {
    id: group.pageId,
    name: "Page 1",
    frame: content.frame,
    elements: content.elements,
    appState: content.appState,
  };

  const selectionSet = new Set(group.selectionIds);
  const elementsById = new Map(workingPage.elements.map((element) => [element.id, element]));
  const pageIds = knownPageIds(content);

  // Reject empty command groups up front so a no-op batch is never accepted.
  if (group.commands.length === 0) {
    throw new CanvasCommandError({ kind: "empty-command-group" });
  }
  // Reject duplicate selection ids: the selection scope must be a set.
  {
    const seenSelection = new Set<string>();
    for (const id of group.selectionIds) {
      if (seenSelection.has(id)) throw new CanvasCommandError({ kind: "duplicate-selection", elementId: id });
      seenSelection.add(id);
    }
  }
  // Every selection id must exist on the target page before any command is
  // validated. A stale captured selection (ids that no longer exist) must fail
  // atomically even if the commands do not target those ids.
  for (const id of group.selectionIds) {
    if (!elementsById.has(id)) {
      throw new CanvasCommandError({ kind: "unknown-element", pageId: group.pageId, elementId: id });
    }
  }

  // Prospective element ids: additive `add-elements` commands claim new ids
  // atomically across the whole group so two adds cannot reuse the same id, and
  // a later add cannot reuse an id that already exists on the page. The size
  // of this set is also the prospective page element count, checked against the
  // persistence cap so no accepted additive group can produce a page
  // persistence would reject.
  const prospectiveElementIds = new Set<string>(elementsById.keys());

  // Prospective interaction state: as validation proceeds we mirror the effect
  // of earlier commands so later commands are checked against the state they
  // will actually see, not the original scene. This makes id/trigger
  // consistency atomic across the whole group.
  const prospectiveInteractions = new Map<string, CanvasPrototypeInteraction[]>();
  // Interaction ids that currently "exist" prospectively across the whole
  // group. A remove frees its id; an add claims it. Two adds claiming the same
  // id (even on different elements) are rejected as a group consistency error.
  const prospectiveInteractionIds = new Set<string>();
  for (const element of workingPage.elements) {
    for (const interaction of element.interactions ?? []) prospectiveInteractionIds.add(interaction.id);
  }
  function interactionsFor(elementId: string): CanvasPrototypeInteraction[] {
    const existing = prospectiveInteractions.get(elementId);
    if (existing) return existing;
    const original = elementsById.get(elementId)?.interactions ?? [];
    const copy = original.map((interaction) => ({ ...interaction }));
    prospectiveInteractions.set(elementId, copy);
    return copy;
  }
  function interactionById(elementId: string, interactionId: string): CanvasPrototypeInteraction | undefined {
    return interactionsFor(elementId).find((interaction) => interaction.id === interactionId);
  }
  function triggersFor(elementId: string, exceptId?: string): Set<CanvasPrototypeTrigger> {
    return new Set(interactionsFor(elementId).filter((interaction) => interaction.id !== exceptId).map((interaction) => interaction.trigger));
  }

  // Prospective element lock state: as validation proceeds we mirror the effect
  // of earlier patch-elements commands on each target's `locked` field so later
  // commands are checked against the lock state they will actually see, not the
  // original scene. This makes lock-then-mutate rejection atomic across the
  // whole group, and keeps generated inverses that first unlock and then
  // restore later mutations applicable.
  const prospectiveLocked = new Map<string, boolean>();
  function directLockedProspectively(elementId: string): boolean {
    return prospectiveLocked.has(elementId) ? prospectiveLocked.get(elementId)! : Boolean(elementsById.get(elementId)?.locked);
  }
  function lockedByAncestorProspectively(elementId: string): boolean {
    // Inherited locks must never be masked by the target's own direct lock.
    // A directly-locked child under a locked parent cannot atomically unlock
    // itself — the inherited ancestor lock must remain authoritative — so the
    // ancestor traversal always starts at parentId and inspects every ancestor
    // independently of the target's own (prospective or original) lock state.
    const element = elementsById.get(elementId);
    if (!element || !element.parentId) return false;
    const visited = new Set<string>();
    let parentId: string | undefined = element.parentId;
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = elementsById.get(parentId);
      if (!parent) break;
      if (directLockedProspectively(parent.id)) return true;
      parentId = parent.parentId;
    }
    return false;
  }
  function lockedWithAncestorsProspectively(elementId: string): boolean {
    return directLockedProspectively(elementId) || lockedByAncestorProspectively(elementId);
  }
  /** Commits the prospective lock effect of a patch-elements command. */
  function commitProspectiveLock(elementId: string, patch: CanvasPatchElementFields): void {
    if (!Object.prototype.hasOwnProperty.call(patch, "locked")) return;
    const value = (patch as Record<string, unknown>).locked;
    // `locked: false` or the internal `undefined` clear sentinel both unlock.
    prospectiveLocked.set(elementId, value === true);
  }

  const inverse: CanvasCommand[] = [];
  const affected = new Set<string>();

  // Validate every command before mutating, then apply.
  for (const command of group.commands) {
    if (command.type === "patch-elements") {
      if (command.elementIds.length === 0) {
        throw new CanvasCommandError({ kind: "empty-patch" });
      }
      const patchError = validatePatchFields(command.patch);
      if (patchError) throw new CanvasCommandError(patchError);
      const seenInCommand = new Set<string>();
      for (const id of command.elementIds) {
        if (seenInCommand.has(id)) throw new CanvasCommandError({ kind: "duplicate-target", elementId: id });
        seenInCommand.add(id);
        const element = elementsById.get(id);
        if (!element) throw new CanvasCommandError({ kind: "unknown-element", pageId: group.pageId, elementId: id });
        if (!selectionSet.has(id)) throw new CanvasCommandError({ kind: "out-of-selection", elementId: id });
        // Inherited (ancestor) locks can never be cleared by patching the
        // target, so every edit to such a target is rejected unconditionally.
        // The ancestor check uses prospective lock state so a prior command in
        // this same group that locked an ancestor also rejects later edits.
        if (lockedByAncestorProspectively(id)) {
          throw new CanvasCommandError({ kind: "locked", elementId: id });
        }
        // A directly-locked target may be edited only when this same atomic
        // patch explicitly clears/unsets `locked`, so undo can restore all
        // prior fields (including locked:true). The direct-lock check uses
        // prospective state so a prior command that locked this target (or one
        // that unlocked it) is honored by later commands in the same group.
        if (directLockedProspectively(id) && !patchUnlocksTarget(command.patch)) {
          throw new CanvasCommandError({ kind: "locked", elementId: id });
        }
        // Type-specific persistence constraint: cornerRadii is only valid on
        // rectangle/frame/image. Examine each target element during validation.
        if (command.patch.cornerRadii !== undefined && !CORNER_RADII_ELEMENT_TYPES.has(String(element.type))) {
          throw new CanvasCommandError({ kind: "invalid-patch-value", key: "cornerRadii", reason: `cornerRadii is only valid on rectangle/frame/image, not ${String(element.type)}` });
        }
      }
      // Commit prospective lock state for every targeted element so later
      // commands in this group see the lock effect of this patch.
      for (const id of command.elementIds) commitProspectiveLock(id, command.patch);
    } else if (command.type === "add-interaction") {
      const id = command.elementId;
      const element = elementsById.get(id);
      if (!element) throw new CanvasCommandError({ kind: "unknown-element", pageId: group.pageId, elementId: id });
      if (!selectionSet.has(id)) throw new CanvasCommandError({ kind: "out-of-selection", elementId: id });
      if (lockedWithAncestorsProspectively(id)) {
        throw new CanvasCommandError({ kind: "locked", elementId: id });
      }
      const currentInteractions = interactionsFor(id);
      const existingTriggers = new Set(currentInteractions.map((interaction) => interaction.trigger));
      if (prospectiveInteractionIds.has(command.interaction.id)) {
        throw new CanvasCommandError({ kind: "duplicate-interaction-id", interactionId: command.interaction.id });
      }
      const interactionError = validateInteraction(command.interaction, existingTriggers, pageIds);
      if (interactionError) {
        throw new CanvasCommandError(interactionError.kind === "duplicate-trigger"
          ? { kind: "duplicate-trigger", elementId: id, trigger: interactionError.trigger as CanvasPrototypeTrigger }
          : interactionError);
      }
      // Commit prospective state so later commands see the new interaction.
      prospectiveInteractions.set(id, [...currentInteractions, cloneInteraction(command.interaction)]);
      prospectiveInteractionIds.add(command.interaction.id);
    } else if (command.type === "patch-interaction") {
      const id = command.elementId;
      const element = elementsById.get(id);
      if (!element) throw new CanvasCommandError({ kind: "unknown-element", pageId: group.pageId, elementId: id });
      if (!selectionSet.has(id)) throw new CanvasCommandError({ kind: "out-of-selection", elementId: id });
      // Interactions on any locked target (direct or inherited) are rejected;
      // there is no unlock-via-interaction path. Uses prospective lock state so
      // a prior patch-elements in this group that locked the target rejects a
      // later interaction edit.
      if (lockedWithAncestorsProspectively(id)) {
        throw new CanvasCommandError({ kind: "locked", elementId: id });
      }
      const existing = interactionById(id, command.interactionId);
      if (!existing) {
        throw new CanvasCommandError({ kind: "unknown-interaction", pageId: group.pageId, elementId: id, interactionId: command.interactionId });
      }
      // Internal inverse path: an exact-restore payload replaces the matching
      // interaction wholesale (preserving property presence and insertion order).
      // Validate the restored object against the current persistence-compatible
      // rules so an internally generated inverse can never apply an invalid shape.
      if (command.restoreInteraction !== undefined) {
        const restored = command.restoreInteraction;
        if (restored.id !== command.interactionId) {
          throw new CanvasCommandError({ kind: "invalid-interaction", reason: "restoreInteraction id must match interactionId" });
        }
        const restoreError = validateInteraction(restored, new Set(triggersFor(id, existing.id)), pageIds);
        if (restoreError) {
          throw new CanvasCommandError(restoreError.kind === "duplicate-trigger"
            ? { kind: "duplicate-trigger", elementId: id, trigger: restoreError.trigger as CanvasPrototypeTrigger }
            : restoreError);
        }
        prospectiveInteractions.set(id, interactionsFor(id).map((interaction) => interaction.id === existing.id ? cloneInteraction(restored) : interaction));
        continue;
      }
      const patchError = validateInteractionPatch(command.patch, existing, pageIds);
      if (patchError) throw new CanvasCommandError(patchError);
      // Trigger uniqueness against the prospective sibling set (excluding self).
      if (command.patch.trigger !== undefined && command.patch.trigger !== existing.trigger) {
        if (triggersFor(id, existing.id).has(command.patch.trigger)) {
          throw new CanvasCommandError({ kind: "duplicate-trigger", elementId: id, trigger: command.patch.trigger });
        }
      }
      // Commit prospective merged interaction so later commands see it. JSON
      // null clears the field (delete); absent keys keep the existing value.
      const merged = mergeInteractionPatch(existing, command.patch);
      const nextList = interactionsFor(id).map((interaction) => interaction.id === existing.id ? cloneInteraction(merged) : interaction);
      prospectiveInteractions.set(id, nextList);
    } else if (command.type === "remove-interaction") {
      const id = command.elementId;
      const element = elementsById.get(id);
      if (!element) throw new CanvasCommandError({ kind: "unknown-element", pageId: group.pageId, elementId: id });
      if (!selectionSet.has(id)) throw new CanvasCommandError({ kind: "out-of-selection", elementId: id });
      if (lockedWithAncestorsProspectively(id)) {
        throw new CanvasCommandError({ kind: "locked", elementId: id });
      }
      const existing = interactionById(id, command.interactionId);
      if (!existing) {
        throw new CanvasCommandError({ kind: "unknown-interaction", pageId: group.pageId, elementId: id, interactionId: command.interactionId });
      }
      // Commit prospective removal so a later add-interaction can reuse the id/trigger.
      prospectiveInteractions.set(id, interactionsFor(id).filter((interaction) => interaction.id !== command.interactionId));
      prospectiveInteractionIds.delete(command.interactionId);
    } else if (command.type === "add-elements") {
      if (!Array.isArray(command.elements) || command.elements.length === 0) {
        throw new CanvasCommandError({ kind: "add-elements-empty" });
      }
      if (command.elements.length > CANVAS_COMMAND_MAX_ADD_ELEMENTS) {
        throw new CanvasCommandError({ kind: "too-many-add-elements", size: command.elements.length });
      }
      const seenInCommand = new Set<string>();
      for (const spec of command.elements) {
        const specError = validateAddElement(spec);
        if (specError) throw new CanvasCommandError(specError);
        if (prospectiveElementIds.has(spec.id) || seenInCommand.has(spec.id)) {
          throw new CanvasCommandError({ kind: "duplicate-element-id", elementId: spec.id });
        }
        seenInCommand.add(spec.id);
        // Claim the id prospectively so later commands in this group cannot
        // reuse it and so a later patch-elements targeting it (when selection
        // permits) sees it as existing.
        prospectiveElementIds.add(spec.id);
      }
      // Enforce the persisted page element cap (project-store rejects a page
      // with > 10_000 elements). The prospective count already includes the
      // claimed ids, so this single check covers multiple add-elements
      // commands in the same group atomically.
      if (prospectiveElementIds.size > CANVAS_PAGE_MAX_ELEMENTS) {
        throw new CanvasCommandError({ kind: "page-element-cap-exceeded", size: prospectiveElementIds.size });
      }
    } else if (command.type === "remove-elements") {
      // Internal inverse-only command. It is never accepted from untrusted
      // input (the parser rejects it); the applier only emits it as the
      // inverse of an `add-elements` command. Validate it can be applied.
      if (!Array.isArray(command.elementIds) || command.elementIds.length === 0) {
        throw new CanvasCommandError({ kind: "invalid-element", reason: "remove-elements requires a nonempty elementIds array" });
      }
      if (command.elementIds.length > CANVAS_COMMAND_MAX_APPLIER_GROUP_SIZE) {
        throw new CanvasCommandError({ kind: "group-too-large", size: command.elementIds.length });
      }
      const seenInCommand = new Set<string>();
      for (const id of command.elementIds) {
        if (!isNonemptyStringOfMaxLength(id, CANVAS_PERSISTED_ID_MAX_LENGTH)) {
          throw new CanvasCommandError({ kind: "invalid-element", reason: "remove-elements id must be a bounded string" });
        }
        if (seenInCommand.has(id)) {
          throw new CanvasCommandError({ kind: "duplicate-element-id", elementId: id });
        }
        seenInCommand.add(id);
        // The element must exist in the prospective scene (added by a prior
        // add-elements, or originally present).
        if (!prospectiveElementIds.has(id)) {
          throw new CanvasCommandError({ kind: "unknown-element", pageId: group.pageId, elementId: id });
        }
      }
    } else {
      throw new CanvasCommandError({ kind: "invalid-interaction", reason: `unrecognized command type: ${String((command as { type?: unknown }).type)}` });
    }
  }

  // Apply commands, building inverse as we go. We mutate copies only.
  // `currentById` is the live view of element state within this group: it starts
  // from the original page elements and is updated after each mutation so that
  // later commands in the same group (and their inverse prior-values) see the
  // effect of earlier commands.
  let nextElements = workingPage.elements;
  const currentById = new Map(workingPage.elements.map((element) => [element.id, element]));
  const elementMutated = new Set<string>();

  function ensureElementsMutable(): void {
    if (nextElements === workingPage.elements) {
      nextElements = workingPage.elements.slice();
    }
  }

  function commitElement(id: string, updated: CanvasElement): void {
    const index = nextElements.findIndex((element) => element.id === id);
    nextElements[index] = updated;
    currentById.set(id, updated);
  }

  function patchElement(element: CanvasElement, patch: CanvasPatchElementFields): CanvasElement {
    const next = { ...element } as Record<string, unknown>;
    // Use Object.keys (not Object.entries) so explicit `undefined` values that
    // restore absence are processed — Object.entries skips undefined-valued keys.
    for (const key of Object.keys(patch)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value === undefined) {
        delete next[key];
      } else {
        next[key] = value;
      }
    }
    return next as unknown as CanvasElement;
  }

  for (const command of group.commands) {
    if (command.type === "patch-elements") {
      for (const id of command.elementIds) {
        const current = currentById.get(id)!;
        ensureElementsMutable();
        const updated = patchElement(current, command.patch);
        commitElement(id, updated);
        // Inverse: patch back the prior values (only the keys that were set).
        const priorPatch: Record<string, unknown> = {};
        for (const key of Object.keys(command.patch)) {
          priorPatch[key] = recordOf(current)[key];
        }
        inverse.push({ type: "patch-elements", elementIds: [id], patch: priorPatch });
        affected.add(id);
        elementMutated.add(id);
      }
    } else if (command.type === "add-interaction") {
      const current = currentById.get(command.elementId)!;
      ensureElementsMutable();
      const existingInteractions = current.interactions ?? [];
      const hadExplicitList = Object.prototype.hasOwnProperty.call(current, "interactions");
      const nextInteraction = cloneInteraction(command.interaction);
      // An inverse add carries insertIndex so a removed middle interaction is
      // restored at its exact original position, preserving ordering.
      const nextList = command.insertIndex !== undefined && Number.isInteger(command.insertIndex) && command.insertIndex >= 0 && command.insertIndex <= existingInteractions.length
        ? [...existingInteractions.slice(0, command.insertIndex), nextInteraction, ...existingInteractions.slice(command.insertIndex)]
        : [...existingInteractions, nextInteraction];
      const updated: CanvasElement = {
        ...current,
        interactions: nextList,
      } as CanvasElement;
      commitElement(command.elementId, updated);
      // The inverse remove must restore `interactions: []` (present, empty) when
      // the original element carried an explicit empty list, instead of absence.
      inverse.push({
        type: "remove-interaction",
        elementId: command.elementId,
        interactionId: command.interaction.id,
        ...(hadExplicitList && existingInteractions.length === 0 ? { restoreEmptyList: true } : {}),
      });
      affected.add(command.elementId);
      elementMutated.add(command.elementId);
    } else if (command.type === "patch-interaction") {
      const current = currentById.get(command.elementId)!;
      const existing = findInteraction(current, command.interactionId)!;
      ensureElementsMutable();
      // Internal inverse path: an exact-restore payload replaces the matching
      // interaction wholesale, preserving property presence and insertion order.
      // The restored object was already validated in the validation phase.
      if (command.restoreInteraction !== undefined) {
        const restored = cloneInteraction(command.restoreInteraction);
        const updatedInteractions = (current.interactions ?? []).map((existingInteraction) => (
          existingInteraction.id === command.interactionId ? restored : existingInteraction
        ));
        commitElement(command.elementId, { ...current, interactions: updatedInteractions } as CanvasElement);
        // The inverse of an inverse restore is the forward patch's prior state:
        // capture the (now-current) interaction so a second undo redoes the edit.
        const redoRestore = cloneInteraction(existing);
        inverse.push({ type: "patch-interaction", elementId: command.elementId, interactionId: command.interactionId, patch: {}, restoreInteraction: redoRestore });
        affected.add(command.elementId);
        elementMutated.add(command.elementId);
        continue;
      }
      // Forward patch: capture the exact prior interaction object so the inverse
      // restores it wholesale (property presence and insertion order), in addition
      // to the per-key prior values retained for compatibility.
      const priorRestore = cloneInteraction(existing);
      const priorPatch: Partial<Omit<CanvasPrototypeInteraction, "id">> = {};
      for (const key of Object.keys(command.patch)) {
        (priorPatch as Record<string, unknown>)[key] = recordOf(existing)[key];
      }
      const updatedInteractions = (current.interactions ?? []).map((existingInteraction) => {
        if (existingInteraction.id !== command.interactionId) return existingInteraction;
        const merged = mergeInteractionPatch(existingInteraction, command.patch) as unknown as Record<string, unknown>;
        // Deep-clone transition/overlay when patched to concrete objects so the
        // stored interaction does not alias the command's input objects.
        if (command.patch.transition && typeof command.patch.transition === "object") {
          merged.transition = { ...command.patch.transition };
        }
        if (command.patch.overlay && typeof command.patch.overlay === "object") {
          merged.overlay = { ...command.patch.overlay };
        }
        return merged as unknown as CanvasPrototypeInteraction;
      });
      commitElement(command.elementId, { ...current, interactions: updatedInteractions } as CanvasElement);
      inverse.push({ type: "patch-interaction", elementId: command.elementId, interactionId: command.interactionId, patch: priorPatch, restoreInteraction: priorRestore });
      affected.add(command.elementId);
      elementMutated.add(command.elementId);
    } else if (command.type === "remove-interaction") {
      const current = currentById.get(command.elementId)!;
      const existing = findInteraction(current, command.interactionId)!;
      ensureElementsMutable();
      const originalList = current.interactions ?? [];
      const originalIndex = originalList.findIndex((interaction) => interaction.id === command.interactionId);
      const remaining = originalList.filter((interaction) => interaction.id !== command.interactionId);
      const updatedElement = { ...current } as unknown as Record<string, unknown>;
      // An empty interactions list is indistinguishable from absence; omit the
      // key so undo restores the exact prior shape (absent vs present) — unless
      // this is an inverse of an add that operated on `interactions: []`, in
      // which case the inverse hint restores the explicit empty list.
      if (remaining.length === 0 && !command.restoreEmptyList) {
        delete updatedElement.interactions;
      } else {
        updatedElement.interactions = remaining;
      }
      commitElement(command.elementId, updatedElement as unknown as CanvasElement);
      // Record the original index so the inverse add restores the interaction
      // at its exact prior position, preserving ordering for middle removals.
      inverse.push({
        type: "add-interaction",
        elementId: command.elementId,
        interaction: cloneInteraction(existing),
        ...(originalIndex >= 0 ? { insertIndex: originalIndex } : {}),
      });
      affected.add(command.elementId);
      elementMutated.add(command.elementId);
    } else if (command.type === "add-elements") {
      ensureElementsMutable();
      const addedIds: string[] = [];
      for (const spec of command.elements) {
        const built = buildAddElement(spec);
        nextElements.push(built);
        currentById.set(built.id, built);
        addedIds.push(built.id);
        affected.add(built.id);
        elementMutated.add(built.id);
      }
      // The inverse is an internal-only remove-elements command that, when
      // applied, restores the exact prior element array (content and order)
      // by filtering out the added ids.
      inverse.push({ type: "remove-elements", elementIds: addedIds });
    } else if (command.type === "remove-elements") {
      // Internal inverse-only command. Remove the named ids from the page,
      // capturing the removed elements (in order) so the inverse-of-inverse
      // (redo) can re-append them exactly.
      ensureElementsMutable();
      const removeSet = new Set(command.elementIds);
      const removed: CanvasElement[] = [];
      const kept: CanvasElement[] = [];
      for (const element of nextElements) {
        if (removeSet.has(element.id)) removed.push(element);
        else kept.push(element);
      }
      nextElements = kept;
      for (const element of removed) {
        currentById.delete(element.id);
        affected.add(element.id);
        elementMutated.add(element.id);
      }
      // The inverse add re-appends the removed elements as additive specs. The
      // elements were originally introduced via add-elements (this command is
      // only ever emitted as the inverse of an add-elements), so they conform
      // to the constrained additive subset.
      inverse.push({ type: "add-elements", elements: removed.map(specFromElement) });
    }
  }

  // Build the next content. Preserve untouched pages and the active-page mirror.
  const nextWorkingPage: CanvasPage = elementMutated.size === 0
    ? workingPage
    : { ...workingPage, elements: nextElements };

  let nextPages: CanvasPage[] | undefined;
  if (content.pages) {
    const pageIndex = content.pages.findIndex((entry) => entry.id === group.pageId);
    if (pageIndex === -1) {
      // Editing a synthetic active page with an existing pages array: append the resolved page.
      nextPages = [...content.pages, nextWorkingPage];
    } else {
      nextPages = content.pages.map((entry, index) => (index === pageIndex ? nextWorkingPage : entry));
    }
  } else if (isLegacyContent) {
    // Legacy content: keep the edit in the top-level compatibility mirror only;
    // never materialize pages/activePageId so apply + inverse restores the
    // exact original JSON shape (both fields absent).
    nextPages = undefined;
  } else {
    // pages absent but activePageId present: only the active page mirror was edited.
    nextPages = isActivePage ? [nextWorkingPage] : undefined;
  }

  let nextContent: CanvasArtifactContent;
  if (isActivePage) {
    if (isLegacyContent) {
      // Preserve the legacy top-level mirror; do not introduce pages/activePageId.
      nextContent = {
        ...content,
        frame: nextWorkingPage.frame,
        elements: nextWorkingPage.elements,
        appState: nextWorkingPage.appState,
      };
    } else {
      // Preserve the top-level compatibility mirror for the active page.
      nextContent = {
        ...content,
        frame: nextWorkingPage.frame,
        elements: nextWorkingPage.elements,
        appState: nextWorkingPage.appState,
        pages: nextPages,
        activePageId: group.pageId,
      };
    }
  } else {
    nextContent = {
      ...content,
      pages: nextPages,
    };
  }

  return { content: nextContent, inverse: inverse.reverse(), affectedElementIds: [...affected] };
}

/** Error thrown when a command group cannot be applied. Carries the first failure. */
export class CanvasCommandError extends Error {
  readonly reason: CanvasCommandGroupError;
  constructor(reason: CanvasCommandGroupError) {
    super(`canvas command group rejected: ${reason.kind}`);
    this.name = "CanvasCommandError";
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Bounded runtime parsing of untrusted command-group JSON.
//
// The agent returns canvasCommands as untrusted JSON. TypeScript casts are not
// trustworthy here, so every field is re-validated at the boundary before the
// command group is allowed near the scene model. The parser is deliberately
// strict: unknown fields, wrong types, and oversized values are rejected.
// ---------------------------------------------------------------------------

const CANVAS_COMMAND_MAX_ID_LENGTH = 200;

function isBoundedIdString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= CANVAS_COMMAND_MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(value);
}

function isStringArray(value: unknown, max: number): value is string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return false;
  return value.every((item) => isBoundedIdString(item));
}

function parseTransition(value: unknown, action?: CanvasPrototypeAction): CanvasPrototypeTransition | null | undefined {
  if (value === undefined) return undefined;
  // Explicit JSON null clears the field (patch-interaction only).
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("transition must be an object");
  const v = value as Record<string, unknown>;
  if (!RECOGNIZED_TRANSITION_TYPES.has(v.type as CanvasPrototypeTransition["type"])) throw new Error("invalid transition type");
  const type = v.type as CanvasPrototypeTransition["type"];
  // Persistence caps transition duration at 5000ms.
  if (!isFiniteNumber(v.duration) || v.duration < 0 || v.duration > 5_000) throw new Error("invalid transition duration");
  if (!RECOGNIZED_EASINGS.has(v.easing as CanvasPrototypeTransition["easing"])) throw new Error("invalid transition easing");
  if (v.direction !== undefined) {
    if (type !== "slide") throw new Error("direction is only valid for slide transitions");
    if (!RECOGNIZED_TRANSITION_DIRECTIONS.has(v.direction as NonNullable<CanvasPrototypeTransition["direction"]>)) throw new Error("invalid transition direction");
  }
  // Smart transitions are only valid for navigate. When `action` is undefined
  // (a patch-interaction that omits action), defer the smart-vs-action check
  // to the applier's merged-state validation, which can confirm the existing
  // action is navigate. An explicitly non-navigate action is still rejected
  // here so a contradictory patch never reaches the applier.
  if (type === "smart" && action !== undefined && action !== "navigate") throw new Error("smart transitions are only valid for navigate");
  for (const key of Object.keys(v)) {
    if (key !== "type" && key !== "duration" && key !== "easing" && key !== "direction") throw new Error(`unexpected transition field: ${key}`);
  }
  return { type: v.type as CanvasPrototypeTransition["type"], duration: v.duration as number, easing: v.easing as CanvasPrototypeTransition["easing"], ...(v.direction !== undefined ? { direction: v.direction as NonNullable<CanvasPrototypeTransition["direction"]> } : {}) };
}

function parseOverlay(value: unknown): CanvasPrototypeOverlay | null | undefined {
  if (value === undefined) return undefined;
  // Explicit JSON null clears the field (patch-interaction only).
  if (value === null) return null;
  if (!value || typeof value !== "object") throw new Error("overlay must be an object");
  const v = value as Record<string, unknown>;
  if (!RECOGNIZED_OVERLAY_POSITIONS.has(v.position as CanvasPrototypeOverlay["position"])) throw new Error("invalid overlay position");
  if (!RECOGNIZED_OVERLAY_BACKGROUNDS.has(v.background as CanvasPrototypeOverlay["background"])) throw new Error("invalid overlay background");
  if (typeof v.closeOnOutsideClick !== "boolean") throw new Error("overlay.closeOnOutsideClick must be boolean");
  for (const key of Object.keys(v)) {
    if (key !== "position" && key !== "background" && key !== "closeOnOutsideClick") throw new Error(`unexpected overlay field: ${key}`);
  }
  return { position: v.position as CanvasPrototypeOverlay["position"], background: v.background as CanvasPrototypeOverlay["background"], closeOnOutsideClick: v.closeOnOutsideClick as boolean };
}

function parseInteraction(value: unknown): CanvasPrototypeInteraction {
  if (!value || typeof value !== "object") throw new Error("interaction must be an object");
  const v = value as Record<string, unknown>;
  if (!isBoundedIdString(v.id)) throw new Error("interaction id must be a bounded id string");
  if (!RECOGNIZED_TRIGGERS.has(v.trigger as CanvasPrototypeTrigger)) throw new Error("invalid trigger");
  if (!RECOGNIZED_ACTIONS.has(v.action as CanvasPrototypeAction)) throw new Error("invalid action");
  const action = v.action as CanvasPrototypeAction;
  if (v.delay !== undefined && (!isFiniteNumber(v.delay) || v.delay < 0 || v.delay > 60_000)) throw new Error("invalid delay");
  if (v.destinationPageId !== undefined && !isBoundedIdString(v.destinationPageId)) throw new Error("invalid destinationPageId");
  if (v.url !== undefined && !isSafePrototypeUrl(v.url)) throw new Error("invalid url");
  // add-interaction is strict: JSON null is not a valid value for transition
  // or overlay. The null clear sentinel is only valid in patch-interaction's
  // optional fields, where parseTransition/parseOverlay explicitly accept it.
  if (v.transition === null) throw new Error("transition must be an object");
  if (v.overlay === null) throw new Error("overlay must be an object");
  const transition = parseTransition(v.transition, action);
  const overlay = parseOverlay(v.overlay);
  for (const key of Object.keys(v)) {
    if (key !== "id" && key !== "trigger" && key !== "action" && key !== "delay" && key !== "destinationPageId" && key !== "url" && key !== "transition" && key !== "overlay") {
      throw new Error(`unexpected interaction field: ${key}`);
    }
  }
  let url: string | undefined;
  if (v.url !== undefined) {
    if (!isSafePrototypeUrl(v.url) || typeof v.url !== "string") throw new Error("invalid url");
    url = v.url;
  }
  const interaction: CanvasPrototypeInteraction = {
    id: v.id,
    trigger: v.trigger as CanvasPrototypeTrigger,
    action: v.action as CanvasPrototypeAction,
    ...(v.delay !== undefined ? { delay: v.delay } : {}),
    ...(v.destinationPageId !== undefined ? { destinationPageId: v.destinationPageId } : {}),
    ...(url !== undefined ? { url } : {}),
    ...(transition ? { transition } : {}),
    ...(overlay ? { overlay } : {}),
  };
  return interaction;
}

function parsePatchFields(value: unknown): CanvasPatchElementFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("patch must be an object");
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length === 0) throw new Error("patch must not be empty");
  const out: CanvasPatchElementFields = {};
  for (const key of keys) {
    if (key === "interactions") throw new Error("interactions are not allowed in a patch");
    if ((CANVAS_PATCH_FORBIDDEN_KEYS as readonly string[]).includes(key)) throw new Error(`forbidden patch key: ${key}`);
    if (!PATCH_ALLOWED_KEYS.has(key as CanvasPatchElementKey)) throw new Error(`unknown patch key: ${key}`);
    // Re-validate the value via the same validator the applier uses.
    const valueError = validatePatchValue(key as CanvasPatchElementKey, v[key]);
    if (valueError) {
      const reason = valueError.kind === "invalid-patch-value" ? valueError.reason : valueError.kind;
      throw new Error(`invalid patch value for ${key}: ${reason}`);
    }
    (out as Record<string, unknown>)[key] = v[key];
  }
  return out;
}

function parseAddPoint(value: unknown): CanvasPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("point must be an object");
  const v = value as Record<string, unknown>;
  for (const key of Object.keys(v)) {
    if (key !== "x" && key !== "y" && key !== "handleIn" && key !== "handleOut" && key !== "nodeType") throw new Error(`unexpected point field: ${key}`);
  }
  if (!isFiniteNumber(v.x) || v.x < -10 || v.x > 10) throw new Error("point.x must be a finite number in [-10, 10]");
  if (!isFiniteNumber(v.y) || v.y < -10 || v.y > 10) throw new Error("point.y must be a finite number in [-10, 10]");
  if (v.nodeType !== undefined && v.nodeType !== "corner" && v.nodeType !== "smooth") throw new Error("point.nodeType must be corner|smooth");
  const point: Record<string, unknown> = { x: v.x, y: v.y };
  if (v.nodeType !== undefined) point.nodeType = v.nodeType;
  for (const handleKey of ["handleIn", "handleOut"]) {
    const handle = v[handleKey];
    if (handle === undefined) continue;
    if (!handle || typeof handle !== "object" || Array.isArray(handle)) throw new Error(`point.${handleKey} must be an object`);
    const h = handle as Record<string, unknown>;
    for (const sub of Object.keys(h)) {
      if (sub !== "x" && sub !== "y") throw new Error(`unexpected point.${handleKey} field: ${sub}`);
    }
    if (!isFiniteNumber(h.x) || h.x < -100_000 || h.x > 100_000) throw new Error(`point.${handleKey}.x must be in [-100000, 100000]`);
    if (!isFiniteNumber(h.y) || h.y < -100_000 || h.y > 100_000) throw new Error(`point.${handleKey}.y must be in [-100000, 100000]`);
    point[handleKey] = { x: h.x, y: h.y };
  }
  return point as unknown as CanvasPoint;
}

function parseAddElement(value: unknown): CanvasAddElementSpec {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("element must be an object");
  const v = value as Record<string, unknown>;
  // Strict keys: only the additive subset is permitted.
  for (const key of Object.keys(v)) {
    if (!ADD_ELEMENT_ALLOWED_KEYS.has(key)) throw new Error(`unexpected element field: ${key}`);
  }
  if (!isBoundedIdString(v.id)) throw new Error("element id must be a bounded id string");
  if (!ADD_ELEMENT_TYPES.has(v.type as string)) throw new Error("element type must be one of rectangle, ellipse, line, arrow, path, text");
  for (const key of ["x", "y", "width", "height"]) {
    if (!isFiniteNumber(v[key])) throw new Error(`element.${key} must be a finite number`);
  }
  if ((v.width as number) <= 0 || (v.height as number) <= 0) throw new Error("element width and height must be positive");
  if (typeof v.color !== "string" || v.color.length === 0 || v.color.length > ADD_ELEMENT_STRING_MAX.color) throw new Error("element color must be a nonempty string of bounded length");
  const spec: Record<string, unknown> = {
    id: v.id,
    type: v.type,
    x: v.x,
    y: v.y,
    width: v.width,
    height: v.height,
    color: v.color,
  };
  const setBoundedString = (key: string, max: number): void => {
    const value = v[key];
    if (value === undefined) return;
    if (typeof value !== "string" || value.length === 0 || value.length > max) throw new Error(`element.${key} must be a nonempty string of length <= ${max}`);
    spec[key] = value;
  };
  setBoundedString("name", ADD_ELEMENT_STRING_MAX.name);
  setBoundedString("strokeColor", ADD_ELEMENT_STRING_MAX.strokeColor);
  setBoundedString("fontFamily", ADD_ELEMENT_STRING_MAX.fontFamily);
  for (const key of ["rotation", "opacity", "radius", "strokeWidth", "strokeDash", "fontSize", "lineHeight", "letterSpacing", "fontWeight"] as const) {
    const value = v[key];
    if (value === undefined) continue;
    if (!isFiniteNumber(value)) throw new Error(`element.${key} must be a finite number`);
    if (key === "opacity" && (value < 0 || value > 1)) throw new Error("element.opacity must be in [0,1]");
    if (["radius", "strokeWidth", "strokeDash", "fontSize", "lineHeight"].includes(key) && (value < 0 || value > 100_000)) throw new Error(`element.${key} must be in [0, 100000]`);
    spec[key] = value;
  }
  if (v.radius !== undefined && v.type !== "rectangle") throw new Error("radius is only valid on rectangle");
  const type = v.type as CanvasAddElementSpec["type"];
  for (const key of ["text", "fontSize", "fontFamily", "fontWeight", "textAlign", "lineHeight", "letterSpacing"] as const) {
    if (v[key] !== undefined && type !== "text") throw new Error(`${key} is only valid on text elements`);
  }
  if (v.text !== undefined) setBoundedString("text", ADD_ELEMENT_STRING_MAX.text);
  if (v.textAlign !== undefined) {
    if (v.textAlign !== "left" && v.textAlign !== "center" && v.textAlign !== "right") throw new Error("element.textAlign must be left|center|right");
    spec.textAlign = v.textAlign;
  }
  if (v.points !== undefined) {
    if (type !== "path" && type !== "line" && type !== "arrow") throw new Error("points are only valid on path, line, or arrow");
    if (!Array.isArray(v.points) || v.points.length < 2 || v.points.length > CANVAS_COMMAND_MAX_ADD_POINTS) throw new Error(`points must be an array of 2..${CANVAS_COMMAND_MAX_ADD_POINTS} points`);
    spec.points = v.points.map(parseAddPoint);
  } else if (type === "path" || type === "line" || type === "arrow") {
    throw new Error(`${type} requires points`);
  }
  if (v.pathClosed !== undefined) {
    if (typeof v.pathClosed !== "boolean") throw new Error("pathClosed must be a boolean");
    if (type !== "path") throw new Error("pathClosed is only valid on path elements");
    spec.pathClosed = v.pathClosed;
  }
  if (v.pathSmoothing !== undefined) {
    if (!isFiniteNumber(v.pathSmoothing) || v.pathSmoothing < 0 || v.pathSmoothing > 1) throw new Error("pathSmoothing must be in [0,1]");
    if (type !== "path" && type !== "line" && type !== "arrow") throw new Error("pathSmoothing is only valid on path, line, or arrow");
    spec.pathSmoothing = v.pathSmoothing;
  }
  for (const capKey of ["startCap", "endCap"] as const) {
    const value = v[capKey];
    if (value === undefined) continue;
    if (value !== "none" && value !== "arrow" && value !== "round") throw new Error(`element.${capKey} must be none|arrow|round`);
    if (type !== "path" && type !== "line" && type !== "arrow") throw new Error(`${capKey} is only valid on path, line, or arrow`);
    spec[capKey] = value;
  }
  return spec as unknown as CanvasAddElementSpec;
}

/** Parses untrusted JSON into a CanvasCommandGroup, or returns null if invalid. */
export function parseCanvasCommandGroup(value: unknown): CanvasCommandGroup | null {
  try {
    // Reject oversized payloads up front so a huge blob cannot exhaust the
    // parser. The ceiling is enforced as UTF-8 bytes (not JS string code-unit
    // length) so a multibyte payload whose .length is below the bound but whose
    // encoded size exceeds it is still rejected.
    try {
      const payloadBytes = utf8ByteLength(value);
      if (payloadBytes > CANVAS_COMMAND_MAX_PAYLOAD_BYTES) return null;
    } catch {
      return null;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const v = value as Record<string, unknown>;
    // Envelope level: only pageId, selectionIds, commands are permitted.
    for (const key of Object.keys(v)) {
      if (key !== "pageId" && key !== "selectionIds" && key !== "commands") return null;
    }
    if (!isBoundedIdString(v.pageId)) return null;
    // selectionIds may be empty (for additive no-selection runs) or a bounded
    // array of bounded id strings.
    if (!Array.isArray(v.selectionIds) || v.selectionIds.length > CANVAS_COMMAND_MAX_SELECTION) return null;
    if (!v.selectionIds.every((item) => isBoundedIdString(item))) return null;
    if (new Set(v.selectionIds).size !== v.selectionIds.length) return null;
    if (!Array.isArray(v.commands) || v.commands.length === 0 || v.commands.length > CANVAS_COMMAND_MAX_GROUP_SIZE) return null;
    const commands: CanvasCommand[] = [];
    for (const raw of v.commands) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      const c = raw as Record<string, unknown>;
      switch (c.type) {
        case "patch-elements": {
          // Command-level strict keys: type, elementIds, patch only.
          for (const key of Object.keys(c)) {
            if (key !== "type" && key !== "elementIds" && key !== "patch") return null;
          }
          if (!isStringArray(c.elementIds, CANVAS_COMMAND_MAX_SELECTION)) return null;
          if (new Set(c.elementIds).size !== c.elementIds.length) return null;
          const patch = parsePatchFields(c.patch);
          commands.push({ type: "patch-elements", elementIds: c.elementIds, patch });
          break;
        }
        case "add-interaction": {
          // Command-level strict keys: type, elementId, interaction only.
          // insertIndex is internal-only (inverse metadata) and rejected here.
          for (const key of Object.keys(c)) {
            if (key !== "type" && key !== "elementId" && key !== "interaction" && key !== "insertIndex") return null;
            if (key === "insertIndex") return null;
          }
          if (!isBoundedIdString(c.elementId)) return null;
          const interaction = parseInteraction(c.interaction);
          commands.push({ type: "add-interaction", elementId: c.elementId, interaction });
          break;
        }
        case "patch-interaction": {
          // Command-level strict keys: type, elementId, interactionId, patch only.
          // restoreInteraction is internal-only (inverse metadata) and rejected here.
          for (const key of Object.keys(c)) {
            if (key !== "type" && key !== "elementId" && key !== "interactionId" && key !== "patch" && key !== "restoreInteraction") return null;
            if (key === "restoreInteraction") return null;
          }
          if (!isBoundedIdString(c.elementId)) return null;
          if (!isBoundedIdString(c.interactionId)) return null;
          if (!c.patch || typeof c.patch !== "object" || Array.isArray(c.patch)) return null;
          const patchRaw = c.patch as Record<string, unknown>;
          const keys = Object.keys(patchRaw);
          if (keys.length === 0) return null;
          const patch: Partial<Omit<CanvasPrototypeInteraction, "id">> = {};
          for (const key of keys) {
            if (key === "id") return null;
            if (key !== "trigger" && key !== "action" && key !== "delay" && key !== "destinationPageId" && key !== "url" && key !== "transition" && key !== "overlay") return null;
          }
          // trigger/action are required-shaped fields: null is not permitted (only
          // the optional action-specific fields destinationPageId/url/delay/transition/overlay
          // may be null to mean delete/clear the field).
          if (patchRaw.trigger !== undefined && patchRaw.trigger !== null && !RECOGNIZED_TRIGGERS.has(patchRaw.trigger as CanvasPrototypeTrigger)) return null;
          if (patchRaw.trigger === null) return null;
          if (patchRaw.action !== undefined && patchRaw.action !== null && !RECOGNIZED_ACTIONS.has(patchRaw.action as CanvasPrototypeAction)) return null;
          if (patchRaw.action === null) return null;
          if (patchRaw.delay !== undefined && patchRaw.delay !== null && (!isFiniteNumber(patchRaw.delay) || patchRaw.delay < 0 || patchRaw.delay > 60_000)) return null;
          if (patchRaw.destinationPageId !== undefined && patchRaw.destinationPageId !== null && !isBoundedIdString(patchRaw.destinationPageId)) return null;
          if (patchRaw.url !== undefined && patchRaw.url !== null && !isSafePrototypeUrl(patchRaw.url)) return null;
          // Validate transition in the merged action context (smart/direction depend on action).
          const mergedAction = patchRaw.action !== undefined && patchRaw.action !== null ? patchRaw.action as CanvasPrototypeAction : undefined;
          const transition = parseTransition(patchRaw.transition, mergedAction);
          const overlay = parseOverlay(patchRaw.overlay);
          if (patchRaw.trigger !== undefined) (patch as Record<string, unknown>).trigger = patchRaw.trigger;
          if (patchRaw.action !== undefined) (patch as Record<string, unknown>).action = patchRaw.action;
          if (patchRaw.delay !== undefined) (patch as Record<string, unknown>).delay = patchRaw.delay;
          if (patchRaw.destinationPageId !== undefined) (patch as Record<string, unknown>).destinationPageId = patchRaw.destinationPageId;
          if (patchRaw.url !== undefined) (patch as Record<string, unknown>).url = patchRaw.url;
          if (transition !== undefined) (patch as Record<string, unknown>).transition = transition;
          if (overlay !== undefined) (patch as Record<string, unknown>).overlay = overlay;
          commands.push({ type: "patch-interaction", elementId: c.elementId, interactionId: c.interactionId, patch });
          break;
        }
        case "remove-interaction": {
          // Command-level strict keys: type, elementId, interactionId only.
          // restoreEmptyList is internal-only (inverse metadata) and rejected here.
          for (const key of Object.keys(c)) {
            if (key !== "type" && key !== "elementId" && key !== "interactionId" && key !== "restoreEmptyList") return null;
            if (key === "restoreEmptyList") return null;
          }
          if (!isBoundedIdString(c.elementId)) return null;
          if (!isBoundedIdString(c.interactionId)) return null;
          commands.push({ type: "remove-interaction", elementId: c.elementId, interactionId: c.interactionId });
          break;
        }
        case "add-elements": {
          // Command-level strict keys: type, elements only.
          for (const key of Object.keys(c)) {
            if (key !== "type" && key !== "elements") return null;
          }
          if (!Array.isArray(c.elements) || c.elements.length === 0 || c.elements.length > CANVAS_COMMAND_MAX_ADD_ELEMENTS) return null;
          const elements: CanvasAddElementSpec[] = [];
          for (const raw of c.elements) {
            elements.push(parseAddElement(raw));
          }
          commands.push({ type: "add-elements", elements });
          break;
        }
        case "remove-elements": {
          // Internal inverse-only command: the untrusted parser rejects it so an
          // agent cannot patch/remove existing elements via additive no-selection runs.
          return null;
        }
        default:
          return null;
      }
    }
    return { pageId: v.pageId, selectionIds: v.selectionIds, commands };
  } catch {
    return null;
  }
}