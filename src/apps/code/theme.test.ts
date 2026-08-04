import { describe, expect, it } from "vitest";
import { contrastRatio, hexToOklch, WCAG_AA_NORMAL_TEXT } from "@/design/color";
import { DARK_SYNTAX, LIGHT_SYNTAX } from "./syntaxPalette";

/**
 * The obligations `syntaxPalette.ts` takes on in exchange for hand-authoring
 * colour: stay readable, and stay distinguishable. Asserted, not eyeballed.
 */

/** `--surface` in `src/styles/global.css`, the pane the editor sits on. */
const LIGHT_SURFACE = "#faf8f4";
const DARK_SURFACE = "#201e1a";

describe("syntax palette contrast", () => {
  for (const [themeName, palette, surface] of [
    ["light", LIGHT_SYNTAX, LIGHT_SURFACE],
    ["dark", DARK_SYNTAX, DARK_SURFACE],
  ] as const) {
    describe(themeName, () => {
      for (const [role, hex] of Object.entries(palette)) {
        it(`${role} clears WCAG AA against the surface`, () => {
          expect(contrastRatio(hex, surface)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
        });
      }
    });
  }
});

describe("syntax palette separation", () => {
  // Comment and punctuation are meant to recede; these are the roles that
  // carry meaning and so must be told apart at a glance.
  const MEANING_ROLES = ["keyword", "string", "number", "callable", "type"] as const;

  /**
   * Hue distance in OKLCH, not contrast ratio: two colours of the same
   * lightness and opposite hue have a contrast ratio near 1.0 while being
   * obviously different, so a luminance metric can't answer this question.
   */
  function hueGap(a: string, b: string): number {
    const gap = Math.abs(hexToOklch(a).h - hexToOklch(b).h) % 360;
    return gap > 180 ? 360 - gap : gap;
  }

  for (const [themeName, palette] of [["light", LIGHT_SYNTAX], ["dark", DARK_SYNTAX]] as const) {
    it(`${themeName}: no two meaning roles share a hue`, () => {
      for (const a of MEANING_ROLES) {
        for (const b of MEANING_ROLES) {
          if (a >= b)
            continue;
          expect(hueGap(palette[a], palette[b])).toBeGreaterThan(25);
        }
      }
    });
  }
});
