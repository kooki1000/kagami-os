import { describe, expect, it } from "vitest";
import {
  toggleBulletList,
  toggleHeadingLine,
  toggleInlineWrap,
  toggleNumberList,
} from "./markdownFormat";

describe("toggleInlineWrap", () => {
  it("wraps a selection that isn't wrapped", () => {
    const result = toggleInlineWrap("hello world", 0, 5, "**", "**");
    expect(result.text).toBe("**hello** world");
    expect(result.selectionStart).toBe(2);
    expect(result.selectionEnd).toBe(7);
  });

  it("unwraps a selection that's already exactly wrapped", () => {
    const result = toggleInlineWrap("**hello** world", 0, 9, "**", "**");
    expect(result.text).toBe("hello world");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(5);
  });

  it("unwraps when the cursor selection sits inside existing markers with no text selected around it", () => {
    // Selection is exactly the inner text, markers surround it but aren't part of the selection.
    const result = toggleInlineWrap("say **hi** now", 6, 8, "**", "**");
    expect(result.text).toBe("say hi now");
    expect(result.selectionStart).toBe(4);
    expect(result.selectionEnd).toBe(6);
  });

  it("inserts empty markers around an empty selection with the cursor centered", () => {
    const result = toggleInlineWrap("hello world", 5, 5, "*", "*");
    expect(result.text).toBe("hello** world");
    expect(result.selectionStart).toBe(6);
    expect(result.selectionEnd).toBe(6);
  });

  it("underline uses distinct open/close markers", () => {
    const result = toggleInlineWrap("hello world", 0, 5, "<u>", "</u>");
    expect(result.text).toBe("<u>hello</u> world");
    expect(result.selectionStart).toBe(3);
    expect(result.selectionEnd).toBe(8);

    const back = toggleInlineWrap(result.text, result.selectionStart, result.selectionEnd, "<u>", "</u>");
    expect(back.text).toBe("hello world");
  });
});

describe("toggleHeadingLine", () => {
  it("cycles a plain line through H1 -> H2 -> H3 -> plain", () => {
    const text = "hello";
    let r = toggleHeadingLine(text, 0, 0);
    expect(r.text).toBe("# hello");
    r = toggleHeadingLine(r.text, r.selectionStart, r.selectionEnd);
    expect(r.text).toBe("## hello");
    r = toggleHeadingLine(r.text, r.selectionStart, r.selectionEnd);
    expect(r.text).toBe("### hello");
    r = toggleHeadingLine(r.text, r.selectionStart, r.selectionEnd);
    expect(r.text).toBe("hello");
    void text;
  });

  it("applies the same next level to every line touched by a multi-line selection", () => {
    const text = "one\ntwo\nthree";
    const r = toggleHeadingLine(text, 0, text.length);
    expect(r.text).toBe("# one\n# two\n# three");
  });

  it("only touches the line the cursor is on for a collapsed selection mid-document", () => {
    const text = "one\ntwo\nthree";
    const cursorInTwo = 5; // inside "two"
    const r = toggleHeadingLine(text, cursorInTwo, cursorInTwo);
    expect(r.text).toBe("one\n# two\nthree");
  });
});

describe("toggleBulletList", () => {
  it("adds a bullet to every non-blank selected line", () => {
    const text = "one\ntwo\nthree";
    const r = toggleBulletList(text, 0, text.length);
    expect(r.text).toBe("- one\n- two\n- three");
  });

  it("removes bullets when every selected line already has one", () => {
    const text = "- one\n- two";
    const r = toggleBulletList(text, 0, text.length);
    expect(r.text).toBe("one\ntwo");
  });

  it("skips blank lines", () => {
    const text = "one\n\ntwo";
    const r = toggleBulletList(text, 0, text.length);
    expect(r.text).toBe("- one\n\n- two");
  });
});

describe("toggleNumberList", () => {
  it("numbers every non-blank selected line sequentially", () => {
    const text = "one\ntwo\nthree";
    const r = toggleNumberList(text, 0, text.length);
    expect(r.text).toBe("1. one\n2. two\n3. three");
  });

  it("removes numbering when every selected line already has it", () => {
    const text = "1. one\n2. two";
    const r = toggleNumberList(text, 0, text.length);
    expect(r.text).toBe("one\ntwo");
  });
});
