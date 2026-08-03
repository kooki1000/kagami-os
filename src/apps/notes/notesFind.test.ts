import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { NOTES_EXTENSIONS } from "./editorSchema";
import { markdownToDoc } from "./markdownDocument";
import { charCount, findInDoc, stepMatch, wordCount } from "./notesFind";

const schema = getSchema(NOTES_EXTENSIONS);

/** A real document built from markdown, the way the editor loads a note. */
function doc(markdown: string) {
  return schema.nodeFromJSON(markdownToDoc(markdown));
}

/** The text each match range actually covers — proves the positions are right, not just plausible. */
function matchedText(markdown: string, query: string): string[] {
  const node = doc(markdown);
  return findInDoc(node, query).map(m => node.textBetween(m.from, m.to));
}

describe("findInDoc", () => {
  it("finds every occurrence, case-insensitively", () => {
    expect(matchedText("The cat sat. A CAT ran.", "cat")).toEqual(["cat", "CAT"]);
  });

  it("returns nothing for an empty query rather than everything", () => {
    expect(findInDoc(doc("some text"), "")).toEqual([]);
  });

  it("finds matches across every block type", () => {
    const markdown = "# find me\n\n- find me\n\n1. find me\n\n- [ ] find me\n\nfind me";
    expect(matchedText(markdown, "find me")).toHaveLength(5);
  });

  it("maps positions correctly past a mark boundary", () => {
    // "a bold word" is three text nodes; a naive offset would drift here.
    expect(matchedText("a **bold** word", "word")).toEqual(["word"]);
  });

  it("still lands on the right text when a hard break precedes the match", () => {
    // The break occupies a position but contributes no text, so textContent
    // offsets and document positions diverge from this point on.
    expect(matchedText("first line\nsecond target", "target")).toEqual(["target"]);
  });

  it("does not match across a hard break", () => {
    expect(findInDoc(doc("line\nbreak"), "linebreak")).toEqual([]);
  });

  it("finds a match inside a marked run", () => {
    expect(matchedText("plain **bold text** plain", "bold")).toEqual(["bold"]);
  });

  it("does not overlap matches of a repeating query", () => {
    expect(matchedText("aaaa", "aa")).toEqual(["aa", "aa"]);
  });

  it("returns matches in reading order across blocks", () => {
    const node = doc("# alpha\n\nalpha again");
    const matches = findInDoc(node, "alpha");
    expect(matches.map(m => m.from)).toEqual([...matches.map(m => m.from)].sort((a, b) => a - b));
    expect(matches).toHaveLength(2);
  });
});

describe("stepMatch", () => {
  it("wraps forwards and backwards", () => {
    expect(stepMatch(3, null, 1)).toBe(0);
    expect(stepMatch(3, null, -1)).toBe(2);
    expect(stepMatch(3, 2, 1)).toBe(0);
    expect(stepMatch(3, 0, -1)).toBe(2);
  });

  it("has nothing to step to with no matches", () => {
    expect(stepMatch(0, null, 1)).toBeNull();
  });
});

describe("counts", () => {
  it("counts words and characters", () => {
    expect(wordCount("  one two   three ")).toBe(3);
    expect(wordCount("   ")).toBe(0);
    expect(charCount("abc")).toBe(3);
  });
});
