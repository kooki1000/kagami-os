import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import type { SegmentOption } from "@/components/ui/Segmented";
import type { WallpaperTone } from "@/design/color";
import type { UiScale } from "@/design/tokens";
import type { AppWindowProps } from "@/system/apps/types";
import type { DesktopIconSize } from "@/system/desktop/desktopLayout";
import type { DockPosition, DockSize } from "@/system/dock/dockStore";
import type { SortKey } from "@/system/fs/fsStore";
import type { LookPreset, MaterialLevel, WallpaperFit } from "@/system/settings/palettes";
import type { MenuBarStatusItem, ReduceMotionPreference } from "@/system/settings/settingsStore";
import type { ChordDescriptor } from "@/system/shortcuts";
import type { ResolvedTheme, ThemePreference } from "@/system/theme/themeStore";
import { Check, ChevronRight, Clock, FileType, Info, Keyboard, LayoutGrid, Monitor, Palette, Power, SlidersHorizontal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { SEARCH_ENGINES } from "@/apps/browser/searchEngines";
import { exportDisk, importDisk } from "@/apps/files/exportImport";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { useArmedConfirm } from "@/components/ui/useArmedConfirm";
import { checkAccentContrast, WCAG_AA_NORMAL_TEXT } from "@/design/color";
import { formatShortcut } from "@/lib/format";
import { launchApp } from "@/system/apps/launch";
import { candidateAppsForMime } from "@/system/apps/openFile";
import { apps, getApp } from "@/system/apps/registry";
import { useDesktopLayoutStore } from "@/system/desktop/desktopLayoutStore";
import { useDockStore } from "@/system/dock/dockStore";
import { effectiveDefault, FLAGS, hasFlagOverride, isFlagEnabled, setFlagOverride } from "@/system/flags";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { PICTURES_ID } from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import {
  lookById,
  LOOKS,
  resolveAccentTone,
  resolveWallpaperStyleId,
  resolveWallpaperTone,
} from "@/system/settings/palettes";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useWallpaperUrl } from "@/system/settings/wallpaperBlobUrl";
import { PREVIEW_WALL_TILE, WALLPAPER_STYLES, wallpaperStyleVars } from "@/system/settings/wallpaperStyles";
import { SHELL_CHORD_DESCRIPTIONS, WINDOW_CHORDS } from "@/system/shortcuts";
import { usePersistentStorageStatus } from "@/system/storage/persistence";
import { useThemeStore } from "@/system/theme/themeStore";

type Section = "appearance" | "dock" | "desktop" | "defaultApps" | "menuBar" | "startup" | "shortcuts" | "general" | "about";

const NAV: Array<{ id: Section; label: string; icon: typeof Palette }> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "dock", label: "Dock", icon: Monitor },
  { id: "desktop", label: "Desktop", icon: LayoutGrid },
  { id: "defaultApps", label: "Default Apps", icon: FileType },
  { id: "menuBar", label: "Menu Bar", icon: Clock },
  { id: "startup", label: "Startup", icon: Power },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "about", label: "About", icon: Info },
];

/**
 * Reads `{ section }` from a launch payload (used by the welcome tour to
 * jump straight to, e.g., the accent picker) — `null` for a bare launch or
 * anything that isn't a recognized section id.
 */
function payloadSection(payload: unknown): Section | null {
  if (
    payload
    && typeof payload === "object"
    && "section" in payload
    && typeof (payload as { section: unknown }).section === "string"
  ) {
    const value = (payload as { section: string }).section;
    return NAV.some(item => item.id === value) ? (value as Section) : null;
  }
  return null;
}

/** Divider class for a row in a hairline-bordered list — every row but the last. */
function dividerExceptLast(index: number, length: number): string {
  return index < length - 1 ? "hairline-b" : "";
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4 hairline-b">
      <div className="mb-2.5 text-12.5 font-semibold text-ink">{label}</div>
      {children}
    </div>
  );
}

/** A labelled sub-control inside a {@link Disclosure} — quieter than a `Row`. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block text-11.5 text-ink-2">{label}</span>
      {children}
    </div>
  );
}

/**
 * A collapsed-by-default section. Appearance's fine-tuning lives behind one of
 * these: the curated looks are the control almost everyone wants, and burying
 * the per-axis overrides keeps the pane from reading as a wall of knobs.
 */
function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-5 py-4 hairline-b">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-1 text-12.5 font-semibold text-ink"
        onClick={() => setOpen(value => !value)}
      >
        <ChevronRight
          className={`size-[calc(13px*var(--ui-scale))] text-ink-2 transition-transform ${open ? "rotate-90" : ""}`}
        />
        {label}
      </button>
      {open && <div className="mt-4 flex flex-col gap-4">{children}</div>}
    </div>
  );
}

interface PreviewOption<T> {
  value: T;
  label: string;
  /** Optional second line under the label. */
  hint?: string;
  preview: ReactNode;
}

/**
 * Single-select over a row of visual previews — the looks, and the wallpaper
 * designs. A real `radiogroup` rather than a row of buttons: it's a
 * one-of-many choice, so arrow keys should move between the options and only
 * the selected one should be a tab stop.
 */
function PreviewGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  columns,
  aspect,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: PreviewOption<T>[];
  columns: number;
  aspect: string;
}) {
  const buttonElsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // Never leave the group untabbable if `value` matches nothing.
  const activeIndex = Math.max(0, options.findIndex(option => option.value === value));

  function handleKeyDown(event: React.KeyboardEvent, index: number): void {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (delta === 0)
      return;
    event.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    buttonElsRef.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => { buttonElsRef.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === activeIndex ? 0 : -1}
            title={option.hint ?? option.label}
            className="group text-left"
            onClick={() => onChange(option.value)}
            onKeyDown={event => handleKeyDown(event, index)}
          >
            <div
              className={`relative overflow-hidden rounded-[9px] transition-shadow ${aspect} ${
                selected
                  ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]"
                  : "hairline group-hover:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ph-2)]"
              }`}
            >
              {option.preview}
              {selected && (
                <span className="absolute right-1 bottom-1 flex size-[calc(14px*var(--ui-scale))] items-center justify-center rounded-full bg-accent-strong">
                  <Check className="size-[calc(9px*var(--ui-scale))] text-white" strokeWidth={3.5} />
                </span>
              )}
            </div>
            <span className={`mt-1.5 block truncate text-11.5 ${selected ? "font-semibold text-ink" : "text-ink-2"}`}>
              {option.label}
            </span>
            {option.hint && (
              <span className="block truncate text-11 text-ink-2">{option.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Paints a wallpaper style at preview size. `--wall-tile` shrinks the tiled
 * geometry (Contour's rings, Halftone's dots) in proportion to the box, so a
 * 130px-wide card shows the same design rather than one over-scaled corner of
 * it — the reason wallpaperStyles.ts emits percentages instead of `vmax`.
 */
function WallpaperPreview({ styleId, tone }: { styleId: string; tone: WallpaperTone }) {
  const vars = wallpaperStyleVars(styleId, tone);
  return (
    <div
      className="wallpaper"
      style={{ "--wall-tile": PREVIEW_WALL_TILE, ...vars } as CSSProperties}
    />
  );
}

/**
 * A look's preview: the desktop it actually produces, in miniature — its
 * wallpaper, and a window carrying its control duotone. Chrome and surface
 * come from live vars, so the card also tracks the current theme and material.
 */
function LookMiniature({ look, theme, customAccentHex }: {
  look: LookPreset;
  theme: ResolvedTheme;
  customAccentHex: string | null;
}) {
  return (
    <>
      <WallpaperPreview
        styleId={look.wallpaperStyleId}
        tone={resolveWallpaperTone(look, theme, customAccentHex)}
      />
      <div className="absolute inset-x-0 top-0 h-[13%] chrome" />
      <div
        className="absolute top-[32%] left-[16%] h-[56%] w-[66%] overflow-hidden rounded-[4px] bg-surface"
        style={{ boxShadow: "0 3px 8px -2px rgba(0,0,0,.4)" }}
      >
        <div className="flex h-[26%] items-center gap-[2px] px-[3px] chrome-2">
          {[look.controls.close, look.controls.minimize, look.controls.zoom].map(color => (
            <span key={color} className="size-[3px] rounded-full" style={{ background: color }} />
          ))}
        </div>
      </div>
    </>
  );
}

const MATERIAL_OPTIONS: SegmentOption<MaterialLevel>[] = [
  { value: "clear", label: "Clear" },
  { value: "frosted", label: "Frosted" },
  { value: "opaque", label: "Opaque" },
];

const WALLPAPER_FIT_OPTIONS: SegmentOption<WallpaperFit>[] = [
  { value: "fill", label: "Fill" },
  { value: "fit", label: "Fit" },
  { value: "centre", label: "Centre" },
  { value: "tile", label: "Tile" },
];

const REDUCE_MOTION_OPTIONS: SegmentOption<ReduceMotionPreference>[] = [
  { value: "system", label: "System" },
  { value: "on", label: "Reduce" },
  { value: "off", label: "Full" },
];

const ANIMATION_SPEED_OPTIONS: SegmentOption<number>[] = [
  { value: 0.5, label: "Slower" },
  { value: 1, label: "Normal" },
  { value: 2, label: "Faster" },
];

/**
 * WCAG surface hex per theme, for U2's contrast warning —
 * `checkAccentContrast` needs literal hex, not a live `--surface` CSS var, so
 * these are transcribed from `global.css`'s `:root`/`[data-theme='dark']`
 * blocks. Keep in sync if those tokens ever change. (The second pair the check
 * reports is white-on-`--accent-strong`, which it derives itself.)
 */
const SURFACE_HEX: Record<ResolvedTheme, string> = { light: "#faf8f4", dark: "#201e1a" };

/**
 * U2's picker: a native color input (styled as a round swatch) plus a
 * non-blocking WCAG AA contrast warning. Picking a look (`setLook`) clears
 * this override in the store, so the two never fight over which one wins.
 * The chosen color drives the wallpaper's tones as well as the accent, so
 * there's no way to land on a color that clashes with the desktop.
 */
function CustomAccentPicker() {
  const lookId = useSettingsStore(s => s.lookId);
  const customAccentHex = useSettingsStore(s => s.customAccentHex);
  const setCustomAccentHex = useSettingsStore(s => s.setCustomAccentHex);
  const resolvedTheme = useThemeStore(s => s.resolved);

  const swatchHex = resolveAccentTone(lookById(lookId), resolvedTheme, customAccentHex).accent;
  const contrast = customAccentHex
    ? checkAccentContrast(customAccentHex, SURFACE_HEX[resolvedTheme])
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <input
        type="color"
        aria-label="Custom accent color"
        title="Custom accent color"
        className={`size-[calc(26px*var(--ui-scale))] cursor-pointer rounded-full border-[1.5px] border-black/10 bg-transparent p-0 ${
          customAccentHex
            ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]"
            : ""
        }`}
        value={swatchHex}
        onChange={e => setCustomAccentHex(e.target.value)}
      />
      <span className="text-11.5 text-ink-2">
        {customAccentHex ? "Your color" : "Using the look’s color"}
      </span>
      {customAccentHex && (
        <button
          type="button"
          className="text-11.5 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          onClick={() => setCustomAccentHex(null)}
        >
          Reset to look
        </button>
      )}
      {contrast && !contrast.passes && (
        <p className="basis-full text-11 text-accent-2">
          Low contrast against the app background — may be hard to read (WCAG AA needs
          {" "}
          {WCAG_AA_NORMAL_TEXT}
          :1).
        </p>
      )}
    </div>
  );
}

/**
 * U1's per-theme custom wallpaper slot: "Choose from Files…" reuses the
 * same native-picker → VFS-write pattern as Settings' own disk import
 * (`BackupSection` below) and Files' own upload flow — there's no separate
 * in-app VFS browse dialog to reuse instead, so an image dropped here lands
 * in Pictures like any other upload, and the resulting node id is what's
 * actually stored (`wallpaperFileId`). The thumbnail is the same resolved
 * blob URL `wallpaperBlobUrl.ts` feeds the desktop itself.
 */
function CustomWallpaperSlot({ theme, label }: { theme: ResolvedTheme; label: string }) {
  const fileId = useSettingsStore(s => s.wallpaperFileId[theme]);
  const setWallpaperFile = useSettingsStore(s => s.setWallpaperFile);
  const url = useWallpaperUrl(theme);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handlePick(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file)
      return;
    setBusy(true);
    try {
      const node = await useFsStore.getState().createBlobFile(PICTURES_ID, file.name, file, file.type || undefined);
      setWallpaperFile(theme, node.id);
    }
    catch (error) {
      notify({
        title: "Couldn’t set wallpaper",
        body: error instanceof Error ? error.message : `“${file.name}” couldn’t be used as a wallpaper.`,
        tone: "danger",
      });
    }
    finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-[calc(10px*var(--ui-scale))]">
      <div
        className="h-[calc(44px*var(--ui-scale))] w-[calc(68px*var(--ui-scale))] flex-none rounded-[9px] bg-ph bg-cover bg-center hairline"
        style={url ? { backgroundImage: `url("${url}")` } : undefined}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-11.5 font-medium text-ink-2">{label}</span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={busy}
            className="rounded-btn bg-ph px-[calc(8px*var(--ui-scale))] py-[calc(4px*var(--ui-scale))] text-11 font-medium text-ink hover:bg-ph-2 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Adding…" : "Choose from Files…"}
          </button>
          {fileId && (
            <button
              type="button"
              className="rounded-btn px-[calc(8px*var(--ui-scale))] py-[calc(4px*var(--ui-scale))] text-11 font-medium text-ink-2 hover:bg-ph hover:text-ink"
              onClick={() => setWallpaperFile(theme, null)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={e => void handlePick(e)} />
    </div>
  );
}

function AppearanceSection() {
  const preference = useThemeStore(s => s.preference);
  const setPreference = useThemeStore(s => s.setPreference);
  const resolvedTheme = useThemeStore(s => s.resolved);
  const lookId = useSettingsStore(s => s.lookId);
  const setLook = useSettingsStore(s => s.setLook);
  const customAccentHex = useSettingsStore(s => s.customAccentHex);
  const wallpaperStyleId = useSettingsStore(s => s.wallpaperStyleId);
  const setWallpaperStyle = useSettingsStore(s => s.setWallpaperStyle);
  const materialLevel = useSettingsStore(s => s.materialLevel);
  const setMaterialLevel = useSettingsStore(s => s.setMaterialLevel);
  const wallpaperFit = useSettingsStore(s => s.wallpaperFit);
  const setWallpaperFit = useSettingsStore(s => s.setWallpaperFit);
  const uiScale = useSettingsStore(s => s.uiScale);
  const setUiScale = useSettingsStore(s => s.setUiScale);
  const reduceMotion = useSettingsStore(s => s.reduceMotion);
  const setReduceMotion = useSettingsStore(s => s.setReduceMotion);
  const animationSpeed = useSettingsStore(s => s.animationSpeed);
  const setAnimationSpeed = useSettingsStore(s => s.setAnimationSpeed);
  const wallpaperDim = useSettingsStore(s => s.wallpaperDim);
  const setWallpaperDim = useSettingsStore(s => s.setWallpaperDim);

  const look = lookById(lookId);
  const activeStyleId = resolveWallpaperStyleId(look, wallpaperStyleId);
  // A custom image replaces the procedural artwork for whichever theme it's
  // set on, which would otherwise make the style picker look broken.
  const imageWins = Boolean(useWallpaperUrl(resolvedTheme));

  // Each OKLCH derivation below is real work (gamut-mapping conversions,
  // gradient-string rebuilding) — memoized so dragging an unrelated control
  // (wallpaper dim, animation speed, …) doesn't redo it on every render.
  const tone = useMemo(
    () => resolveWallpaperTone(look, resolvedTheme, customAccentHex),
    [look, resolvedTheme, customAccentHex],
  );
  const lookOptions = useMemo(
    () => LOOKS.map(entry => ({
      value: entry.id,
      label: entry.name,
      hint: entry.tagline,
      preview: <LookMiniature look={entry} theme={resolvedTheme} customAccentHex={customAccentHex} />,
    })),
    [resolvedTheme, customAccentHex],
  );
  const wallpaperStyleOptions = useMemo(
    () => WALLPAPER_STYLES.map(style => ({
      value: style.id,
      label: style.name,
      preview: <WallpaperPreview styleId={style.id} tone={tone} />,
    })),
    [tone],
  );

  return (
    <>
      <Row label="Theme">
        <Segmented<ThemePreference>
          width={240}
          value={preference}
          onChange={setPreference}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "auto", label: "Auto" },
          ]}
        />
      </Row>

      <Row label="Look">
        <PreviewGroup<string>
          label="Look"
          columns={LOOKS.length}
          aspect="aspect-[13/8]"
          value={lookId}
          onChange={setLook}
          options={lookOptions}
        />
      </Row>

      <Disclosure label="Customize">
        <Field label="Accent">
          <CustomAccentPicker />
        </Field>

        <Field label="Wallpaper">
          <PreviewGroup<string>
            label="Wallpaper design"
            columns={WALLPAPER_STYLES.length}
            aspect="aspect-[4/3]"
            value={activeStyleId}
            onChange={setWallpaperStyle}
            options={wallpaperStyleOptions}
          />
          {imageWins && (
            <p className="mt-2 text-11 text-ink-2">
              Your own image is showing instead. Clear it below to see this design.
            </p>
          )}
        </Field>

        <Field label="Your image">
          <div className="flex flex-col gap-3">
            <CustomWallpaperSlot theme="light" label="Light" />
            <CustomWallpaperSlot theme="dark" label="Dark" />
            <div>
              <span className="mb-1.5 block text-11.5 text-ink-2">Fit</span>
              <Segmented<WallpaperFit> width={240} value={wallpaperFit} onChange={setWallpaperFit} options={WALLPAPER_FIT_OPTIONS} />
            </div>
          </div>
        </Field>

        <Field label="Dimming">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={wallpaperDim}
              aria-label="Wallpaper dimming"
              style={{ accentColor: "var(--accent)" }}
              className="h-1 w-[200px]"
              onChange={e => setWallpaperDim(Number(e.target.value))}
            />
            <span className="w-9 text-11.5 text-ink-2 tabular-nums">
              {Math.round(wallpaperDim * 100)}
              %
            </span>
          </div>
        </Field>
      </Disclosure>

      <Row label="Material">
        <Segmented<MaterialLevel>
          width={240}
          value={materialLevel}
          onChange={setMaterialLevel}
          options={MATERIAL_OPTIONS}
        />
      </Row>

      <Row label="Interface density">
        <Segmented<UiScale>
          width={240}
          value={uiScale}
          onChange={setUiScale}
          options={[
            { value: "small", label: "Small" },
            { value: "default", label: "Default" },
            { value: "large", label: "Large" },
          ]}
        />
      </Row>

      <Row label="Reduce motion">
        <Segmented<ReduceMotionPreference>
          width={240}
          value={reduceMotion}
          onChange={setReduceMotion}
          options={REDUCE_MOTION_OPTIONS}
        />
      </Row>

      <Row label="Animation speed">
        <Segmented<number>
          width={240}
          value={animationSpeed}
          onChange={setAnimationSpeed}
          options={ANIMATION_SPEED_OPTIONS}
        />
      </Row>
    </>
  );
}

function DockSection() {
  const size = useDockStore(s => s.size);
  const setSize = useDockStore(s => s.setSize);
  const position = useDockStore(s => s.position);
  const setPosition = useDockStore(s => s.setPosition);

  return (
    <>
      <Row label="Size">
        <Segmented<DockSize>
          width={240}
          value={size}
          onChange={setSize}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
        />
      </Row>
      <Row label="Position on screen">
        <Segmented<DockPosition>
          width={240}
          value={position}
          onChange={setPosition}
          options={[
            { value: "bottom", label: "Bottom" },
            { value: "left", label: "Left" },
            { value: "right", label: "Right" },
          ]}
        />
      </Row>
    </>
  );
}

/** A hairline-bordered list matching FlagsDebug/AboutSection's row shape, for any section listing several like items with a control on the right. */
function ListRow({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[12px] bg-surface-2 hairline">{children}</div>;
}

function ListRowItem({ index, length, children }: { index: number; length: number; children: ReactNode }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-[calc(14px*var(--ui-scale))] py-[calc(9px*var(--ui-scale))] ${dividerExceptLast(index, length)}`}>
      {children}
    </div>
  );
}

/** U8 — desktop icon layout preferences (size, sort, auto-arrange, grid snap). */
function DesktopSection() {
  const iconSize = useDesktopLayoutStore(s => s.iconSize);
  const setIconSize = useDesktopLayoutStore(s => s.setIconSize);
  const sortOrder = useDesktopLayoutStore(s => s.sortOrder);
  const setSortOrder = useDesktopLayoutStore(s => s.setSortOrder);
  const autoArrange = useDesktopLayoutStore(s => s.autoArrange);
  const setAutoArrange = useDesktopLayoutStore(s => s.setAutoArrange);
  const gridSnap = useDesktopLayoutStore(s => s.gridSnap);
  const setGridSnap = useDesktopLayoutStore(s => s.setGridSnap);

  return (
    <>
      <Row label="Icon size">
        <Segmented<DesktopIconSize>
          width={240}
          value={iconSize}
          onChange={setIconSize}
          options={[
            { value: "small", label: "Small" },
            { value: "medium", label: "Medium" },
            { value: "large", label: "Large" },
          ]}
        />
      </Row>
      <Row label="Sort by">
        <Segmented<SortKey>
          width={240}
          value={sortOrder}
          onChange={setSortOrder}
          options={[
            { value: "name", label: "Name" },
            { value: "date", label: "Date" },
            { value: "kind", label: "Kind" },
          ]}
        />
      </Row>
      <Row label="Auto-arrange">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">
            Keep icons snapped to a tidy grid in sort order, ignoring any
            manual dragging.
          </p>
          <Switch checked={autoArrange} onChange={setAutoArrange} label="Auto-arrange desktop icons" />
        </div>
      </Row>
      <Row label="Snap to grid">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">
            Snap a dragged icon to the nearest grid cell instead of dropping
            it exactly where you release it.
          </p>
          <Switch checked={gridSnap} onChange={setGridSnap} label="Snap dragged icons to grid" />
        </div>
      </Row>
    </>
  );
}

// U5 — representative mime types shown even before any "Open With" override
// exists anywhere, one per built-in family default (openFile.ts's
// FAMILY_DEFAULTS). A real per-file "Open With" pick elsewhere adds its own
// row below these for the exact mime type it set.
const FILE_ASSOCIATION_TYPES: Array<{ mime: string; label: string }> = [
  { mime: "text/plain", label: "Text documents" },
  { mime: "image/png", label: "Images" },
  { mime: "audio/mpeg", label: "Audio" },
  { mime: "video/mp4", label: "Video" },
];

/** U5 — default app per file type, mirroring Files/Desktop's "Open With" picker. */
function DefaultAppsSection() {
  const fileAssociations = useSettingsStore(s => s.fileAssociations);
  const setFileAssociation = useSettingsStore(s => s.setFileAssociation);
  const clearFileAssociation = useSettingsStore(s => s.clearFileAssociation);

  const extraMimes = Object.keys(fileAssociations).filter(
    mime => !FILE_ASSOCIATION_TYPES.some(t => t.mime === mime),
  );
  const rows = [...FILE_ASSOCIATION_TYPES, ...extraMimes.map(mime => ({ mime, label: mime }))];

  return (
    <Row label="Default apps">
      <p className="mb-3 text-12/relaxed text-ink-2">
        Choose which app opens each kind of file by default. Using "Open
        With" on an individual file elsewhere adds its own row here.
      </p>
      <ListRow>
        {rows.map((row, i) => {
          const candidates = candidateAppsForMime(row.mime);
          const current = fileAssociations[row.mime] ?? candidates[0] ?? "";
          const overridden = row.mime in fileAssociations;
          return (
            <ListRowItem key={row.mime} index={i} length={rows.length}>
              <div className="min-w-0">
                <div className="truncate text-12 font-medium text-ink">{row.label}</div>
                <div className="truncate text-11 text-ink-2">{row.mime}</div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {candidates.length > 0
                  ? (
                      <select
                        aria-label={`Default app for ${row.label}`}
                        className="rounded-btn border-0 bg-ph px-[calc(8px*var(--ui-scale))] py-[calc(4px*var(--ui-scale))] text-11.5 text-ink"
                        value={current}
                        onChange={e => setFileAssociation(row.mime, e.target.value)}
                      >
                        {candidates.map(appId => (
                          <option key={appId} value={appId}>{getApp(appId)?.name ?? appId}</option>
                        ))}
                      </select>
                    )
                  : <span className="text-11.5 text-ink-2">No app available</span>}
                {overridden && (
                  <button
                    type="button"
                    className="rounded-btn px-[calc(6px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] text-[calc(10.5px*var(--ui-scale))] font-medium text-ink-2 hover:bg-ph hover:text-ink"
                    onClick={() => clearFileAssociation(row.mime)}
                  >
                    Reset
                  </button>
                )}
              </div>
            </ListRowItem>
          );
        })}
      </ListRow>
    </Row>
  );
}

const STATUS_ITEM_LABELS: Record<MenuBarStatusItem, string> = {
  offline: "Offline indicator",
  search: "Search",
  appearance: "Appearance toggle",
  notifications: "Notifications",
  clock: "Clock",
};

/** U7 — clock format/visibility and which status items appear in the menu bar. */
function MenuBarSection() {
  const clockHour12 = useSettingsStore(s => s.clockHour12);
  const setClockHour12 = useSettingsStore(s => s.setClockHour12);
  const clockShowSeconds = useSettingsStore(s => s.clockShowSeconds);
  const setClockShowSeconds = useSettingsStore(s => s.setClockShowSeconds);
  const clockShowDate = useSettingsStore(s => s.clockShowDate);
  const setClockShowDate = useSettingsStore(s => s.setClockShowDate);
  const statusItems = useSettingsStore(s => s.statusItems);
  const setStatusItemEnabled = useSettingsStore(s => s.setStatusItemEnabled);

  const statusItemIds = Object.keys(STATUS_ITEM_LABELS) as MenuBarStatusItem[];

  return (
    <>
      <Row label="Clock format">
        <Segmented<"12" | "24">
          width={180}
          value={clockHour12 ? "12" : "24"}
          onChange={value => setClockHour12(value === "12")}
          options={[
            { value: "12", label: "12-hour" },
            { value: "24", label: "24-hour" },
          ]}
        />
      </Row>
      <Row label="Show seconds">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">Add a trailing :SS to the menu bar clock.</p>
          <Switch checked={clockShowSeconds} onChange={setClockShowSeconds} label="Show seconds in the clock" />
        </div>
      </Row>
      <Row label="Show date">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">Show the weekday before the time.</p>
          <Switch checked={clockShowDate} onChange={setClockShowDate} label="Show the weekday in the menu bar" />
        </div>
      </Row>
      <Row label="Status items">
        <ListRow>
          {statusItemIds.map((item, i) => (
            <ListRowItem key={item} index={i} length={statusItemIds.length}>
              <span className="text-12 text-ink">{STATUS_ITEM_LABELS[item]}</span>
              <Switch
                checked={statusItems[item]}
                onChange={value => setStatusItemEnabled(item, value)}
                label={`Show ${STATUS_ITEM_LABELS[item]}`}
              />
            </ListRowItem>
          ))}
        </ListRow>
      </Row>
    </>
  );
}

/** U9 — session restore, apps launched at boot, and remembered per-app window sizes. */
function StartupSection() {
  const restoreSessionOnBoot = useSettingsStore(s => s.restoreSessionOnBoot);
  const setRestoreSessionOnBoot = useSettingsStore(s => s.setRestoreSessionOnBoot);
  const startupApps = useSettingsStore(s => s.startupApps);
  const setStartupAppEnabled = useSettingsStore(s => s.setStartupAppEnabled);
  const defaultWindowSize = useSettingsStore(s => s.defaultWindowSize);
  const clearDefaultWindowSize = useSettingsStore(s => s.clearDefaultWindowSize);

  const rememberedSizes = Object.entries(defaultWindowSize);

  return (
    <>
      <Row label="Session restore">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">
            Reopen the windows you had open the last time you quit.
          </p>
          <Switch
            checked={restoreSessionOnBoot}
            onChange={setRestoreSessionOnBoot}
            label="Restore previous session on startup"
          />
        </div>
      </Row>
      <Row label="Open at startup">
        <ListRow>
          {apps.map((app, i) => (
            <ListRowItem key={app.id} index={i} length={apps.length}>
              <span className="text-12 text-ink">{app.name}</span>
              <Switch
                checked={startupApps.includes(app.id)}
                onChange={value => setStartupAppEnabled(app.id, value)}
                label={`Launch ${app.name} at startup`}
              />
            </ListRowItem>
          ))}
        </ListRow>
      </Row>
      {rememberedSizes.length > 0 && (
        <Row label="Remembered window sizes">
          <p className="mb-3 text-12/relaxed text-ink-2">
            Set from an app's menu ("Remember Window Size") — that size opens
            in place of the app's own default from then on.
          </p>
          <ListRow>
            {rememberedSizes.map(([appId, size], i) => (
              <ListRowItem key={appId} index={i} length={rememberedSizes.length}>
                <div className="min-w-0">
                  <div className="truncate text-12 font-medium text-ink">{getApp(appId)?.name ?? appId}</div>
                  <div className="text-11 text-ink-2">
                    {size.width}
                    {" × "}
                    {size.height}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded-btn px-[calc(8px*var(--ui-scale))] py-[calc(4px*var(--ui-scale))] text-11 font-medium text-ink-2 hover:bg-ph hover:text-ink"
                  onClick={() => clearDefaultWindowSize(appId)}
                >
                  Forget
                </button>
              </ListRowItem>
            ))}
          </ListRow>
        </Row>
      )}
    </>
  );
}

/** A single app's shortcut list for U10's Shortcuts section — filters out menu items with no `shortcut` at all. */
function appChordDescriptors(menus: { title: string; items: { label: string; shortcut?: string }[] }[]): ChordDescriptor[] {
  return menus.flatMap(section =>
    section.items
      .filter((item): item is { label: string; shortcut: string } => Boolean(item.shortcut))
      .map(item => ({ shortcut: item.shortcut, description: item.label })),
  );
}

function ShortcutGroup({ title, items }: { title: string; items: ChordDescriptor[] }) {
  if (items.length === 0)
    return null;
  return (
    <Row label={title}>
      <ListRow>
        {items.map((item, i) => (
          <ListRowItem key={item.shortcut + item.description} index={i} length={items.length}>
            <span className="text-12 text-ink">{item.description}</span>
            <span className="rounded-[6px] bg-ph px-[calc(7px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] font-mono text-11 text-ink-2">
              {formatShortcut(item.shortcut)}
            </span>
          </ListRowItem>
        ))}
      </ListRow>
    </Row>
  );
}

/** U10 — read-only reference listing every shortcut the shell and focused-app menus expose. Rebinding is a separate, larger item (ROADMAP.md U10). */
function ShortcutsSection() {
  return (
    <>
      <ShortcutGroup title="System" items={SHELL_CHORD_DESCRIPTIONS} />
      <ShortcutGroup title="Window management" items={WINDOW_CHORDS} />
      {apps.map(app => (
        <ShortcutGroup key={app.id} title={app.name} items={appChordDescriptors(app.menus ?? [])} />
      ))}
    </>
  );
}

/** U17 — the Browser's search engine, which is also the page it opens on. */
const SEARCH_ENGINE_OPTIONS: SegmentOption<string>[] = SEARCH_ENGINES.map(engine => ({
  value: engine.id,
  label: engine.name,
}));

function GeneralSection() {
  const autoEmptyTrash = useSettingsStore(s => s.autoEmptyTrash);
  const setAutoEmptyTrash = useSettingsStore(s => s.setAutoEmptyTrash);
  const searchEngineId = useSettingsStore(s => s.browserSearchEngineId);
  const setSearchEngine = useSettingsStore(s => s.setBrowserSearchEngine);

  return (
    <>
      <Row label="Search engine">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">
            Where the Browser sends anything typed into the address bar that
            isn't a web address. New Browser windows open here too.
          </p>
          <Segmented
            options={SEARCH_ENGINE_OPTIONS}
            value={searchEngineId}
            onChange={setSearchEngine}
          />
        </div>
      </Row>
      <Row label="Trash">
        <div className="flex items-center justify-between gap-4">
          <p className="text-12/relaxed text-ink-2">
            Empty the Trash automatically, removing items more than 30 days old
            when the desktop starts.
          </p>
          <Switch
            checked={autoEmptyTrash}
            onChange={setAutoEmptyTrash}
            label="Auto-empty Trash after 30 days"
          />
        </div>
      </Row>
      <BackupSection />
    </>
  );
}

/** How long "Import disk" stays armed after a file is picked before it disarms itself — same confirm-by-clicking-again shape as Files' Empty Trash. */
const IMPORT_CONFIRM_MS = 8000;

/**
 * Full-disk export/import (PR 3 of step 14 — the only backstop for Safari's
 * ~7-day IndexedDB eviction now that sync is retired). Export zips the
 * whole fs tree + blob bytes (not settings/theme/dock state); import is
 * destructive (wipe-then-restore), so picking a file arms a second
 * confirm click rather than replacing the disk on selection alone.
 */
function BackupSection() {
  const nodes = useFsStore(s => s.nodes);
  const replaceAll = useFsStore(s => s.replaceAll);
  const [exporting, setExporting] = useState(false);
  const { armed: pendingImport, arm: armImport, disarm: disarmImport } = useArmedConfirm<File>(IMPORT_CONFIRM_MS);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleExport(): Promise<void> {
    setExporting(true);
    try {
      await exportDisk(nodes, blobStore);
    }
    catch (error) {
      notify({
        title: "Export failed",
        body: error instanceof Error ? error.message : "The disk couldn’t be exported.",
        tone: "danger",
      });
    }
    finally {
      setExporting(false);
    }
  }

  function handlePick(e: ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (file)
      armImport(file);
  }

  async function handleConfirmImport(): Promise<void> {
    const file = pendingImport;
    if (!file)
      return;
    disarmImport();
    setImporting(true);
    try {
      const plan = await importDisk(file, { replaceAll });
      const fileCount = plan.nodes.filter(n => n.type === "file").length;
      notify({
        title: "Disk restored",
        body: `${fileCount} ${fileCount === 1 ? "file" : "files"} imported from “${file.name}”.`,
      });
    }
    catch (error) {
      notify({
        title: "Import failed",
        body: error instanceof Error ? error.message : "The disk couldn’t be restored.",
        tone: "danger",
      });
    }
    finally {
      setImporting(false);
    }
  }

  return (
    <Row label="Backup">
      <p className="mb-3 text-12/relaxed text-ink-2">
        Export everything in Files — every file and folder, including the
        Trash — as a single zip you can keep somewhere safe. Importing
        replaces the entire disk with what’s in the zip.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={exporting}
          className="rounded-btn bg-ph px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-11.5 font-medium text-ink hover:bg-ph-2 disabled:opacity-50"
          onClick={() => void handleExport()}
        >
          {exporting ? "Exporting…" : "Export disk"}
        </button>
        <button
          type="button"
          disabled={importing}
          className={`rounded-btn px-[calc(10px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-11.5 font-medium disabled:opacity-50 ${
            pendingImport ? "bg-accent-2-strong text-white" : "bg-ph text-ink hover:bg-ph-2"
          }`}
          onClick={() => {
            if (pendingImport)
              void handleConfirmImport();
            else
              inputRef.current?.click();
          }}
        >
          {importing
            ? "Importing…"
            : pendingImport
              ? "Click again to replace the disk"
              : "Import disk…"}
        </button>
        <input ref={inputRef} type="file" accept=".zip" hidden onChange={handlePick} />
      </div>
    </Row>
  );
}

function FlagsDebug() {
  // Flags aren't reactive (a device override applies on reload); bump local
  // state so the row reflects the click, and note that a reload is needed.
  const [tick, setTick] = useState(0);
  if (FLAGS.length === 0)
    return null;

  return (
    <div key={tick} className="mt-6 w-full max-w-72 text-left">
      <div className="mb-1.5 px-1 text-11 font-semibold tracking-wide text-ink-2 uppercase">
        Feature flags
      </div>
      <div className="overflow-hidden rounded-[12px] bg-surface-2 hairline">
        {FLAGS.map((flag, i) => {
          const on = isFlagEnabled(flag.id);
          return (
            <div
              key={flag.id}
              className={`flex items-center justify-between gap-3 px-[calc(14px*var(--ui-scale))] py-[calc(10px*var(--ui-scale))] ${dividerExceptLast(i, FLAGS.length)}`}
            >
              <div className="min-w-0">
                <div className="truncate text-12 font-medium text-ink">
                  {flag.label}
                  {hasFlagOverride(flag.id) && (
                    <span className="ml-1.5 text-[calc(10px*var(--ui-scale))] text-ink-2">(overridden)</span>
                  )}
                </div>
                <div className="truncate text-11 text-ink-2">{flag.description}</div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {hasFlagOverride(flag.id) && (
                  <button
                    type="button"
                    className="rounded-btn px-[calc(6px*var(--ui-scale))] py-[calc(2px*var(--ui-scale))] text-[calc(10.5px*var(--ui-scale))] font-medium text-ink-2 hover:bg-ph hover:text-ink"
                    onClick={() => {
                      setFlagOverride(flag.id, null);
                      setTick(n => n + 1);
                    }}
                  >
                    Reset to default
                  </button>
                )}
                <Switch
                  checked={on}
                  label={`Toggle ${flag.label}`}
                  onChange={(value) => {
                    // Toggling back to whatever the flag would resolve to
                    // anyway (review-backlog #14) clears the override
                    // instead of pinning a value that merely restates it —
                    // otherwise a flag toggled on then off stays pinned off
                    // per device forever, ignoring any future default/env
                    // change.
                    setFlagOverride(flag.id, value === effectiveDefault(flag.id) ? null : value);
                    setTick(n => n + 1);
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 px-1 text-11 text-ink-2">Reload to apply flag changes.</p>
    </div>
  );
}

function AboutSection() {
  const persisted = usePersistentStorageStatus();

  const storageLabel = persisted === null
    ? "Virtual file system (IndexedDB)"
    : `Virtual file system (IndexedDB, ${persisted ? "persistent" : "best-effort"})`;

  const facts: Array<[string, string]> = [
    ["Version", __APP_VERSION__],
    ["Engine", "React + TypeScript · Vite"],
    ["Storage", storageLabel],
  ];
  return (
    <div className="flex flex-col items-center px-6 py-8 text-center">
      <span className="size-14 rotate-45 rounded-[12px] bg-accent shadow-[0_10px_28px_-8px_var(--accent)]" />
      <h1 className="mt-5 text-[calc(24px*var(--ui-scale))] font-bold tracking-tight text-ink">Kagami OS</h1>
      <p className="mt-1 text-13 text-ink-2">A desktop that lives in your browser.</p>

      <div className="mt-6 w-full max-w-72 overflow-hidden rounded-[12px] bg-surface-2 hairline">
        {facts.map(([key, value], i) => (
          <div
            key={key}
            className={`flex items-center justify-between px-[calc(14px*var(--ui-scale))] py-2 text-12 ${dividerExceptLast(i, facts.length)}`}
          >
            <span className="text-ink-2">{key}</span>
            <span className="font-medium text-ink">{value}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-5 rounded-btn bg-ph px-[calc(12px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-11.5 font-medium text-ink hover:bg-ph-2"
        onClick={() => launchApp("welcome")}
      >
        Replay Tour
      </button>

      <FlagsDebug />

      <p className="mt-5 max-w-72 text-11.5/relaxed text-ink-2">
        An original desktop environment — no Apple or third-party OS code,
        assets, or trademarks. Icons by Lucide; typeface Inter.
      </p>
    </div>
  );
}

export default function SettingsApp({ payload }: AppWindowProps) {
  const [section, setSection] = useState<Section>(() => payloadSection(payload) ?? "appearance");
  // Settings is singleInstance — a re-launch (e.g. the welcome tour's "Open
  // Settings" step) reuses this window and hands it a fresh payload object
  // rather than remounting, so jump sections in response to that identity
  // change instead of only reading payload once (same pattern as
  // `usePayloadFileId` in filePayload.ts).
  const [lastPayload, setLastPayload] = useState(payload);
  if (payload !== lastPayload) {
    setLastPayload(payload);
    const next = payloadSection(payload);
    if (next)
      setSection(next);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-[150px] flex-none flex-col gap-[calc(2px*var(--ui-scale))] bg-surface-2 px-[calc(9px*var(--ui-scale))] py-3 select-none hairline-r">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex items-center gap-[calc(9px*var(--ui-scale))] rounded-[8px] px-[calc(9px*var(--ui-scale))] py-[calc(6px*var(--ui-scale))] text-left text-12.5 font-medium ${
                active
                  ? "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-accent"
                  : "text-ink-2 hover:bg-ph"
              }`}
              onClick={() => setSection(item.id)}
            >
              <Icon className="size-4 opacity-80" strokeWidth={1.8} />
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex-1 overflow-auto">
        {section === "appearance" && <AppearanceSection />}
        {section === "dock" && <DockSection />}
        {section === "desktop" && <DesktopSection />}
        {section === "defaultApps" && <DefaultAppsSection />}
        {section === "menuBar" && <MenuBarSection />}
        {section === "startup" && <StartupSection />}
        {section === "shortcuts" && <ShortcutsSection />}
        {section === "general" && <GeneralSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
