import { describe, expect, it } from "vitest";
import { DAY_MS, describeBackupAge, isBackupReminderDue } from "./backupReminder";

const NOW = 100 * DAY_MS;

describe("describeBackupAge", () => {
  it("says Never when nothing was exported", () => {
    expect(describeBackupAge(null, NOW)).toBe("Never");
  });

  it("counts whole days", () => {
    expect(describeBackupAge(NOW - 3600_000, NOW)).toBe("Today");
    expect(describeBackupAge(NOW - DAY_MS, NOW)).toBe("Yesterday");
    expect(describeBackupAge(NOW - 12.9 * DAY_MS, NOW)).toBe("12 days ago");
  });

  it("treats a timestamp in the future as today", () => {
    expect(describeBackupAge(NOW + DAY_MS, NOW)).toBe("Today");
  });
});

describe("isBackupReminderDue", () => {
  const base = { now: NOW, lastBackupAt: null, trackingSince: null, remindedFor: null, thresholdDays: 7 };

  it("is due once the last backup is at least the threshold old", () => {
    expect(isBackupReminderDue({ ...base, lastBackupAt: NOW - 7 * DAY_MS })).toBe(true);
    expect(isBackupReminderDue({ ...base, lastBackupAt: NOW - 7 * DAY_MS + 1 })).toBe(false);
  });

  it("starts the clock at tracking start for someone who has never backed up", () => {
    expect(isBackupReminderDue({ ...base, trackingSince: NOW - 2 * DAY_MS })).toBe(false);
    expect(isBackupReminderDue({ ...base, trackingSince: NOW - 8 * DAY_MS })).toBe(true);
  });

  it("is never due with no baseline at all", () => {
    expect(isBackupReminderDue(base)).toBe(false);
  });

  it("is off when the threshold is 0", () => {
    expect(isBackupReminderDue({ ...base, lastBackupAt: 0, thresholdDays: 0 })).toBe(false);
  });

  it("stays quiet after reminding for the same baseline, and re-arms after a new backup", () => {
    const lastBackupAt = NOW - 30 * DAY_MS;
    expect(isBackupReminderDue({ ...base, lastBackupAt, remindedFor: lastBackupAt })).toBe(false);
    // A later backup moved the baseline; once that one is old enough, remind again.
    expect(isBackupReminderDue({ ...base, now: NOW + 10 * DAY_MS, lastBackupAt: NOW - DAY_MS, remindedFor: lastBackupAt })).toBe(true);
  });
});
