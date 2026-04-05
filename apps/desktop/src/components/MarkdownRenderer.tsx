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

  // Inline code — defer to .prose-gb code styles
  return (
    <code className={className} {...props}>
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
export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`prose-gb ${className}`.trim()}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock as any,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
