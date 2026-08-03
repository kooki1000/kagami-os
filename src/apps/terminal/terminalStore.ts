import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Keep only the most recent N entries — same "cap and prune" shape as
 * `notificationStore`'s `HISTORY_LIMIT`, just a bigger horizon since command
 * history is cheap plain strings rather than richer notification objects.
 */
const HISTORY_LIMIT = 200;

/**
 * Discrete steps ⌘+/⌘- cycle through, in px before the `--ui-scale` density
 * multiplier is applied — matches the default the font size replaces
 * (`text-12.5` = 12.5px * ui-scale) with a couple of steps either side.
 */
export const FONT_SIZE_STEPS = [10, 11, 11.5, 12, 12.5, 13, 14, 16, 18, 20] as const;
export const DEFAULT_FONT_SIZE: number = 12.5;

/**
 * Nearest defined step to an arbitrary size (guards against a corrupted/
 * hand-edited persisted value landing between steps).
 */
export function clampFontSize(size: number): number {
  return FONT_SIZE_STEPS.reduce(
    (closest, step) => (Math.abs(step - size) < Math.abs(closest - size) ? step : closest),
    FONT_SIZE_STEPS[0] as number,
  );
}

/** The next step in `direction` from `current`, clamped to the ends of `FONT_SIZE_STEPS`. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  const steps = FONT_SIZE_STEPS as readonly number[];
  const idx = steps.indexOf(clampFontSize(current));
  const next = Math.min(steps.length - 1, Math.max(0, idx + direction));
  return steps[next];
}

/**
 * `history` with `command` appended, trimmed of surrounding whitespace,
 * blank entries dropped, and capped to the most recent `limit`. Pure —
 * unit-tested without the store.
 */
export function pushHistory(history: string[], command: string, limit = HISTORY_LIMIT): string[] {
  const trimmed = command.trim();
  if (trimmed === "")
    return history;
  return [...history, trimmed].slice(-limit);
}

/**
 * Index of the most recent entry in `history` containing `query`
 * (case-insensitive substring), searched strictly before `beforeIndex` —
 * repeated ⌃R presses pass the previous match's index back in to step to
 * the next-older one. Defaults to searching the whole history. Null when
 * nothing matches (including an empty query, which never should). Pure —
 * this is the part of ⌃R's incremental search that's worth testing in
 * isolation; the keybinding wiring itself isn't easily unit-testable
 * without jsdom/RTL, which this codebase deliberately has neither of.
 */
export function findHistoryMatch(
  history: string[],
  query: string,
  beforeIndex: number = history.length,
): number | null {
  if (query === "")
    return null;
  const needle = query.toLowerCase();
  const start = Math.min(beforeIndex, history.length) - 1;
  for (let i = start; i >= 0; i--) {
    if (history[i].toLowerCase().includes(needle))
      return i;
  }
  return null;
}

/**
 * Type faces the terminal offers. JetBrains Mono is the design's own mono
 * (`--font-mono`) and stays the default; the other two are there because a
 * terminal is the one place a user reasonably has a personal preference,
 * and both are already on the machine — no new font is downloaded.
 */
export const FONT_FAMILIES = [
  { id: "kagami", label: "JetBrains Mono", stack: "var(--font-mono)" },
  { id: "system", label: "System Mono", stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
  { id: "courier", label: "Courier", stack: "\"Courier New\", Courier, monospace" },
] as const;

export type TerminalFontId = typeof FONT_FAMILIES[number]["id"];

export const DEFAULT_FONT_FAMILY: TerminalFontId = "kagami";

/**
 * How much of the prompt to show: the user and path ("kagami ~/Documents $"),
 * the path alone, or nothing but the marker. The block cursor's `ch`
 * arithmetic doesn't care which — the prompt is a separate flex item.
 */
export type PromptStyle = "full" | "short" | "minimal";

export const DEFAULT_PROMPT_STYLE: PromptStyle = "short";

export const PROMPT_STYLES: { id: PromptStyle; label: string }[] = [
  { id: "full", label: "User and Path" },
  { id: "short", label: "Path Only" },
  { id: "minimal", label: "Marker Only" },
];

/** The CSS font stack for a stored id, falling back to the default for anything unrecognised. */
export function fontStack(id: string): string {
  return (FONT_FAMILIES.find(f => f.id === id) ?? FONT_FAMILIES[0]).stack;
}

interface TerminalStore {
  /** Submitted command lines, oldest first, capped to `HISTORY_LIMIT`. */
  history: string[];
  /** Terminal text size in px, before the `--ui-scale` density multiplier. */
  fontSize: number;
  /** Which of `FONT_FAMILIES` to render in. */
  fontFamily: TerminalFontId;
  /** How much of the prompt to draw before the `$`. */
  promptStyle: PromptStyle;
  /** Alias name -> command string, fed into `ShellContext.aliases`. */
  aliases: Record<string, string>;
  addHistory: (command: string) => void;
  clearHistory: () => void;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  setFontFamily: (id: TerminalFontId) => void;
  setPromptStyle: (style: PromptStyle) => void;
  setAlias: (name: string, expansion: string) => void;
  removeAlias: (name: string) => void;
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      history: [],
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: DEFAULT_FONT_FAMILY,
      promptStyle: DEFAULT_PROMPT_STYLE,
      aliases: {},

      addHistory: command =>
        set(state => ({ history: pushHistory(state.history, command) })),

      clearHistory: () => set({ history: [] }),

      setFontSize: size => set({ fontSize: clampFontSize(size) }),

      increaseFontSize: () => set({ fontSize: stepFontSize(get().fontSize, 1) }),

      decreaseFontSize: () => set({ fontSize: stepFontSize(get().fontSize, -1) }),

      setFontFamily: id => set({ fontFamily: id }),

      setPromptStyle: style => set({ promptStyle: style }),

      setAlias: (name, expansion) =>
        set(state => ({ aliases: { ...state.aliases, [name]: expansion } })),

      removeAlias: (name) => {
        const { [name]: _removed, ...rest } = get().aliases;
        set({ aliases: rest });
      },
    }),
    {
      name: "kagami-terminal",
      version: 2,
      /**
       * v1 → v2 adds the appearance prefs. zustand would merge the missing
       * keys from the initial state anyway; the migration is explicit so a
       * corrupted stored value (hand-edited, or from a build where the ids
       * differed) is replaced rather than rendered as a broken font stack.
       *
       * v1 is the only shape this build knows how to carry forward —
       * anything else (a downgrade, a mangled file) starts clean rather
       * than being adopted blindly.
       */
      migrate: (persisted, version) => {
        const defaults: Partial<TerminalStore> = {
          history: [],
          fontSize: DEFAULT_FONT_SIZE,
          fontFamily: DEFAULT_FONT_FAMILY,
          promptStyle: DEFAULT_PROMPT_STYLE,
          aliases: {},
        };
        const saved = persisted as Partial<TerminalStore> | null;
        if (version !== 1 || saved === null || typeof saved !== "object")
          return defaults as TerminalStore;
        return {
          ...saved,
          fontFamily: FONT_FAMILIES.some(f => f.id === saved.fontFamily) ? saved.fontFamily : DEFAULT_FONT_FAMILY,
          promptStyle: PROMPT_STYLES.some(p => p.id === saved.promptStyle) ? saved.promptStyle : DEFAULT_PROMPT_STYLE,
        } as TerminalStore;
      },
    },
  ),
);
