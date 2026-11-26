import { blobStore } from "@/system/fs/blobStore";
import { useFsStore } from "@/system/fs/fsStore";
import { notify } from "@/system/notifications/notificationStore";
import { isTauri } from "@/system/platform";
import { useSettingsStore } from "@/system/settings/settingsStore";

/**
 * B14 — the backup reminder (ROADMAP risk R1). Safari evicts IndexedDB for a
 * site that hasn't been used for about a week, and there is no other copy, so
 * the app records when the disk was last exported, says so in Settings, and
 * nudges once when too long has passed.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** The reminder thresholds Settings offers; `0` is off. 7 matches Safari's eviction window. */
export const BACKUP_REMINDER_CHOICES = [0, 3, 7, 14, 30] as const;

/** "Never", "Today", "Yesterday", "12 days ago" — whole days, so it doesn't flicker. */
export function describeBackupAge(lastBackupAt: number | null, now: number): string {
  if (lastBackupAt === null)
    return "Never";
  const days = Math.floor(Math.max(0, now - lastBackupAt) / DAY_MS);
  if (days === 0)
    return "Today";
  if (days === 1)
    return "Yesterday";
  return `${days} days ago`;
}

interface ReminderState {
  now: number;
  lastBackupAt: number | null;
  trackingSince: number | null;
  remindedFor: number | null;
  thresholdDays: number;
}

/**
 * Whether to send the reminder now. The clock starts at the last backup, or,
 * for someone who has never exported, at the first time this ran: a brand-new
 * install shouldn't be told it's overdue. Once reminded for a given start
 * it stays quiet until a later backup moves the start.
 */
export function isBackupReminderDue({ now, lastBackupAt, trackingSince, remindedFor, thresholdDays }: ReminderState): boolean {
  if (thresholdDays <= 0)
    return false;
  const baseline = lastBackupAt ?? trackingSince;
  if (baseline === null || baseline === remindedFor)
    return false;
  return now - baseline >= thresholdDays * DAY_MS;
}

/** Exports the disk and, once the archive has been produced, records the time. */
export async function exportDiskAndRecord(): Promise<void> {
  // Imported on demand: `App` pulls this module into the main bundle for the
  // boot check, and the zip machinery shouldn't ride along with it.
  const { exportDisk } = await import("@/apps/files/exportImport");
  await exportDisk(useFsStore.getState().nodes, blobStore);
  useSettingsStore.setState({ lastBackupAt: Date.now() });
}

/**
 * Boot-time check, after the VFS is ready. Skipped in the native build,
 * where the disk is a real folder and the browser can't evict it. Starts
 * the clock the first time it runs; notifies at most once per stretch
 * without a backup.
 */
export function checkBackupReminder(now = Date.now()): void {
  if (isTauri())
    return;
  const settings = useSettingsStore.getState();
  if (settings.lastBackupAt === null && settings.backupTrackingSince === null)
    useSettingsStore.setState({ backupTrackingSince: now });

  const state = useSettingsStore.getState();
  const due = isBackupReminderDue({
    now,
    lastBackupAt: state.lastBackupAt,
    trackingSince: state.backupTrackingSince,
    remindedFor: state.backupRemindedFor,
    thresholdDays: state.backupReminderDays,
  });
  if (!due)
    return;

  const baseline = state.lastBackupAt ?? state.backupTrackingSince;
  useSettingsStore.setState({ backupRemindedFor: baseline });
  const age = describeBackupAge(baseline, now).toLowerCase();
  notify({
    title: "Back up your files",
    body: state.lastBackupAt === null
      ? "This disk has never been exported. Browsers can clear a site's data, and a zip is the only other copy."
      : `Your last backup was ${age}. Browsers can clear a site's data, and a zip is the only other copy.`,
    tone: "accent",
    action: {
      label: "Export now",
      run: () => void exportDiskAndRecord().catch(() => notify({ title: "Export failed", tone: "danger" })),
    },
  });
}
