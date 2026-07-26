import type { ChangeEvent, ReactNode } from "react";
import type { UiScale } from "@/design/tokens";
import type { DesktopIconSize } from "@/system/desktop/desktopLayout";
import type { DockPosition, DockSize } from "@/system/dock/dockStore";
import type { SortKey } from "@/system/fs/fsStore";
import type { MenuBarStatusItem } from "@/system/settings/settingsStore";
import type { ChordDescriptor } from "@/system/shortcuts";
import type { ThemePreference } from "@/system/theme/themeStore";
import { Check, Clock, FileType, Info, Keyboard, LayoutGrid, Monitor, Palette, Power, SlidersHorizontal } from "lucide-react";
import { useRef, useState } from "react";
import { exportDisk, importDisk } from "@/apps/files/exportImport";
import { useArmedConfirm } from "@/components/ui/useArmedConfirm";
import { formatShortcut } from "@/lib/format";
import { candidateAppsForMime } from "@/system/apps/openFile";
import { apps, getApp } from "@/system/apps/registry";
import { useDesktopLayoutStore } from "@/system/desktop/desktopLayoutStore";
import { useDockStore } from "@/system/dock/dockStore";
import { effectiveDefault, FLAGS, hasFlagOverride, isFlagEnabled, setFlagOverride } from "@/system/flags";
import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { notify } from "@/system/notifications/notificationStore";
import {
  ACCENTS,
  accentSwatch,
  WALLPAPERS,
} from "@/system/settings/palettes";
import { useSettingsStore } from "@/system/settings/settingsStore";
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

function Segmented<T extends string>({
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

function AppearanceSection() {
  const preference = useThemeStore(s => s.preference);
  const setPreference = useThemeStore(s => s.setPreference);
  const accentId = useSettingsStore(s => s.accentId);
  const setAccent = useSettingsStore(s => s.setAccent);
  const wallpaperId = useSettingsStore(s => s.wallpaperId);
  const setWallpaper = useSettingsStore(s => s.setWallpaper);
  const uiScale = useSettingsStore(s => s.uiScale);
  const setUiScale = useSettingsStore(s => s.setUiScale);

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
            const selected = accent.id === accentId;
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
