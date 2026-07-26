import { describe, expect, it } from "vitest";
import {
  charCount,
  findMatches,
  replaceAllMatches,
  replaceOne,
  stepMatch,
  wordCount,
} from "./findReplace";

describe("findMatches", () => {
  it("finds every case-insensitive, non-overlapping occurrence", () => {
    expect(findMatches("Cat cat CATastrophe", "cat")).toEqual([0, 4, 8]);
  });

  it("returns an empty array for a blank query", () => {
    expect(findMatches("anything", "")).toEqual([]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(findMatches("hello world", "xyz")).toEqual([]);
  });
});

describe("stepMatch", () => {
  it("lands on the first match going forward from no selection", () => {
    expect(stepMatch(3, null, 1)).toBe(0);
  });

  it("lands on the last match going backward from no selection", () => {
    expect(stepMatch(3, null, -1)).toBe(2);
  });

  it("wraps forward past the last match", () => {
    expect(stepMatch(3, 2, 1)).toBe(0);
  });

  it("wraps backward past the first match", () => {
    expect(stepMatch(3, 0, -1)).toBe(2);
  });

  it("returns null when there are no matches", () => {
    expect(stepMatch(0, null, 1)).toBeNull();
  });
});

describe("replaceOne", () => {
  it("replaces just the targeted match, leaving the others untouched", () => {
    const text = "cat cat cat";
    const matches = findMatches(text, "cat");
    expect(replaceOne(text, matches, 1, "cat".length, "dog")).toBe("cat dog cat");
  });

  it("is a no-op for an out-of-range index", () => {
    const text = "cat cat";
    expect(replaceOne(text, [0], 5, 3, "dog")).toBe(text);
  });
});

describe("replaceAllMatches", () => {
  it("replaces every case-insensitive occurrence", () => {
    expect(replaceAllMatches("Cat cat CAT", "cat", "dog")).toBe("dog dog dog");
  });

  it("is a no-op when the query doesn't appear", () => {
    expect(replaceAllMatches("hello", "xyz", "dog")).toBe("hello");
  });

  it("handles a replacement that's a different length than the query", () => {
    expect(replaceAllMatches("a-a-a", "a", "bb")).toBe("bb-bb-bb");
  });
});

describe("wordCount", () => {
  it("counts whitespace-delimited words", () => {
    expect(wordCount("one two  three\nfour")).toBe(4);
  });

  it("is zero for an empty or whitespace-only string", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n\t ")).toBe(0);
  });
});

describe("charCount", () => {
  it("counts every character including whitespace", () => {
    expect(charCount("ab cd")).toBe(5);
  });

  it("is zero for an empty string", () => {
    expect(charCount("")).toBe(0);
  });
});
