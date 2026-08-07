# Kagami OS — Design System

The precise, checkable statement of every design decision in the shell: what
each token is, what value it holds, where that value came from, and which rule
governs its use. `ARCHITECTURE.md` §"Design tokens" is the map of _where the
machinery lives_; this is the specification of _what it decides_.

Read this before adding a color, a radius, a type size, or a component that
isn't a straight reuse of something below.

**Status.** Every value in the Foundations tables was read out of the shipped
source (`src/styles/global.css`, `src/design/tokens.ts`,
`src/system/settings/palettes.ts`) and, where marked _verbatim_, verified
character-for-character against the prototype `KagamiOS.html`. §9 records the
places the codebase has drifted from the documented system — those are known,
not hidden.

---

## 1. Provenance: what came from where

The source of truth is the Claude Design prototype at
`/Users/koki/Downloads/KagamiOS.html` (Claude Design canvas export; the real
document is JSON-escaped on line 189 of the file). Three things about it are
worth knowing before you trust any value.

**Shipped verbatim from the prototype.** The neutral surface ladder
(`--surface`, `--surface-2`, `--text`, `--text-2`, `--border`, `--border-out`,
`--chrome`, `--chrome-2`, `--ph`, `--ph-2`, `--dot`, `--tile`) in both themes,
the Lagoon accent pair, the `--ctl1/2/3` triad, and the radius pairing
(14/13/7) are the prototype's values unchanged. The prototype expressed them
as `.osx[data-m="light"]` / `.osx[data-m="dark"]` blocks; the codebase moved
them to `:root` / `:root[data-theme="dark"]` and kept the variable names.

**Authored after the prototype.** The prototype shipped three accent
_directions_: `a` (teal/coral — Lagoon), `b` (violet `#6b4ad4`/`#a487f2`), and
`c` (lime `#8ba617`/`#e2603f`). Only direction `a` survived. Ember
(amber/indigo) and Slate (steel/sand) are new work, tuned to Lagoon's OKLCH
lightness/chroma register rather than carried over from `b`/`c`. The whole
procedural wallpaper library, the OKLCH derivation chain, `--accent-strong`,
the material levels, and `--ui-scale` are all post-prototype.

**Not in the prototype at all.** The prototype's wallpaper was one linear
gradient plus two shape colors (`--wsh1`, `--wsh2`). Today's five-role
`WallpaperTone` and its style library replaced that wholesale.

> When the prototype and the code disagree, **the code wins** and this document
> records the divergence. The prototype is the origin, not a live spec — it has
> not been updated since July 2026.

---

## 2. The core idea: one hue in, a whole environment out

This is the single most load-bearing decision in the system, and most of the
rules below exist to protect it.

The user picks (or a look supplies) **one accent color**. Everything else
chromatic is _derived_ from it in OKLCH by `src/design/color.ts`:

```
                    accent (the one input)
                       │
   deriveAccentTone ────┼──── deriveAccentStrong ──── --accent-strong
        │               │                             --accent-2-strong
        │               │
   --accent-2      --ctl1 / --ctl2 / --ctl3
   (−150° hue,      (close = accent-2 exactly;
    +0.085 L,        minimize = +0.061 L, +0.010 C;
    +0.05 C)         zoom = −0.081 L, −0.014 C)
        │
        └──── deriveWallpaperTone(accent, accent2, theme)
                   │
              base / mid / wash / warm / line
                   │
              wallpaperStyleVars(styleId, tone) ──── --wall, --wall-size,
                                                     --wall-repeat, --wall-position
```

Two consequences that are the _point_ of the design, not side effects:

- A user-picked accent **cannot clash with the desktop behind it**, because the
  desktop is painted from that accent.
- A red/yellow/green traffic-light triad **is unreachable**, because the triad
  is two hues (the accent hue and one derived warm hue), never three
  independent ones.

Every derivation constant was solved against the hand-authored Lagoon values,
so feeding Lagoon's own accent pair back through the chain reproduces its
original colors to within a unit or two per channel. `color.test.ts` and
`palettes.test.ts` assert this — they are the regression fence around the
calibration.

### 2.1 Where the derived values actually get written

Static defaults in `global.css` cover **only the pre-hydration paint**. At
runtime `App.tsx` writes the full variable map inline on `<html>`, recomputed
by `themeVariables()` whenever theme, look, or any override changes. Inline
wins over the stylesheet, by design.

