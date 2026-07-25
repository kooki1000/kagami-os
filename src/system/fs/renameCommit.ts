import { notify } from "../notifications/notificationStore";
import { isValidNodeName } from "./fsStore";

/**
 * Shared "is this rename commit acceptable" check for every `RenameInput`
 * caller (Files, Notes, Desktop) — previously an identical validate-and-toast
 * block duplicated in all three (review-backlog #4). Toasts as a side effect
 * when the name is rejected; the caller is expected to return this value
 * straight from its `RenameInput.onCommit`, so `false` keeps the field open
 * and refocuses it instead of silently discarding the rejection.
 *
 * A blank name is *not* rejected here — every caller treats an
 * empty/whitespace-only commit as "user backed out", handled by simply not
 * calling `rename()`, not by a toast.
 */
export function isCommittableRename(name: string): boolean {
  if (name.trim() && !isValidNodeName(name)) {
    notify({
      title: "Can’t rename",
      body: "Names can’t contain a slash (/).",
      tone: "danger",
    });
    return false;
  }
  return true;
}
