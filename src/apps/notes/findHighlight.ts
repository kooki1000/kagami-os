import type { EditorView } from "@tiptap/pm/view";
import type { DocMatch } from "./notesFind";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findInDoc } from "./notesFind";

/**
 * Draws the find bar's matches on the document (U11 × D9). A plain
 * `<textarea>` has no per-range highlight, so find used to *select* the
 * current match one at a time; a ProseMirror decoration can mark every one
 * of them at once without touching the document, which means find no longer
 * has to move the caret (or, as it did before, force the preview closed).
 *
 * Decorations are derived state: the query and the active index come in as
 * transaction metadata, and the matches are recomputed whenever either that
 * or the document changes. Nothing here writes to the document, so undo
 * history never sees a search.
 */

export interface FindState {
  query: string;
  /** Which match is current, or null when none is selected yet. */
  active: number | null;
  matches: DocMatch[];
  decorations: DecorationSet;
}

export const findPluginKey = new PluginKey<FindState>("notesFind");

const EMPTY: FindState = { query: "", active: null, matches: [], decorations: DecorationSet.empty };

function decorate(doc: Parameters<typeof findInDoc>[0], matches: DocMatch[], active: number | null): DecorationSet {
  if (matches.length === 0)
    return DecorationSet.empty;
  return DecorationSet.create(
    doc,
    matches.map((match, i) =>
      Decoration.inline(match.from, match.to, {
        class: i === active ? "notes-find-match notes-find-active" : "notes-find-match",
      }),
    ),
  );
}

export const FindHighlight = Extension.create({
  name: "notesFind",

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findPluginKey,
        state: {
          init: () => EMPTY,
          apply(tr, value, _oldState, newState) {
            const meta = tr.getMeta(findPluginKey) as { query: string; active: number | null } | undefined;
            if (!meta && !tr.docChanged)
              return value;
            const query = meta ? meta.query : value.query;
            const active = meta ? meta.active : value.active;
            if (query === "")
              return EMPTY;
            const matches = findInDoc(newState.doc, query);
            return { query, active, matches, decorations: decorate(newState.doc, matches, active) };
          },
        },
        props: {
          decorations(state) {
            return findPluginKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

/** Push a new query/active pair into the plugin — the only way to drive it. */
export function setFindState(view: EditorView, query: string, active: number | null): void {
  view.dispatch(view.state.tr.setMeta(findPluginKey, { query, active }));
}

/** The plugin's current matches, for the UI's counter and for stepping between them. */
export function getFindMatches(view: EditorView): DocMatch[] {
  return findPluginKey.getState(view.state)?.matches ?? [];
}
