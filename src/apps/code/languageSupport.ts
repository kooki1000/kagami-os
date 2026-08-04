import type { LanguageSupport, StreamParser } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import type { LanguageId } from "./languages";

/**
 * Loading a language's parser, one dynamic `import()` per language.
 *
 * Kept out of `languages.ts` (which stays pure and node-testable) and behind
 * `import()` rather than a static import so Vite emits a chunk per language:
 * opening a `.py` file never downloads the HTML parser, and a plain-text file
 * downloads none of them. The editor renders unhighlighted for the frame or
 * two this takes, then reconfigures — see `CodeEditor.tsx`.
 */

async function streamMode(load: () => Promise<StreamParser<unknown>>): Promise<Extension> {
  const [{ StreamLanguage }, parser] = await Promise.all([import("@codemirror/language"), load()]);
  return StreamLanguage.define(parser);
}

/**
 * Rust, Go, shell, TOML and SQL come from `@codemirror/legacy-modes` — they
 * have no dedicated CodeMirror 6 package, and a stream parser highlights them
 * perfectly well for an editor that offers no language intelligence anyway.
 */
export async function loadLanguage(id: LanguageId): Promise<Extension | null> {
  switch (id) {
    case "javascript":
      return (await import("@codemirror/lang-javascript")).javascript();
    case "jsx":
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: true });
    case "typescript":
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true });
    case "tsx":
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true });
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "css":
      return (await import("@codemirror/lang-css")).css();
    case "html":
      return (await import("@codemirror/lang-html")).html();
    case "xml":
      return (await import("@codemirror/lang-xml")).xml();
    case "python":
      return (await import("@codemirror/lang-python")).python();
    case "yaml":
      return (await import("@codemirror/lang-yaml")).yaml();
    case "shell":
      return streamMode(async () => (await import("@codemirror/legacy-modes/mode/shell")).shell);
    case "toml":
      return streamMode(async () => (await import("@codemirror/legacy-modes/mode/toml")).toml);
    case "sql":
      return streamMode(async () => (await import("@codemirror/legacy-modes/mode/sql")).standardSQL);
    case "rust":
      return streamMode(async () => (await import("@codemirror/legacy-modes/mode/rust")).rust);
    case "go":
      return streamMode(async () => (await import("@codemirror/legacy-modes/mode/go")).go);
    case "plain":
      return null;
  }
}

export type { LanguageSupport };
