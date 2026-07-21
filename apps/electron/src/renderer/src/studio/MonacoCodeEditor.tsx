import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  },
};
loader.config({ monaco });

function configureKhadimThemes(instance: typeof monaco): void {
  instance.editor.defineTheme("khadim-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "80878D", fontStyle: "italic" },
      { token: "keyword", foreground: "8FAEFF" },
      { token: "string", foreground: "9CC7A4" },
      { token: "number", foreground: "D8AB82" },
      { token: "tag", foreground: "8FAEFF" },
    ],
    colors: {
      "editor.background": "#151718",
      "editor.foreground": "#E8EAE8",
      "editorLineNumber.foreground": "#62676B",
      "editorLineNumber.activeForeground": "#B5BAB7",
      "editor.lineHighlightBackground": "#1C1F20",
      "editor.selectionBackground": "#29477A",
      "editor.inactiveSelectionBackground": "#24344D",
      "editorCursor.foreground": "#7DA2FF",
      "editorIndentGuide.background1": "#2A2E30",
      "editorIndentGuide.activeBackground1": "#454B4E",
      "editorGutter.background": "#151718",
      "editorWidget.background": "#202325",
      "editorWidget.border": "#34383A",
      "focusBorder": "#6692FF",
    },
  });
  instance.editor.defineTheme("khadim-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "747A76", fontStyle: "italic" },
      { token: "keyword", foreground: "315FC9" },
      { token: "string", foreground: "347344" },
      { token: "number", foreground: "98622F" },
      { token: "tag", foreground: "315FC9" },
    ],
    colors: {
      "editor.background": "#F7F7F5",
      "editor.foreground": "#242628",
      "editorLineNumber.foreground": "#9A9F9B",
      "editorLineNumber.activeForeground": "#555B57",
      "editor.lineHighlightBackground": "#F0F1EE",
      "editor.selectionBackground": "#D8E4FF",
      "editor.inactiveSelectionBackground": "#E7ECF7",
      "editorCursor.foreground": "#3769E8",
      "editorIndentGuide.background1": "#E1E3DF",
      "editorIndentGuide.activeBackground1": "#BEC2BD",
      "editorGutter.background": "#F7F7F5",
      "editorWidget.background": "#FFFFFF",
      "editorWidget.border": "#D7DAD6",
      "focusBorder": "#3769E8",
    },
  });
}

function languageForPath(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "tsx" || extension === "ts") return "typescript";
  if (extension === "jsx" || extension === "js" || extension === "mjs") return "javascript";
  if (extension === "css" || extension === "scss" || extension === "less") return "css";
  if (extension === "html" || extension === "htm") return "html";
  if (extension === "json") return "json";
  if (extension === "md" || extension === "mdx") return "markdown";
  return "plaintext";
}

interface MonacoCodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
}

export default function MonacoCodeEditor({ path, value, onChange }: MonacoCodeEditorProps): React.JSX.Element {
  const dark = getComputedStyle(document.documentElement).colorScheme !== "light";
  return (
    <Editor
      path={`khadim-artifact:${path}`}
      language={languageForPath(path)}
      value={value}
      beforeMount={configureKhadimThemes}
      theme={dark ? "khadim-dark" : "khadim-light"}
      onChange={(next) => onChange(next ?? "")}
      options={{
        automaticLayout: true,
        fontFamily: "ui-monospace, 'Cascadia Code', SFMono-Regular, Consolas, monospace",
        fontSize: 12,
        lineHeight: 20,
        minimap: { enabled: false },
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        padding: { top: 14 },
        renderWhitespace: "selection",
        renderLineHighlight: "gutter",
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        tabSize: 2,
        wordWrap: "on",
      }}
    />
  );
}
