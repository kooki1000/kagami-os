/**
 * Feature flags — the dark-shipping seam for later phases (backend/sync land
 * behind `online` through Phase 13). Resolution order, highest wins:
 *
 *   1. localStorage override  (`kagami:flag:<id>` = "on" | "off") — per device,
 *      set from the Settings › About debug list or the console.
 *   2. build-time env         (`VITE_FLAG_<ID>` = "true" | "false")
 *   3. the registered default below.
 *
 * Flags are read synchronously; there is no reactive store on purpose — a
 * flag's value is stable for a session (overrides take effect on reload),
 * which keeps call sites (`if (isFlagEnabled("online"))`) trivial.
 */

export interface FlagDef {
  id: FlagId;
  /** Shown in the Settings debug list. */
  label: string;
  description: string;
  default: boolean;
}

export type FlagId = "online" | "e2e_crash";

export const FLAGS: readonly FlagDef[] = [
  {
    id: "online",
    label: "Online mode",
    description: "Accounts, remote storage, and sync (Phase 13). Not yet wired up.",
    default: false,
  },
  {
    id: "e2e_crash",
    label: "E2E crash trigger",
    description: "Dev-only: registers a hidden app that throws on first render, for testing the per-window crash boundary. Off by default; never ship on.",
    default: false,
  },
];

const FLAG_BY_ID: Record<FlagId, FlagDef> = Object.fromEntries(
  FLAGS.map(f => [f.id, f]),
) as Record<FlagId, FlagDef>;

const overrideKey = (id: FlagId) => `kagami:flag:${id}`;
const envKey = (id: FlagId) => `VITE_FLAG_${id.toUpperCase()}` as const;

function envValue(id: FlagId): boolean | null {
  // import.meta.env is statically replaced by Vite; guard for non-Vite
  // (test/node) runners where it may be undefined.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const raw = env?.[envKey(id)];
  if (raw === "true")
    return true;
  if (raw === "false")
    return false;
  return null;
}

function overrideValue(id: FlagId): boolean | null {
  try {
    const raw = localStorage.getItem(overrideKey(id));
    if (raw === "on")
      return true;
    if (raw === "off")
      return false;
  }
  catch {
    /* localStorage unavailable (private mode / SSR) — ignore the override */
  }
  return null;
}

/** Whether a flag is on, applying override → env → default. */
export function isFlagEnabled(id: FlagId): boolean {
  return overrideValue(id) ?? envValue(id) ?? FLAG_BY_ID[id].default;
}

/** Pin a per-device override; pass `null` to clear it and fall back. */
export function setFlagOverride(id: FlagId, value: boolean | null): void {
  try {
    if (value === null)
      localStorage.removeItem(overrideKey(id));
    else localStorage.setItem(overrideKey(id), value ? "on" : "off");
  }
  catch {
    /* nothing we can do without storage */
  }
}

/** Does this flag currently have a device-level override? */
export function hasFlagOverride(id: FlagId): boolean {
  return overrideValue(id) !== null;
}
