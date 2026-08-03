import { describe, expect, it } from "vitest";
import { applyReadlineKey } from "./readline";

/**
 * "ls Doc|uments" — a caret marked inline, so the cases read as what you'd
 * type. Split rather than `replace("|", "")`: that strips only the first
 * marker, so a case with two would silently test something other than what
 * it appears to say (and reads to CodeQL as an incomplete sanitizer).
 */
function line(marked: string) {
  const [before, after, ...extra] = marked.split("|");
  if (after === undefined || extra.length > 0)
    throw new Error(`expected exactly one caret marker in "${marked}"`);
  return { value: before + after, caret: before.length };
}

function apply(key: string, marked: string): string | null {
  const result = applyReadlineKey(key, line(marked));
  if (!result)
    return null;
  return `${result.value.slice(0, result.caret)}|${result.value.slice(result.caret)}`;
}

describe("applyReadlineKey", () => {
  it("⌃A moves to the start and ⌃E to the end, leaving the text alone", () => {
    expect(apply("a", "ls Doc|uments")).toBe("|ls Documents");
    expect(apply("e", "ls Doc|uments")).toBe("ls Documents|");
  });

  it("⌃U kills back to the start", () => {
    expect(apply("u", "ls Doc|uments")).toBe("|uments");
  });

  it("⌃K kills forward to the end", () => {
    expect(apply("k", "ls Doc|uments")).toBe("ls Doc|");
  });

  it("⌃W kills the word before the caret", () => {
    expect(apply("w", "ls Documents|")).toBe("ls |");
    expect(apply("w", "ls Doc|uments")).toBe("ls |uments");
  });

  it("⌃W skips the gap first, so it never just eats trailing spaces", () => {
    expect(apply("w", "ls Documents   |")).toBe("ls |");
  });

  it("⌃W on an empty line is a no-op rather than an error", () => {
    expect(apply("w", "|")).toBe("|");
  });

  it("returns null for a key that isn't a binding", () => {
    expect(applyReadlineKey("r", { value: "ls", caret: 2 })).toBeNull();
    expect(applyReadlineKey("z", { value: "ls", caret: 2 })).toBeNull();
  });

  it("clamps a caret that sits outside the value", () => {
    expect(applyReadlineKey("k", { value: "ls", caret: 99 })).toEqual({ value: "ls", caret: 2 });
    expect(applyReadlineKey("u", { value: "ls", caret: -3 })).toEqual({ value: "ls", caret: 0 });
  });
});
