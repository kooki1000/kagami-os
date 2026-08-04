import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";

/**
 * A ref that always holds the latest `value`, updated via a dependency-less
 * `useLayoutEffect` (so it's current before any effect below it runs, and
 * before the next paint). Lets a callback/interval/observer read the latest
 * value through the ref instead of closing over it directly, keeping its own
 * identity stable — the point is avoiding a dependency that would otherwise
 * tear the caller down and rebuild it on every unrelated change.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
