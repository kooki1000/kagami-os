/**
 * Selected-state ring for a round color swatch (a `<input type="color">` or a
 * plain color-preview button) — a `--surface`-colored gap then an `--accent`
 * ring, both via `box-shadow` rather than Tailwind's `ring-*` utilities so the
 * gap can be the page background instead of a fixed color. `ringPx` scales
 * with the swatch's own size (Paint's ~18px palette swatches use a thinner
 * ring than Settings' larger ~26px custom-accent input) so the ring reads as
 * proportionate rather than identical regardless of swatch size.
 */
export function swatchRingClass(active: boolean, ringPx: 3 | 4 = 4): string {
  return active ? `shadow-[0_0_0_2px_var(--surface),0_0_0_${ringPx}px_var(--accent)]` : "";
}
