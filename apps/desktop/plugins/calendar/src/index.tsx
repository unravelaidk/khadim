import { createRoot, type Root } from "react-dom/client";
import { CalendarSidebar } from "./CalendarSidebar";
import { CalendarContent } from "./CalendarContent";

// ── Generic React web-component base ─────────────────────────────────

class ReactWebComponent extends HTMLElement {
  protected root: Root | null = null;

  connectedCallback() {
    // Use flex so children that rely on flex-grow work correctly.
    // Never use height:100% — it doesn't resolve when the parent's
    // height comes from a flex algorithm (the % has no definite base).
    this.style.cssText =
      "display:flex;flex-direction:column;flex:1;min-height:0;width:100%;";
    this.root = createRoot(this);
    this.renderApp();
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }

  protected renderApp(): void {}
}

// ── <khadim-calendar-sidebar> ─────────────────────────────────────────

class KhadimCalendarSidebar extends ReactWebComponent {
  protected renderApp() {
    this.root?.render(<CalendarSidebar />);
  }
}

// ── <khadim-calendar-content> ─────────────────────────────────────────

class KhadimCalendarContent extends ReactWebComponent {
  protected renderApp() {
    this.root?.render(<CalendarContent />);
  }
}

// ── Register ──────────────────────────────────────────────────────────

if (!customElements.get("khadim-calendar-sidebar")) {
  customElements.define("khadim-calendar-sidebar", KhadimCalendarSidebar);
}

if (!customElements.get("khadim-calendar-content")) {
  customElements.define("khadim-calendar-content", KhadimCalendarContent);
}