This means: **editing a color in `global.css` alone changes nothing after
hydration.** A color change has to go through `palettes.ts` (the look) or
`color.ts` (the derivation), and `global.css` is updated to match so the first
paint doesn't flash.

---

## 3. Color

### 3.1 Neutral surfaces — _verbatim from prototype_

Shared across all looks. These are the one part of the palette a look never
touches: the warm neutral base is the system's constant.

| Token          | Light                 | Dark                     | Role                                               |
| -------------- | --------------------- | ------------------------ | -------------------------------------------------- |
| `--surface`    | `#faf8f4`             | `#201e1a`                | Window body; the default page ground               |
| `--surface-2`  | `#efece4`             | `#2a2823`                | Recessed panel inside a window (sidebars, gutters) |
| `--text`       | `#2b2925`             | `#efece5`                | Primary ink                                        |
| `--text-2`     | `#75706a`             | `#9c968b`                | Secondary ink (captions, metadata, disabled-ish)   |
| `--border`     | `rgba(30,25,18,.10)`  | `rgba(255,251,244,.10)`  | Hairline separators                                |
| `--border-out` | `rgba(30,25,18,.10)`  | `rgba(0,0,0,.5)`         | Outer edge of a floating surface                   |
| `--ph`         | `rgba(30,25,18,.065)` | `rgba(255,251,244,.075)` | Hover / inset fill, tier 1                         |
| `--ph-2`       | `rgba(30,25,18,.11)`  | `rgba(255,251,244,.13)`  | Pressed / stronger fill, tier 2                    |
| `--dot`        | `rgba(30,25,18,.17)`  | `rgba(255,251,244,.24)`  | Window control at rest (monochrome)                |
| `--tile`       | `#ffffff`             | `#2e2b26`                | Tile ground                                        |

Note the surface tiers **invert** between themes: in light, `--surface-2` is
_darker_ than `--surface`; in dark it is _lighter_. Never reason about these as
a lightness ramp — reason about them as roles (body vs. recessed).

### 3.2 Chrome — translucent floating surfaces

`--chrome` / `--chrome-2` are their own near-neutrals, **not** `--surface` at
an alpha. Dark deliberately runs its glass a step deeper than the window body
so a menu bar doesn't melt into a window behind it.

Set by `materialVars(level, theme)` from Settings › Appearance:

| Level                 | Alpha scale  | `--chrome-filter`          | `--chrome-filter-2`         |
| --------------------- | ------------ | -------------------------- | --------------------------- |
| `clear`               | ×0.75        | `blur(26px) saturate(1.7)` | `blur(30px) saturate(1.75)` |
| `frosted` _(default)_ | ×1           | `blur(18px) saturate(1.5)` | `blur(22px) saturate(1.6)`  |
| `opaque`              | fully opaque | `none`                     | `none`                      |

Base (frosted) tints: light `rgba(250,248,244,.74)` / `rgba(250,248,244,.58)`;
dark `rgba(26,24,20,.72)` / `rgba(20,18,15,.56)`.

`opaque` resolves the filter to the keyword `none` rather than `blur(0)` — that
drops the backdrop compositing layer outright instead of paying for a blur of
zero. Don't "simplify" it back to a zero blur.

Consume via the `chrome` / `chrome-2` utilities, never by reading the vars
directly — the utilities carry the `-webkit-` prefix and the frosted fallback.

### 3.3 Accent

| Token               | Lagoon light | Lagoon dark           | Use                                      |
| ------------------- | ------------ | --------------------- | ---------------------------------------- |
| `--accent`          | `#0f9b8e`    | `#2fb9ab`             | Accent surfaces **without** text on them |
| `--accent-2`        | `#f2765b`    | `#ff8368`             | The second duotone hue                   |
| `--accent-strong`   | `#008478`    | `#008479`             | Accent fills **with** a text label       |
| `--accent-2-strong` | `#c85037`    | `#c75138`             | Same, for the second hue                 |
| `--ctl1` (close)    | `#f2765b`    | _(theme-independent)_ | Window control                           |
| `--ctl2` (minimize) | `#17b0a1`    | _(theme-independent)_ | Window control                           |
| `--ctl3` (zoom)     | `#0c8074`    | _(theme-independent)_ | Window control                           |

