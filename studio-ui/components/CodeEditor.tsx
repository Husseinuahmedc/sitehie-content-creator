"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import type { Extension } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { rust } from "@codemirror/lang-rust";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";

// CodeMirror must only run in the browser (no SSR measuring).
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

/** Prism language id → CodeMirror extension factory. */
const LANG_EXTENSIONS: Record<string, () => Extension> = {
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  jsx: () => javascript({ jsx: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  python: () => python(),
  bash: () => StreamLanguage.define(shell),
  json: () => json(),
  yaml: () => yaml(),
  docker: () => StreamLanguage.define(dockerFile),
  sql: () => sql(),
  go: () => go(),
  rust: () => rust(),
  css: () => css(),
  markup: () => html(),
  markdown: () => markdown(),
  graphql: () => [],
};

type Props = {
  value: string;
  language?: string;
  onChange: (v: string) => void;
  height?: string;
  theme?: "dark" | "light" | "cyberpunk";
};

/** Embedded code editor for code slides (LTR, language-aware, theme-responsive). */
export default function CodeEditor({ value, language, onChange, height = "240px", theme = "dark" }: Props) {
  const extensions = useMemo(() => {
    const factory = LANG_EXTENSIONS[(language || "javascript").toLowerCase()];
    return factory ? [factory()] : [];
  }, [language]);

  return (
    <div dir="ltr" style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <CodeMirror
        value={value}
        height={height}
        theme={theme === "light" ? "light" : "dark"}
        dir="ltr"
        extensions={extensions}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          autocompletion: false,
        }}
      />
    </div>
  );
}
