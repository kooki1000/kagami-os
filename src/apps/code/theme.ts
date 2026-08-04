import type { Extension } from "@codemirror/state";
import type { SyntaxPalette } from "./syntaxPalette";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { DARK_SYNTAX, LIGHT_SYNTAX } from "./syntaxPalette";

/**
 * How the editor looks (D4), in two halves governed by two different rules.
 *
 * **Chrome** — background, gutter, active line, selection, caret, matching
 * brackets — is written entirely in the design tokens, so it follows the look,
 * a custom accent, the material level and `--ui-scale` for free, exactly like
 * every other surface in the system.
 *
 * **Syntax colours** are a deliberate exception to the "don't hand-author
 * colour downstream of the accent" rule; `syntaxPalette.ts` carries that
 * argument, and the values.
 */

function highlightStyle(palette: SyntaxPalette): HighlightStyle {
  return HighlightStyle.define([
    { tag: [tags.keyword, tags.modifier, tags.controlKeyword, tags.operatorKeyword], color: palette.keyword },
    { tag: [tags.string, tags.special(tags.string), tags.regexp], color: palette.string },
    { tag: [tags.number, tags.bool, tags.null, tags.atom], color: palette.number },
    { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: palette.comment, fontStyle: "italic" },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: palette.callable },
    { tag: [tags.typeName, tags.className, tags.tagName, tags.namespace, tags.definition(tags.propertyName)], color: palette.type },
    { tag: [tags.punctuation, tags.bracket, tags.separator, tags.operator], color: palette.punctuation },
    { tag: [tags.heading, tags.strong], fontWeight: "600" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.invalid, color: "var(--ctl1)" },
  ]);
}

/**
 * Everything structural, in tokens. `--cm-font-size` is set inline by the
 * component from the user's own font-size preference (multiplied by
 * `--ui-scale`, like Notes'), rather than baked in here.
 */
const chromeTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "transparent",
    fontSize: "var(--cm-font-size, 13px)",
  },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "calc(10px * var(--ui-scale)) 0",
    caretColor: "var(--accent)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-2)",
    border: "none",
    paddingRight: "calc(4px * var(--ui-scale))",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--text)",
  },
  ".cm-activeLine": { backgroundColor: "var(--ph)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--ph-2)",
    outline: "none",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--ph-2)",
  },
  ".cm-searchMatch": { backgroundColor: "var(--ph-2)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent-soft, var(--ph-2))" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--ph)",
    border: "none",
    color: "var(--text-2)",
  },
  ".cm-panels": {
    backgroundColor: "var(--surface-2)",
    color: "var(--text)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  },
});

/**
 * Both themes, built once at module load. `HighlightStyle.define` mints a
 * `StyleModule`, and style-mod mounts its rules into the document without ever
 * unmounting them — building one per call would append a fresh copy of every
 * syntax rule each time the editor re-themed, which is unbounded while a
 * colour picker is being dragged.
 */
const THEMES: Record<"light" | "dark", Extension> = {
  light: [chromeTheme, syntaxHighlighting(highlightStyle(LIGHT_SYNTAX))],
  dark: [chromeTheme, syntaxHighlighting(highlightStyle(DARK_SYNTAX))],
};

export function editorTheme(dark: boolean): Extension {
  return dark ? THEMES.dark : THEMES.light;
}
