import { createRoot, type Root } from "react-dom/client";
import { PomodoroSidebar } from "./PomodoroSidebar";
import { PomodoroContent } from "./PomodoroContent";

// ── Generic React web-component base ─────────────────────────────────

class ReactWebComponent extends HTMLElement {
  protected root: Root | null = null;

  connectedCallback() {
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

// ── <khadim-pomodoro-sidebar> ─────────────────────────────────────────

class KhadimPomodoroSidebar extends ReactWebComponent {
  protected renderApp() {
    this.root?.render(<PomodoroSidebar />);
  }
}

// ── <khadim-pomodoro-content> ─────────────────────────────────────────

class KhadimPomodoroContent extends ReactWebComponent {
  protected renderApp() {
    this.root?.render(<PomodoroContent />);
  }
}

// ── Register ──────────────────────────────────────────────────────────

if (!customElements.get("khadim-pomodoro-sidebar")) {
  customElements.define("khadim-pomodoro-sidebar", KhadimPomodoroSidebar);
}

if (!customElements.get("khadim-pomodoro-content")) {
  customElements.define("khadim-pomodoro-content", KhadimPomodoroContent);
}
