import type { AppWindowProps } from "@/system/apps/types";
import { isFlagEnabled } from "@/system/flags";

/**
 * Dev-only (flag `e2e_crash`): throws on render while the flag is on, to
 * exercise `WindowErrorBoundary` from an E2E test.
 *
 * Deliberately reads the flag fresh on every render rather than tracking
 * "have I thrown yet" as a one-shot module-level flag: React may retry a
 * throwing render once before handing off to the error boundary, and a flag
 * mutated as a side effect of the first attempt would already read
 * "consumed" on that retry — the retry then renders successfully, and the
 * boundary never sees an error at all. Reading the flag is idempotent, so
 * every attempt (original or retried) reaches the same, correct outcome. A
 * test recovers it by flipping the `kagami:flag:e2e_crash` localStorage
 * override off before clicking "Reload app".
 */
export default function DevCrashApp(_props: AppWindowProps) {
  if (isFlagEnabled("e2e_crash")) {
    throw new Error("E2E forced crash (flag: e2e_crash)");
  }
  return (
    <div className="grid h-full place-items-center text-[13px] text-ink-2">
      Recovered.
    </div>
  );
}
