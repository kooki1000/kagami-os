import { describe, expect, it } from "vitest";
import { apps } from "./apps/registry";
import { chordFromEvent } from "./shortcuts";

/** A minimal stand-in for the fields `chordFromEvent` reads. */
function keydown(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, "key">): KeyboardEvent {
  return { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...partial } as KeyboardEvent;
}

describe("chordFromEvent", () => {
  it("builds letter chords, with and without shift", () => {
    expect(chordFromEvent(keydown({ key: "n", metaKey: true }))).toBe("⌘N");
    expect(chordFromEvent(keydown({ key: "N", metaKey: true, shiftKey: true }))).toBe("⇧⌘N");
    expect(chordFromEvent(keydown({ key: "w", ctrlKey: true }))).toBe("⌘W");
  });

  it("requires a command/control modifier and rejects alt", () => {
    expect(chordFromEvent(keydown({ key: "n" }))).toBeNull();
    expect(chordFromEvent(keydown({ key: "n", metaKey: true, altKey: true }))).toBeNull();
    // Bare Enter/Backspace must never become chords — Files binds them itself.
    expect(chordFromEvent(keydown({ key: "Enter" }))).toBeNull();
    expect(chordFromEvent(keydown({ key: "Backspace" }))).toBeNull();
  });

  it("builds bracket and arrow chords", () => {
    expect(chordFromEvent(keydown({ key: "[", metaKey: true }))).toBe("⌘[");
    expect(chordFromEvent(keydown({ key: "]", metaKey: true }))).toBe("⌘]");
    expect(chordFromEvent(keydown({ key: "ArrowUp", metaKey: true }))).toBe("⌘↑");
    expect(chordFromEvent(keydown({ key: "Backspace", metaKey: true }))).toBe("⌘⌫");
  });

  it("normalizes zoom keys to the glyphs the manifests print", () => {
    // Menus write zoom-out with U+2212 MINUS SIGN, not a hyphen...
    expect(chordFromEvent(keydown({ key: "-", metaKey: true }))).toBe("⌘−");
    expect(chordFromEvent(keydown({ key: "-", metaKey: true }))).toBe("⌘−");
    // ...and zoom-in as "+", though the unshifted key is "=" on most layouts.
    expect(chordFromEvent(keydown({ key: "=", metaKey: true }))).toBe("⌘+");
    expect(chordFromEvent(keydown({ key: "+", metaKey: true, shiftKey: true }))).toBe("⌘+");
    expect(chordFromEvent(keydown({ key: "0", metaKey: true }))).toBe("⌘0");
  });

  it("rejects symbols with no menu glyph", () => {
    expect(chordFromEvent(keydown({ key: "/", metaKey: true }))).toBeNull();
    expect(chordFromEvent(keydown({ key: "F5", metaKey: true }))).toBeNull();
  });
});

describe("every declared menu shortcut is actually dispatchable", () => {
  // Regression: the dispatcher used to match ⌘+letter only, so 13 menu items
  // across Documents, Viewer, Player and Terminal advertised chords that
  // silently did nothing. Any shortcut a manifest prints must be a string
  // `chordFromEvent` can produce — otherwise the menu is lying to the user.
  const producible = new Set<string>();
  for (const key of ["[", "]", "-", "=", "+", "0", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Backspace", "Delete", "Enter"]) {
    const chord = chordFromEvent(keydown({ key, metaKey: true }));
    if (chord)
      producible.add(chord);
  }
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    producible.add(`⌘${letter}`);
    producible.add(`⇧⌘${letter}`);
  }
  // Handled by each app's own key listener rather than the global chord
  // dispatcher, but still honest to print on the menu item.
  const APP_HANDLED = new Set(["F2"]);

  const declared = apps.flatMap(app =>
    (app.menus ?? []).flatMap(section =>
      section.items
        .filter(item => item.shortcut)
        .map(item => ({ app: app.id, label: item.label, shortcut: item.shortcut! })),
    ),
  );

  it.each(declared)("$app › $label ($shortcut)", ({ shortcut }) => {
    expect(producible.has(shortcut) || APP_HANDLED.has(shortcut)).toBe(true);
  });
});
