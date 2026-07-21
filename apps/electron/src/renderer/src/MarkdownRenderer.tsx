import { Check, Copy } from "@phosphor-icons/react";
import { memo, useState, type HTMLAttributes, type ReactNode } from "react";
import Markdown from "react-markdown";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import diff from "react-syntax-highlighter/dist/esm/languages/prism/diff";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";

const languages = { bash, css, diff, javascript, json, jsx, markdown, markup, python, rust, sql, tsx, typescript, yaml };
for (const [name, grammar] of Object.entries(languages)) SyntaxHighlighter.registerLanguage(name, grammar);

const languageAliases: Record<string, keyof typeof languages> = {
  sh: "bash",
  shell: "bash",
  js: "javascript",
  md: "markdown",
  html: "markup",
  xml: "markup",
  py: "python",
  rs: "rust",
  ts: "typescript",
  yml: "yaml",
};

interface MarkdownRendererProps {
  content: string;
  streaming?: boolean;
}

type CodeProps = HTMLAttributes<HTMLElement> & {
  inline?: boolean;
  children?: ReactNode;
};

function healStreamingMarkdown(content: string): string {
  const fence = content.match(/^[ \t]{0,3}(`{3,}|~{3,})(.*)$/m);
  if (!fence?.[1]) return content.replace(/(?:^|\n)(#{1,6})\s*$/, "$1 ");
  const marker = fence[1];
  const afterOpening = content.slice((fence.index ?? 0) + fence[0].length);
  const closing = new RegExp(`^[\\t ]{0,3}${marker[0]}{${marker.length},}[\\t ]*$`, "m");
  return closing.test(afterOpening) ? content : `${content}\n${marker}`;
}

function CodeBlock({ inline, className, children, streaming, ...props }: CodeProps & { streaming: boolean }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const language = /language-([^\s]+)/.exec(className ?? "")?.[1] ?? "";
  const normalizedLanguage = languageAliases[language.toLowerCase()] ?? language.toLowerCase();
  const highlightedLanguage = normalizedLanguage in languages ? normalizedLanguage : undefined;
  const rawCode = String(children);
  const code = rawCode.replace(/\n$/, "");
  const isBlock = !inline && (Boolean(language) || rawCode.endsWith("\n") || code.includes("\n"));

  if (!isBlock) {
    return <code className="md-inline-code" {...props}>{children}</code>;
  }

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const input = document.createElement("textarea");
      input.value = code;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="md-code-block">
      <div className="md-code-header">
        <span>{language || "text"}</span>
        <button onClick={() => void copyCode()} aria-label={copied ? "Code copied" : "Copy code"} title={copied ? "Copied" : "Copy code"}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {streaming ? (
        <pre><code>{code}</code></pre>
      ) : (
        <SyntaxHighlighter
          language={highlightedLanguage}
          style={oneDark}
          PreTag="div"
          customStyle={{ margin: 0, padding: "14px 16px 16px", background: "transparent", fontFamily: "var(--font-code)", fontSize: "12px", lineHeight: 1.65 }}
          codeTagProps={{ style: { fontFamily: "inherit" } }}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  );
}

function MarkdownRendererComponent({ content, streaming = false }: MarkdownRendererProps): React.JSX.Element {
  const renderedContent = streaming ? healStreamingMarkdown(content) : content;
  return (
    <div className="markdown-content">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ node: _node, ...props }) => <CodeBlock {...props} streaming={streaming} />,
          a: ({ href, children }) => <button className="md-link" onClick={() => href && void window.khadim.shell.openExternal(href)}>{children}</button>,
          table: ({ children }) => <div className="md-table-wrap"><table>{children}</table></div>,
          input: ({ node: _node, ...props }) => <input {...props} tabIndex={-1} />,
          img: ({ src, alt }) => <img className="md-image" src={src} alt={alt ?? ""} loading="lazy" />,
        }}
      >
        {renderedContent}
      </Markdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererComponent);
