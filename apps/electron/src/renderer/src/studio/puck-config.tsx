import type { Config, Slot } from "@puckeditor/core";

type Tone = "canvas" | "muted" | "accent";
type Space = "compact" | "regular" | "generous";
type Gap = "small" | "medium" | "large";

export type StudioComponents = {
  Navigation: { brand: string; links: string };
  Section: { tone: Tone; space: Space; content: Slot };
  Stack: { gap: Gap; align: "start" | "center"; content: Slot };
  Columns: { ratio: "equal" | "wide-left" | "wide-right"; gap: Gap; left: Slot; right: Slot };
  Eyebrow: { text: string };
  Heading: { text: string };
  Text: { text: string };
  Button: { label: string; href: string; style: "primary" | "secondary" };
  Image: { src: string; alt: string; aspect: "landscape" | "square" | "portrait" };
  Card: { title: string; text: string; linkLabel: string; href: string };
  Spacer: { size: Gap };
};

function linkLabels(value: unknown): string[] {
  return (typeof value === "string" ? value : "Work, About, Contact").split(",").map((label) => label.trim()).filter(Boolean).slice(0, 5);
}

export const puckConfig: Config<StudioComponents> = {
  categories: {
    layout: { title: "Layout", components: ["Section", "Stack", "Columns", "Spacer"], defaultExpanded: true },
    content: { title: "Content", components: ["Eyebrow", "Heading", "Text", "Image", "Card"], defaultExpanded: true },
    actions: { title: "Actions", components: ["Navigation", "Button"], defaultExpanded: true },
  },
  root: { render: ({ children }) => <main className="page-shell">{children}</main> },
  components: {
    Navigation: {
      label: "Navigation",
      fields: {
        brand: { type: "text", label: "Brand", contentEditable: true },
        links: { type: "text", label: "Links" },
      },
      defaultProps: { brand: "Khadim", links: "Work, About, Contact" },
      render: ({ brand, links }) => <nav className="site-navigation"><a className="site-brand" href="#">{brand}</a><div className="site-links">{linkLabels(links).map((label) => <a key={label} href={`#${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</a>)}</div></nav>,
    },
    Section: {
      label: "Section",
      fields: {
        tone: { type: "select", label: "Tone", options: [{ label: "Canvas", value: "canvas" }, { label: "Muted", value: "muted" }, { label: "Accent", value: "accent" }] },
        space: { type: "select", label: "Spacing", options: [{ label: "Compact", value: "compact" }, { label: "Regular", value: "regular" }, { label: "Generous", value: "generous" }] },
        content: { type: "slot" },
      },
      defaultProps: { tone: "canvas", space: "regular", content: [] },
      render: ({ tone, space: spacing, content: Content }) => <section className={`site-section tone-${tone} space-${spacing}`}><Content className="section-inner" /></section>,
    },
    Stack: {
      label: "Stack",
      fields: {
        gap: { type: "select", label: "Gap", options: [{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }] },
        align: { type: "radio", label: "Alignment", options: [{ label: "Start", value: "start" }, { label: "Center", value: "center" }] },
        content: { type: "slot" },
      },
      defaultProps: { gap: "medium", align: "start", content: [] },
      render: ({ gap, align, content: Content }) => <Content className={`site-stack gap-${gap} align-${align}`} />,
    },
    Columns: {
      label: "Columns",
      fields: {
        ratio: { type: "select", label: "Ratio", options: [{ label: "Equal", value: "equal" }, { label: "Wide left", value: "wide-left" }, { label: "Wide right", value: "wide-right" }] },
        gap: { type: "select", label: "Gap", options: [{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }] },
        left: { type: "slot" },
        right: { type: "slot" },
      },
      defaultProps: { ratio: "equal", gap: "large", left: [], right: [] },
      render: ({ ratio, gap, left: Left, right: Right }) => <div className={`site-columns ratio-${ratio} gap-${gap}`}><div><Left /></div><div><Right /></div></div>,
    },
    Eyebrow: {
      label: "Eyebrow",
      fields: { text: { type: "text", label: "Text", contentEditable: true } },
      defaultProps: { text: "Created in Khadim Studio" },
      render: ({ text }) => <p className="eyebrow">{text}</p>,
    },
    Heading: {
      label: "Heading",
      fields: { text: { type: "textarea", label: "Heading", contentEditable: true } },
      defaultProps: { text: "Build the page beside the conversation." },
      render: ({ text }) => <h1>{text}</h1>,
    },
    Text: {
      label: "Paragraph",
      fields: { text: { type: "textarea", label: "Text", contentEditable: true } },
      defaultProps: { text: "Edit visually, work in source, and keep the preview close." },
      render: ({ text }) => <p className="lede">{text}</p>,
    },
    Button: {
      label: "Button",
      fields: {
        label: { type: "text", label: "Label", contentEditable: true },
        href: { type: "text", label: "Link" },
        style: { type: "radio", label: "Style", options: [{ label: "Primary", value: "primary" }, { label: "Secondary", value: "secondary" }] },
      },
      defaultProps: { label: "Continue", href: "#", style: "primary" },
      render: ({ label, href, style }) => <a className={`studio-button ${style}`} href={href}>{label}</a>,
    },
    Image: {
      label: "Image",
      fields: {
        src: { type: "text", label: "Image URL" },
        alt: { type: "text", label: "Description" },
        aspect: { type: "select", label: "Aspect", options: [{ label: "Landscape", value: "landscape" }, { label: "Square", value: "square" }, { label: "Portrait", value: "portrait" }] },
      },
      defaultProps: { src: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1200&q=80", alt: "A bright collaborative workspace", aspect: "landscape" },
      render: ({ src, alt, aspect }) => <img className={`site-image aspect-${aspect}`} src={src} alt={alt} />,
    },
    Card: {
      label: "Card",
      fields: {
        title: { type: "text", label: "Title", contentEditable: true },
        text: { type: "textarea", label: "Text", contentEditable: true },
        linkLabel: { type: "text", label: "Link label", contentEditable: true },
        href: { type: "text", label: "Link" },
      },
      defaultProps: { title: "A focused capability", text: "Explain the value in one clear, useful paragraph.", linkLabel: "Learn more", href: "#" },
      render: ({ title, text, linkLabel, href }) => <article className="site-card"><h2>{title}</h2><p>{text}</p><a href={href}>{linkLabel} →</a></article>,
    },
    Spacer: {
      label: "Spacer",
      fields: { size: { type: "select", label: "Size", options: [{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }] } },
      defaultProps: { size: "medium" },
      render: ({ size }) => <div className={`site-spacer size-${size}`} aria-hidden="true" />,
    },
  },
};