**The `--accent` vs `--accent-strong` rule is not stylistic — it is the
accessibility contract.** Get it wrong and you ship a control below WCAG AA.

- **Filled accent surface carrying white text** → `--accent-strong`.
  Primary buttons, the selected playlist row. Raw `--accent` is 3.44:1 against
  white in light and 2.43:1 in dark; both fail AA. `deriveAccentStrong()`
  walks lightness down in 0.005 steps, hue fixed, until white on it clears
  4.5:1 — and returns the accent untouched if it already passes, which is why
  most custom accents shift not at all.
- **Accent surface with no text on it, or accent-colored text/line** →
  `--accent`. Switch tracks, progress dots, focus rings, `text-accent` on a
  surface. These must keep matching the accent _exactly_; substituting
  `--accent-strong` here desaturates the identity for no accessibility gain.

Both themes converge on nearly the same `--accent-strong` (`#008478` /
`#008479`) because it is anchored to a fixed white-contrast target rather than
to the theme. That convergence is expected, not a bug.

### 3.4 The looks

| Look                   | Light accent / accent-2 | Dark accent / accent-2 | Controls (close/min/zoom)     | Wallpaper  |
| ---------------------- | ----------------------- | ---------------------- | ----------------------------- | ---------- |
| **Lagoon** _(default)_ | `#0f9b8e` / `#f2765b`   | `#2fb9ab` / `#ff8368`  | `#f2765b` `#17b0a1` `#0c8074` | `drift`    |
| **Ember**              | `#b87421` / `#8c96f0`   | `#e7a055` / `#a5b0ff`  | `#8c96f0` `#d0852b` `#995f15` | `strata`   |
| **Slate**              | `#3a86b0` / `#ca9252`   | `#67acd8` / `#dda561`  | `#ca9252` `#4499c9` `#2e6d90` | `halftone` |

A look is **one considered decision**, not a color slot: accent pair per theme

- its control triad + the wallpaper design it was composed against. Accent and
  wallpaper were once two independent preset lists, which meant most reachable
  combinations were ones nobody had ever looked at. Don't re-split them.

### 3.5 Wallpaper tone roles

`deriveWallpaperTone()` produces five roles. They are **roles in the artwork,
not a lightness ramp**:

| Role                    | What it is                                                   |
| ----------------------- | ------------------------------------------------------------ |
| `base` / `mid` / `wash` | The three field stops (ascending lightness _within_ a theme) |
| `warm`                  | The single saturated mass — rides the accent-2 hue           |
| `line`                  | Ink for contour rings and halftone dots                      |

Field stops are chroma-capped at **0.125** so a vivid accent can't drag the
full-screen field into a saturated backdrop (Lagoon's own field peaks at
C 0.113, so the cap only bites for accents more vivid than the presets).

### 3.6 The three hand-authored color families

"Don't hand-author color downstream of the accent" has exactly three standing
exceptions. Each exists for a stated reason. **A fourth needs the same kind of
argument, written in the file, plus a test.**

| Family                  | File                                | Why it's exempt                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Syntax highlighting** | `src/apps/code/syntaxPalette.ts`    | Hues carry _meaning_ (keyword ≠ string ≠ comment) and must stay mutually distinguishable — one derived hue can't promise that, and some accents would collapse keyword and string together. Fixed light/dark pair, held to AA against `--surface` and to a minimum OKLCH hue gap between roles by `theme.test.ts`. **Documented and tested.** |
| **File labels**         | `src/system/fs/nodeLabels.ts`       | Seven user-facing category colors (red…gray) that name themselves — a "Red" label derived from a teal accent would not be red. Deliberately theme- and accent-independent. **Commented in-file, but not registered in `ARCHITECTURE.md` and untested for contrast.**                                                                          |
| **App tile gradients**  | `AppManifest.tileGradient`, 15 apps | Per-app brand identity in the dock, app switcher, and notification glyphs; rendered as `linear-gradient(135deg, from, to)`. An app's tile must stay recognizable when the user changes accent. **Undocumented as an exception anywhere.**                                                                                                     |

See §9 — the second and third need to be formalized or folded in.

---

## 4. Typography

