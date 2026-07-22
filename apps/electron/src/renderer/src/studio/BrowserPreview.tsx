import {
  ArrowClockwise,
  ArrowSquareOut,
  ArrowsOutSimple,
  DeviceMobile,
  DeviceTablet,
  GlobeSimple,
  Monitor,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type PreviewSize = "fit" | "desktop" | "tablet" | "mobile";

const previewSizes = {
  desktop: { label: "Desktop", width: 1440, height: 900 },
  tablet: { label: "Tablet", width: 834, height: 1112 },
  mobile: { label: "Mobile", width: 390, height: 844 },
} as const;

export interface ExecutablePreviewState {
  status: "starting" | "ready" | "error";
  url?: string;
  error?: string;
}

export interface BrowserPreviewProps {
  title: string;
  html: string;
  runtime?: ExecutablePreviewState;
  onOpenSource?: () => void;
}

export function calculatePreviewScale(availableWidth: number, viewportWidth: number): number {
  return Math.min(1, availableWidth / viewportWidth);
}

function externalPreviewUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function previewAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export function BrowserPreview({ title, html, runtime, onOpenSource }: BrowserPreviewProps): React.JSX.Element {
  const [size, setSize] = useState<PreviewSize>("fit");
  const [scale, setScale] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dimensions = size === "fit" ? null : previewSizes[size];
  const openableUrl = externalPreviewUrl(runtime?.url);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dimensions) {
      setScale(1);
      return;
    }
    const resize = (): void => {
      setScale(calculatePreviewScale(Math.max(1, canvas.clientWidth - 28), dimensions.width));
    };
    resize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [dimensions]);

  const sizeLabel = dimensions ? `${dimensions.label} · ${dimensions.width} × ${dimensions.height}` : "Responsive · Fit";

  const viewport = (
    <div
      className={`browser-preview-viewport ${dimensions ? "fixed-preview" : "fit-preview"}`}
      style={dimensions ? { width: dimensions.width, height: dimensions.height, transform: `scale(${scale})` } : undefined}
    >
      {runtime?.status === "starting" && !runtime.url ? (
        <div className="browser-preview-state" role="status"><span className="activity-spinner" /><strong>Starting preview…</strong><small>Preparing your website.</small></div>
      ) : runtime?.url ? (
        <iframe key={`${runtime.url}:${reloadKey}`} title={`${title} preview`} src={runtime.url} sandbox="allow-scripts allow-same-origin allow-forms allow-modals" referrerPolicy="no-referrer" />
      ) : runtime?.status === "error" ? (
        <div className="browser-preview-state error" role="alert"><strong>Preview could not start</strong><small>{runtime.error}</small>{onOpenSource && <button type="button" onClick={onOpenSource}>Open source</button>}</div>
      ) : (
        <iframe key={`static:${reloadKey}`} title={`${title} preview`} srcDoc={html} sandbox="" />
      )}
      {runtime?.status === "error" && runtime.url && (
        <div className="browser-preview-error" role="alert">
          <div><strong>Latest changes couldn’t be shown</strong><small>{runtime.error?.split("\n")[0]}</small></div>
          {onOpenSource && <button type="button" onClick={onOpenSource}>Open source</button>}
        </div>
      )}
    </div>
  );

  return (
    <main className="site-stage">
      <section className="browser-frame" aria-label={`${title} browser preview`}>
        <header className="browser-frame-bar">
          <span className="browser-dots" aria-hidden="true"><i /><i /><i /></span>
          <button type="button" className="browser-reload" aria-label="Reload preview" title="Reload preview" onClick={() => setReloadKey((current) => current + 1)}><ArrowClockwise size={14} /></button>
          {openableUrl ? (
            <button type="button" className="browser-address" aria-label="Open preview in browser" title={openableUrl} onClick={() => void window.khadim.shell.openExternal(openableUrl)}>
              <GlobeSimple size={13} weight="bold" /><span>{previewAddress(openableUrl)}</span><ArrowSquareOut className="browser-address-open" size={12} weight="bold" />
            </button>
          ) : (
            <span className="browser-address" title={runtime?.url ?? title}><GlobeSimple size={13} /><span>{runtime?.url ? previewAddress(runtime.url) : title}</span></span>
          )}
          <div className="browser-preview-controls" role="toolbar" aria-label="Preview size">
            <button type="button" className={size === "fit" ? "active" : ""} aria-label="Fit preview" aria-pressed={size === "fit"} title="Responsive fit" onClick={() => setSize("fit")}><ArrowsOutSimple size={15} /></button>
            <button type="button" className={size === "desktop" ? "active" : ""} aria-label="Desktop 1440 × 900" aria-pressed={size === "desktop"} title="Desktop 1440 × 900" onClick={() => setSize("desktop")}><Monitor size={15} /></button>
            <button type="button" className={size === "tablet" ? "active" : ""} aria-label="Tablet 834 × 1112" aria-pressed={size === "tablet"} title="Tablet 834 × 1112" onClick={() => setSize("tablet")}><DeviceTablet size={15} /></button>
            <button type="button" className={size === "mobile" ? "active" : ""} aria-label="Mobile 390 × 844" aria-pressed={size === "mobile"} title="Mobile 390 × 844" onClick={() => setSize("mobile")}><DeviceMobile size={15} /></button>
          </div>
          <span className={`browser-preview-status ${runtime?.status ?? "static"}`} aria-live="polite">
            {runtime?.status === "starting" && runtime.url && <span className="activity-spinner" />}
            <span>{runtime?.status === "error" && runtime.url ? "Previous preview" : runtime?.status === "starting" && runtime.url ? "Updating" : sizeLabel}</span>
            {dimensions && runtime?.status !== "error" && !(runtime?.status === "starting" && runtime.url) && <small>{Math.round(scale * 100)}%</small>}
          </span>
        </header>
        <div className={`artifact-preview-canvas ${dimensions ? "device-preview" : "responsive-preview"}`} ref={canvasRef}>
          {dimensions
            ? <div className="fixed-preview-shell" style={{ width: dimensions.width * scale, height: dimensions.height * scale }}>{viewport}</div>
            : viewport}
        </div>
      </section>
    </main>
  );
}
