/**
 * U14: a single macOS-style color label per node — one of a small fixed
 * swatch set, not a full multi-tag system (see the step-15 plan's scope note:
 * "the smaller of the two options the roadmap itself left open"). Pure data
 * + validation so the store action and the context-menu UI share one source
 * of truth for "what's a legal label."
 */
export interface NodeLabel {
  id: string;
  name: string;
  /**
   * Swatch dot color — a CSS color, not a design token, since these are
   * user-facing category colors independent of the accent/theme system.
   */
  hex: string;
}

export const NODE_LABELS: NodeLabel[] = [
  { id: "red", name: "Red", hex: "#ff6b6b" },
  { id: "orange", name: "Orange", hex: "#ff9f5a" },
  { id: "yellow", name: "Yellow", hex: "#f5cc4d" },
  { id: "green", name: "Green", hex: "#5ec98a" },
  { id: "blue", name: "Blue", hex: "#5b9dff" },
  { id: "purple", name: "Purple", hex: "#b18cf0" },
  { id: "gray", name: "Gray", hex: "#9aa3ad" },
];

const LABEL_IDS: ReadonlySet<string> = new Set(NODE_LABELS.map(l => l.id));

/** Is `label` one of the fixed swatch ids? Guards `fsStore.setLabel` against bad input reaching persisted nodes. */
export function isValidNodeLabel(label: string): boolean {
  return LABEL_IDS.has(label);
}

export function nodeLabelById(id: string | undefined): NodeLabel | undefined {
  return id ? NODE_LABELS.find(l => l.id === id) : undefined;
}
