import type { ChangeEvent, ReactNode } from "react";
import type { UiScale } from "@/design/tokens";
import type { DockPosition, DockSize } from "@/system/dock/dockStore";
import type { WallpaperFit } from "@/system/settings/palettes";
import type { ReduceMotionPreference } from "@/system/settings/settingsStore";
import type { ResolvedTheme, ThemePreference } from "@/system/theme/themeStore";
import { Check, Info, Monitor, Palette, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { exportDisk, importDisk } from "@/apps/files/exportImport";
import { useArmedConfirm } from "@/components/ui/useArmedConfirm";
import { checkAccentContrast, WCAG_AA_NORMAL_TEXT } from "@/design/color";
import { useDockStore } from "@/system/dock/dockStore";
import { effectiveDefault, FLAGS, hasFlagOverride, isFlagEnabled, setFlagOverride } from "@/system/flags";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { PICTURES_ID } from "@/system/fs/types";
import { notify } from "@/system/notifications/notificationStore";
import {
  accentById,
  ACCENTS,
  accentSwatch,
  WALLPAPERS,
} from "@/system/settings/palettes";
import { useSettingsStore } from "@/system/settings/settingsStore";
import { useWallpaperUrl } from "@/system/settings/wallpaperBlobUrl";
import { usePersistentStorageStatus } from "@/system/storage/persistence";
import { useThemeStore } from "@/system/theme/themeStore";

type Section = "appearance" | "dock" | "general" | "about";

const NAV: Array<{ id: Section; label: string; icon: typeof Palette }> = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "dock", label: "Dock", icon: Monitor },
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "about", label: "About", icon: Info },
];

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

interface SegmentOption<T> {
  value: T;
  label: string;
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  width,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  width?: number;
}) {
  return (
    <div className="flex rounded-[9px] bg-ph p-0.75" style={{ width }}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          className={`flex-1 rounded-btn px-3 py-[calc(6px*var(--ui-scale))] text-12 transition-colors ${
            value === option.value
              ? "bg-surface font-semibold text-ink shadow-[0_1px_3px_rgba(0,0,0,.14)]"
              : "font-medium text-ink-2 hover:text-ink"
          }`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

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
 * WCAG surface/ink hex per theme, for U2's contrast warning —
 * `checkAccentContrast` needs literal hex, not a live `--surface`/`--text`
 * CSS var, so these are transcribed from `global.css`'s `:root`/`[data-theme
 * ='dark']` blocks. Keep in sync if those tokens ever change.
 */
const SURFACE_HEX: Record<ResolvedTheme, string> = { light: "#faf8f4", dark: "#201e1a" };
const INK_HEX: Record<ResolvedTheme, string> = { light: "#2b2925", dark: "#efece5" };

/**
 * U2's picker: a native color input (styled as a round swatch, matching the
 * preset dots next to it) plus a non-blocking WCAG AA contrast warning.
 * Picking a preset (`setAccent`) clears this override in the store, so the
 * two never fight over which one's "selected".
 */
function CustomAccentPicker() {
  const accentId = useSettingsStore(s => s.accentId);
  const customAccentHex = useSettingsStore(s => s.customAccentHex);
  const setCustomAccentHex = useSettingsStore(s => s.setCustomAccentHex);
  const resolvedTheme = useThemeStore(s => s.resolved);

  const swatchHex = customAccentHex ?? accentSwatch(accentById(accentId));
  const contrast = customAccentHex
    ? checkAccentContrast(customAccentHex, SURFACE_HEX[resolvedTheme], INK_HEX[resolvedTheme])
    : null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
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
      <span className="text-11.5 text-ink-2">Custom color</span>
      {customAccentHex && (
        <button
          type="button"
          className="text-11.5 font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline"
          onClick={() => setCustomAccentHex(null)}
        >
          Reset to preset
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
  const accentId = useSettingsStore(s => s.accentId);
  const setAccent = useSettingsStore(s => s.setAccent);
  const customAccentHex = useSettingsStore(s => s.customAccentHex);
  const wallpaperId = useSettingsStore(s => s.wallpaperId);
  const setWallpaper = useSettingsStore(s => s.setWallpaper);
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

  return (
    <>
      <Row label="Appearance">
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

      <Row label="Accent color">
        <div className="flex gap-[calc(11px*var(--ui-scale))]">
          {ACCENTS.map((accent) => {
            const selected = !customAccentHex && accent.id === accentId;
            return (
              <button
                key={accent.id}
                type="button"
                aria-label={accent.name}
                title={accent.name}
                className={`relative size-[calc(26px*var(--ui-scale))] rounded-full border-[1.5px] border-black/10 ${
                  selected
                    ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--accent)]"
                    : ""
                }`}
                style={{ background: accentSwatch(accent) }}
                onClick={() => setAccent(accent.id)}
              >
                {selected && (
                  <Check className="absolute inset-0 m-auto size-[calc(14px*var(--ui-scale))] text-white" strokeWidth={3} />
                )}
              </button>
            );
          })}
        </div>
        <CustomAccentPicker />
      </Row>

      <Row label="Wallpaper">
        <div className="flex gap-[calc(10px*var(--ui-scale))]">
          {WALLPAPERS.map((wallpaper) => {
            const selected = wallpaper.id === wallpaperId;
            return (
              <button
                key={wallpaper.id}
                type="button"
                aria-label={wallpaper.name}
                title={wallpaper.name}
                className={`h-[calc(50px*var(--ui-scale))] w-[calc(78px*var(--ui-scale))] rounded-[9px] border-2 transition-shadow ${
                  selected
                    ? "border-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_22%,transparent)]"
                    : "border-transparent"
                }`}
                style={{ background: wallpaper.swatch }}
                onClick={() => setWallpaper(wallpaper.id)}
              />
            );
          })}
        </div>
      </Row>

      <Row label="Custom wallpaper">
        <div className="flex flex-col gap-3">
          <CustomWallpaperSlot theme="light" label="Light" />
          <CustomWallpaperSlot theme="dark" label="Dark" />
          <div>
            <span className="mb-1.5 block text-11.5 text-ink-2">Fit</span>
            <Segmented<WallpaperFit> width={240} value={wallpaperFit} onChange={setWallpaperFit} options={WALLPAPER_FIT_OPTIONS} />
          </div>
        </div>
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

      <Row label="Wallpaper dimming">
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

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative h-[calc(18px*var(--ui-scale))] w-8 flex-none rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-ph"
      }`}
      onClick={() => onChange(!checked)}
    >
      <span
        className={`absolute top-0.5 size-[calc(14px*var(--ui-scale))] rounded-full bg-white transition-[left] ${
          checked ? "left-4" : "left-0.5"
        }`}
      />
    </button>
  );
}

function GeneralSection() {
  const autoEmptyTrash = useSettingsStore(s => s.autoEmptyTrash);
  const setAutoEmptyTrash = useSettingsStore(s => s.setAutoEmptyTrash);

  return (
    <>
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
            pendingImport ? "bg-accent-2 text-white" : "bg-ph text-ink hover:bg-ph-2"
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

      <FlagsDebug />

      <p className="mt-5 max-w-72 text-11.5/relaxed text-ink-2">
        An original desktop environment — no Apple or third-party OS code,
        assets, or trademarks. Icons by Lucide; typeface Inter.
      </p>
    </div>
  );
}

export default function SettingsApp() {
  const [section, setSection] = useState<Section>("appearance");

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
        {section === "general" && <GeneralSection />}
        {section === "about" && <AboutSection />}
      </div>
    </div>
  );
}
