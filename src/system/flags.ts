/**
 * Feature flags — the dark-shipping seam: work can land on `main` behind a
 * flag before it's ready to be on by default. Resolution order, highest wins:
 *
 *   1. localStorage override  (`kagami:flag:<id>` = "on" | "off") — per device,
 *      set from the Settings › About debug list or the console.
 *   2. build-time env         (`VITE_FLAG_<ID>` = "true" | "false")
 *   3. the registered default below.
 *
 * Flags are read synchronously; there is no reactive store on purpose — a
 * flag's value is stable for a session (overrides take effect on reload),
 * which keeps call sites (`if (isFlagEnabled("e2e_crash"))`) trivial.
 */

export interface FlagDef {
  id: FlagId;
  /** Shown in the Settings debug list. */
  label: string;
  description: string;
  default: boolean;
}

export type FlagId = "e2e_crash" | "app_sandbox" | "third_party_apps";

export const FLAGS: readonly FlagDef[] = [
  {
    id: "e2e_crash",
    label: "E2E crash trigger",
    description: "Dev-only: registers a hidden app that throws on first render, for testing the per-window crash boundary. Off by default; never ship on.",
    default: false,
  },
  {
    id: "app_sandbox",
    label: "App sandbox",
    description: "Dev-only: registers a demo app that runs inside the capability-scoped iframe sandbox (step 16a), for testing the bridge. Off by default; never ship on.",
    default: false,
  },
  {
    id: "third_party_apps",
    label: "Third-party apps",
    description: "Dev-only: gates the installable-app registry, install flow, and Settings management pane (step 17). Off by default until the SDK is ready to ship.",
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

/**
 * What a flag would resolve to with no per-device override — env, else the
 * registered default (review-backlog #14). Lets the UI tell "this override
 * merely restates the underlying value" from "this override actually
 * changes something", so toggling a flag back to its effective default can
 * clear the override instead of pinning it.
 */
export function effectiveDefault(id: FlagId): boolean {
  return envValue(id) ?? FLAG_BY_ID[id].default;
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