**Families.** Inter (`@fontsource-variable/inter`) for text, JetBrains Mono
(`@fontsource/jetbrains-mono`) for code. Declared as `--font-sans` /
`--font-mono` in `@theme inline`, with `system-ui` / `ui-monospace` fallbacks.
Body sets `-webkit-font-smoothing: antialiased`.

**Every shell type size is density-scaled.** There are no unscaled `text-[Npx]`
classes and no Tailwind default size classes (`text-sm`, `text-lg`, …) anywhere
in `src/` — verified by sweep. Keep it that way: a raw `text-sm` silently opts
out of the density preference.

### 4.1 The scale in use

Five sizes are common enough to have named utilities, generated in
`@theme inline` as `calc(Npx * var(--ui-scale))`:

| Utility     | Size   | Typical use                           |
| ----------- | ------ | ------------------------------------- |
| `text-13`   | 13px   | Menu bar, menu rows, body text        |
| `text-12.5` | 12.5px | Toast titles, menu-bar status cluster |
| `text-12`   | 12px   | Segmented control, dense body         |
| `text-11.5` | 11.5px | Sidebar rows, secondary body          |
| `text-11`   | 11px   | Captions, tooltips, badges            |

Everything else is an arbitrary value at the call site, written
`text-[calc(Npx*var(--ui-scale))]`. In use: **9.5, 10, 10.5, 13.5, 15, 18, 24,
28, 36, 40** (the large end is Calculator/Clock display type). Below 11px and
above 13px, one-offs are expected — don't add a token until a size earns three
or four call sites.

> `typeScale` in `src/design/tokens.ts` (display 28/700, title 20/600,
> bodyLarge 15/500, body 13/400, caption 11/500) describes a scale the codebase
> **does not use** and nothing imports it. See §9.

### 4.2 Density (`--ui-scale`)

One multiplier on every fixed text/icon/control size in the shell. Settings ›
Appearance writes it inline on `<html>`; `global.css` defaults it to `1` for
the pre-hydration paint and the JS-disabled case.

| Preset    | Multiplier |
| --------- | ---------- |
| `small`   | 0.92       |
| `default` | 1          |
| `large`   | 1.08       |

Chosen so the two extremes land roughly on the next step of the existing scale
(12.5px → ~11.5px / ~13.5px) rather than an arbitrary blur.

**New UI must scale.** Any fixed px dimension that a user reads or clicks —
type, icon, control height, gap — goes through `calc(Npx * var(--ui-scale))`.
Structural constants that are _not_ content (hairline widths, resize-handle
hit areas at the window edge, wallpaper stroke widths) deliberately do not.

---

## 5. Geometry

### 5.1 Radius

Three are tokenized in `@theme inline`, and they are the prototype's pairing:

| Utility          | Value | Role             |
| ---------------- | ----- | ---------------- |
| `rounded-window` | 14px  | Window frame     |
| `rounded-tile`   | 13px  | Dock tile, toast |
| `rounded-btn`    | 7px   | Button, menu row |

The full radius vocabulary actually in use, by role:

