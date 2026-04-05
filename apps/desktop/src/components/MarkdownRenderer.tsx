import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";

const COPY_RESET_DELAY = 2000;

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

type CodeBlockProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  className?: string;
  children?: ReactNode;
};

function CodeBlock({ inline, className, children, ...props }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const codeString = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_RESET_DELAY);
  };

  if (!inline && (match || codeString.includes("\n"))) {
    return (
      <div className="relative group my-2 -mx-1">
        <div className="overflow-x-auto rounded-2xl border border-[var(--glass-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="absolute top-0 right-0 flex items-center gap-2 px-3 py-1.5 text-[10px] z-10">
            {language && <span className="text-[var(--text-muted)] uppercase font-medium">{language}</span>}
            <button
              onClick={handleCopy}
              className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] sm:opacity-0 sm:group-hover:opacity-100"
              title="Copy code"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <SyntaxHighlighter
            style={oneDark as any}
            language={language || "text"}
            PreTag="div"
            customStyle={{
              margin: 0,
              borderRadius: "1rem",
              fontSize: "0.8rem",
              padding: "1rem",
              paddingTop: "2rem",
              fontFamily: "var(--font-mono)",
              background: "var(--log-bg)",
            }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </div>
      </div>
    );
  }

  // Inline code
  return (
    <code
      className="bg-[var(--surface-card)] border border-[var(--glass-border)] px-1.5 py-0.5 rounded-md font-mono text-[0.85em] text-[var(--text-primary)] break-words"
      {...props}
    >
      {children}
    </code>
  );
}

/**
 * Renders markdown content using react-markdown with GFM support and syntax
 * highlighting. Relies on the existing `.prose-gb` styles in styles.css for
 * base element styling; only the fenced code block gets custom treatment
 * (syntax highlighting + copy button).
 */

const remarkPlugins = [remarkGfm];

const markdownComponents = {
  code: CodeBlock as any,
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-xl font-bold mt-6 mb-3 text-[var(--text-primary)] border-b border-[var(--glass-border)] pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="text-lg font-semibold mt-5 mb-2 text-[var(--text-primary)]">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="text-base font-semibold mt-4 mb-2 text-[var(--text-primary)]">
      {children}
    </h3>
  ),
  h4: ({ children }: { children?: ReactNode }) => (
    <h4 className="text-sm font-semibold mt-3 mb-1.5 text-[var(--text-primary)]">
      {children}
    </h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li className="leading-relaxed pl-0.5">{children}</li>
  ),
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--color-accent)] underline underline-offset-2 decoration-[var(--color-accent-muted)] hover:text-[var(--color-accent-hover)] hover:decoration-[var(--color-accent)] transition-colors"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="border-l-3 border-[var(--color-accent)] pl-4 my-3 italic text-[var(--text-secondary)]">
      {children}
    </blockquote>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto my-4 rounded-xl border border-[var(--glass-border)]" style={{ WebkitOverflowScrolling: "touch" }}>
      <table className="w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }: { children?: ReactNode }) => (
    <thead className="bg-[var(--surface-card)]">{children}</thead>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border-b border-[var(--glass-border)] px-3 py-2 text-left font-semibold text-xs uppercase tracking-wide text-[var(--text-secondary)]">
      {children}
    </th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border-b border-[var(--glass-border)] px-3 py-2 text-sm">
      {children}
    </td>
  ),
  hr: () => (
    <hr className="my-6 border-none h-px bg-[var(--glass-border)]" />
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  del: ({ children }: { children?: ReactNode }) => (
    <del className="line-through text-[var(--text-muted)]">{children}</del>
  ),
};

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose-gb ${className}`.trim()}>
      <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {content}
      </Markdown>
    </div>
  );
}
