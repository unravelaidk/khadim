import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/cjs/styles/prism";
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
      <div className="relative group my-3">
        <div className="absolute top-0 right-0 flex items-center gap-2 px-3 py-1.5 text-xs">
          {language && <span className="text-gray-400 uppercase font-medium">{language}</span>}
          <button
            onClick={handleCopy}
            className="text-gray-400 transition-colors hover:text-white sm:opacity-0 sm:group-hover:opacity-100"
            title="Copy code"
          >
            {copied ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            borderRadius: "0.75rem",
            fontSize: "0.875rem",
            padding: "1rem",
            paddingTop: "2rem",
            fontFamily: "var(--font-mono)",
          }}
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code
      className="bg-[var(--surface-card)] border border-[var(--glass-border)] px-1.5 py-0.5 rounded-md font-mono text-[0.9em] text-[var(--text-primary)]"
      {...props}
    >
      {children}
    </code>
  );
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`markdown-content ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: CodeBlock as any,
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-6 mb-3 text-[var(--text-primary)] border-b border-[var(--glass-border)] pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-5 mb-2 text-[var(--text-primary)]">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-2 text-[var(--text-primary)]">{children}</h3>
          ),
          p: ({ children }) => <p className="mb-3 leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1 ml-2">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1 ml-2">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-primary)] underline underline-offset-2 hover:text-[var(--text-secondary)]"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#10150a] pl-4 my-3 italic text-[var(--text-secondary)]">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full border-collapse border border-[var(--glass-border)] rounded-xl overflow-hidden">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[var(--glass-bg)]">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--glass-border)] px-3 py-2 text-left font-semibold text-sm">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--glass-border)] px-3 py-2 text-sm">{children}</td>
          ),
          hr: () => <hr className="my-6 border-t border-[var(--glass-border)]" />,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="line-through text-[var(--text-muted)]">{children}</del>,
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
