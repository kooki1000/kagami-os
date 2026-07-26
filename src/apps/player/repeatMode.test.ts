import { describe, expect, it } from "vitest";
import { onEndedAction } from "./repeatMode";

describe("onEndedAction", () => {
  it("off + a next track: advances", () => {
    expect(onEndedAction({ repeat: "off", hasNext: true })).toBe("advance");
  });

  it("off + last track: stops instead of wrapping", () => {
    expect(onEndedAction({ repeat: "off", hasNext: false })).toBe("stop");
  });

  it("all + a next track: advances", () => {
    expect(onEndedAction({ repeat: "all", hasNext: true })).toBe("advance");
  });

  it("all + last track: advances too (wraps back to the first track)", () => {
    expect(onEndedAction({ repeat: "all", hasNext: false })).toBe("advance");
  });

  it("one always replays, regardless of position", () => {
    expect(onEndedAction({ repeat: "one", hasNext: true })).toBe("replay");
    expect(onEndedAction({ repeat: "one", hasNext: false })).toBe("replay");
  });
});