| Radius   | Role                                                          | Uses |
| -------- | ------------------------------------------------------------- | ---- |
| 3px      | Inline text highlight (Notes find match)                      | 2    |
| 4–5px    | Micro chips (small segmented control)                         | 12   |
| **6px**  | **Toolbar icon button** (`toolbarIconButtonClass`)            | 20   |
| **7px**  | **`rounded-btn`** — buttons, menu rows                        | 57   |
| 8px      | Misc panels                                                   | 4    |
| **9px**  | **Segmented control container** (`md`)                        | 6    |
| **10px** | **Menu / context menu / flyout panel**                        | 4    |
| 11px     | Search result row                                             | 3    |
| 12px     | Window control dot (12px circle, `border-radius: 50%`)        | 4    |
| **13px** | **`rounded-tile`**                                            | 5    |
| **14px** | **`rounded-window`**                                          | 6    |
| 15px     | Search overlay panel _(= the prototype's outer shell radius)_ | 3    |
| 19px     | Dock container                                                | 1    |

The 6px toolbar icon button is deliberately _not_ `rounded-btn` — 7px is
reserved for larger CTA-style buttons, and a 24px square at 7px reads too soft.

### 5.2 Fixed chrome dimensions — _verbatim from prototype_

| Element            | Size          |
| ------------------ | ------------- |
| Menu bar height    | 30px          |
| Title bar height   | 40px          |
| Dock icon (medium) | 46px          |
| Window control dot | 12px diameter |

Dock tile presets (`DOCK_TILE_PX`): small **38**, medium **46**, large **56**.

### 5.3 Icons

`lucide-react`, sized `size-[calc(Npx*var(--ui-scale))]` — 13px and 14px carry
most of the shell; 10px for inline affordances, 15–18px for toolbars, 20–26px
for feature moments.

Stroke weight: **1.4 is the shell default** (13 call sites). **1.8** for
emphasis or small sizes where 1.4 disappears (7 sites). Other values are
one-offs and shouldn't be copied without reason.

### 5.4 Hairlines

`0.5px solid var(--border)` — reads as a crisp hairline on retina, where 1px
reads as a rule. Use the `hairline` / `hairline-b` / `hairline-t` /
`hairline-r` / `hairline-l` utilities, never a raw `border` (73 call sites
across 27 files; consistency here is what makes window edges read as one
system).

---

## 6. Elevation

| Token                   | Value                                                                                                    | Use                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `--shadow-window`       | `0 8px 22px -8px rgba(0,0,0,.32)`                                                                        | Unfocused window                                              |
| `--shadow-window-focus` | `0 30px 65px -18px rgba(0,0,0,.5), 0 6px 18px -8px rgba(0,0,0,.3)`                                       | Focused window                                                |
| `--shadow-deep`         | `0 22px 55px -16px rgba(28,22,14,.42)`                                                                   | Floating chrome: menus, context menus, toasts, search overlay |
| `--shadow-chip`         | light `0 1px 3px rgba(0,0,0,.14)`<br>dark `0 1px 2px rgba(0,0,0,.45), 0 0 0 0.5px rgba(255,251,244,.06)` | Lift under a selected segmented chip                          |

`--shadow-chip` is **themed** while the other three are not, and that is the
interesting one: the same black rgba that reads as a lift on a warm light
surface reads as a _smudge_ under a light chip on a dark one, so dark trades
most of the blur for a hairline ring.

Elevation is how depth is expressed — the shell does not use borders or
background steps to signal "floating." A new floating surface takes
`shadow-(--shadow-deep) chrome hairline` as a set.

---

## 7. Motion

| Motion                | Duration | Easing                        |
| --------------------- | -------- | ----------------------------- |
| Window enter          | 180ms    | (transform/opacity only)      |
| Window minimize       | 240ms    | (fly-to-dock)                 |
| Reduced-motion floor  | **20ms** | —                             |
| Toast entrance        | 200ms    | `cubic-bezier(.2,.9,.25,1.2)` |
| Flyout entrance       | 160ms    | `ease-out`                    |
| Dock tile hover lift  | 180ms    | `cubic-bezier(.2,.9,.25,1.4)` |
| Dock tooltip fade     | 150ms    | —                             |
| Window control tint   | 150ms    | —                             |
| Terminal cursor blink | 1.1s     | `step-end`                    |

Four rules:

1. **Only `transform` and `opacity` are ever transitioned** on windows. Nothing
   that triggers layout.
2. **Reduced motion collapses, it does not remove.** Entrance animations go to
   `0.01ms`, and the window constants to 20ms — _not_ 0. A literal 0s can be
   treated by some assistive tech as "no animation ran" (no `animationend`),
   and the window path has to outrun its own fly-to-dock `setTimeout` to avoid
   an apparent hang. The terminal cursor is the one exception: it has no
   entrance to shorten, so reduced motion gives it a steady block.
3. **The cursor blink is `step-end`, deliberately.** A cursor that eases
   between states reads as a pulsing highlight rather than a caret.
4. **`animationSpeed`** (Settings › Accessibility) divides the window
   durations — 2 = twice as fast, 0.5 = twice as slow. Clamped non-zero in
   `settingsStore`; ignored entirely once motion is reduced.

Reduce-motion resolution: `ReduceMotionPreference` is `"system" | "on" |
"off"` — an explicit user override layered on top of
`prefers-reduced-motion`. Read it through `useEffectiveReducedMotion()`, never
the media query directly.

---

## 8. Component recipes

The canonical class strings. Reuse the shared component or helper; reach for
these only when building something genuinely new.

**Window** — `rounded-window bg-surface hairline`, shadow swapped on focus.
Title bar: 40px, `bg-surface px-[calc(15px*var(--ui-scale))] hairline-b`, plus
`titlebar-focused` when focused. Resize handles are 6px edges and 12px corners.

**Window controls** — `win-dot`: 12px circle, `background: var(--dot)`
(monochrome at rest), 8px/700 glyph at `opacity: 0`. Two reveal paths:
`.titlebar-focused .win-dot` tints to `var(--dot-accent)`; `.win-controls:hover`
tints _and_ shows the glyph. Each dot carries its own `--dot-accent` inline
(`var(--ctl1|2|3)`).

**Menu bar** — `fixed inset-x-0 top-0 z-40`, 30px,
`px-[calc(15px*var(--ui-scale))] text-13 text-ink chrome hairline-b`.

**Dock** — container `rounded-[19px] px-3 py-[calc(9px*var(--ui-scale))]
chrome-2 hairline` + `shadow-[0_12px_34px_-10px_rgba(0,0,0,.4)]`, gap
`calc(11px*var(--ui-scale))`. Tile: `rounded-tile border-[0.5px]
border-white/20`, `linear-gradient(135deg, …tileGradient)`, hover
`scale-[1.06]` + translate 13px toward the screen, 180ms
`cubic-bezier(.2,.9,.25,1.4)`. Running dot: `size-1 rounded-full bg-ink
opacity-55`.

**Menu / context menu** — `rounded-[10px] p-1 shadow-(--shadow-deep) chrome
hairline`, `min-w-52` (menu bar) / `min-w-44` (context). Rows are
`rounded-btn px-[calc(10px*var(--ui-scale))] py-1 text-13`. Dividers:
`mx-2 my-1 hairline-b`.

**Toast** — `w-80 rounded-tile p-3 shadow-(--shadow-deep) chrome hairline
animate-toast-in`. Title `text-12.5 font-semibold text-ink`, body
`text-11.5/snug text-ink-2`.

**Segmented control** (`ui/Segmented.tsx`) — track `bg-ph`, `md`:
`rounded-[9px] p-0.75` with `rounded-btn px-3 py-[calc(6px*var(--ui-scale))]
text-12` chips; `sm`: `rounded-btn p-0.5 gap-0.5` with `rounded-[5px]` chips.
Selected chip `bg-surface font-semibold text-ink shadow-(--shadow-chip)`;
unselected `font-medium text-ink-2 hover:text-ink`. Carries `aria-pressed`.

**Switch** (`ui/Switch.tsx`) — `md` track `h-[calc(18px*var(--ui-scale))] w-8`,
knob `size-[calc(14px*var(--ui-scale))]`; `sm` 16px/w-7/12px. On: `bg-accent`
(**not** `--accent-strong` — no label sits on it). Knob is `bg-white`, moved by
transitioning `left`. `role="switch"` + `aria-checked`.

**Toolbar icon button** (`apps/shared/toolbarIconButton.ts`) — `grid size-6
place-items-center rounded-[6px] text-ink-2 enabled:hover:bg-ph
enabled:hover:text-ink disabled:opacity-35`. Plain actions only; pressed/
selected toggles keep their own local helpers because their hover rules differ.

**Swatch selection ring** (`ui/swatchRing.ts`) — two stacked box-shadows:
a `--surface` gap then an `--accent` ring, so the gap is the page ground rather
than a fixed color (which Tailwind's `ring-*` can't express). `ringPx` scales
with swatch size: 3 for ~18px swatches, 4 for ~26px.

**Focus ring** — global `:focus-visible { outline: 2px solid var(--accent);
outline-offset: 2px }`. `:focus-visible`, not `:focus`, so it appears for
keyboard/AT navigation and not mouse clicks. Don't add per-component focus
styling; extend this.

---

## 9. Drift register

Findings from the codebase sweep. Nothing here is urgent; all of it is real.

**Dead exports in `src/design/tokens.ts`.** `typeScale`, `sizing`, and
`shadows` have **zero importers**. Worse, `typeScale` documents a scale
(28/20/15/13/11 at weights 700/600/500/400/500) that the shell does not use —
the real scale is 9.5–13.5 with named tokens at 11/11.5/12/12.5/13. A reader
who trusts it will build the wrong thing. `lagoon` is imported only by
`color.test.ts`; `radius` only for `radius.window` by the Browser app's webview
corner rounding. → Either delete `typeScale`/`sizing`/`shadows`, or correct
`typeScale` and wire the values through so they can't silently rot.

**Dead tokens.** `--border-out` is defined in both themes and referenced
nowhere outside `global.css`. `--tile` is defined _and_ mapped to a
`bg-tile` utility that has **zero call sites**. Both are prototype carry-overs.

**Two unregistered color exceptions.** §3.6 — `nodeLabels.ts` (7 hues) and
`AppManifest.tileGradient` (15 pairs, 30 hues) are hand-authored color families
outside the accent derivation, but only the syntax palette is registered as an
exception in `ARCHITECTURE.md`/`CLAUDE.md`. As written, the rule reads as
having one exception when it has three. Neither of the two is contrast-tested.

**Un-tokenized radii with real weight.** `rounded-[6px]` (20 uses, the toolbar
icon button) and `rounded-[10px]` (menu/flyout panels) are as systematic as the
three tokenized radii but live as arbitrary values. `rounded-[9px]` (segmented)
and `rounded-[5px]` (8 uses) are close behind. → Candidates for
`--radius-icon-btn` / `--radius-panel`.

**Six one-off shadows.** Dock (×3), Desktop, Viewer, and Player's Slider each
hand-write an rgba shadow instead of using a token. The Dock's three are
defensible (a tile lift is not a window shadow), but they should be named. The
two `shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]` strings in
`SettingsApp.tsx` and `IconPickerPanel.tsx` duplicate `swatchRingClass()`
inline and should just call it.

---

## 10. Extending the system

**Adding a look.** Append to `LOOKS` in `palettes.ts`: accent pair per theme,
control triad, and the `wallpaperStyleId` it was composed against. Tune it to
the same OKLCH lightness/chroma register as the existing three — the point is
that all looks read with the same weight, not that they're maximally
different. Check both themes against `checkAccentContrast()`.

**Adding a wallpaper style.** Add a pure `tone → WallpaperLayer[]` function to
`wallpaperStyles.ts`. Three hard constraints, all unit-tested: (1) something in
the composition must resolve at pixel scale — a hairline, a zero-width stop, or
a fine grain; soft passages are the ground beneath something sharp, never the
whole surface; (2) **no viewport units** — Settings renders the same vars into
~130×84 preview cards; (3) tiled geometry goes through `tile()` /`tilePlus()`
so a preview can shrink spacing via `--wall-tile` while stroke _widths_ stay
fixed.

**Adding a color.** Don't. Derive it, or add it to the look table. If it
genuinely can't be derived, it needs the §3.6 treatment: the argument written
in the file, plus a contrast test.

**Adding a size.** Use `calc(Npx * var(--ui-scale))` at the call site. Promote
to a named token in `@theme inline` once it has three or four call sites.

**Adding a floating surface.** `shadow-(--shadow-deep) chrome hairline`, panel
radius 10px (menus) or 13px (tiles/toasts), entrance `animate-flyout-in`.

---

## 11. The binding constraints

These are decisions, not preferences. Changing one is a design decision to be
raised explicitly, not folded into feature work.

1. **Window controls are monochrome at rest.** Focus and cluster-hover tint
   them with a **duotone derived from one accent**. Never three independent
   colors. Never a red/yellow/green triad. Never system blue.
2. **Dock tiles are rounded squares (13px) with a hover lift.** No
   magnification curve. No squircles.
3. **Radius pairing: window 14 / dock tile 13 / button 7.**
4. **Menu bar 30px, title bar 40px, dock icon 46px.**
5. **Inter and JetBrains Mono**, via Fontsource.
6. **Generic app naming** ("Files", "Settings"). No Apple or Puter naming,
   assets, or iconography anywhere.
7. **The control duotone is always derived, never user-set** — a user may pick
   an accent, but the triad follows from it.
8. **Wallpaper styles emit no viewport units** and size tiled geometry through
   `var(--wall-tile)`.
9. **Do not drift toward macOS defaults.** The menu-bar-plus-dock skeleton
   matches the macOS _layout convention_ deliberately; the treatment must not.
