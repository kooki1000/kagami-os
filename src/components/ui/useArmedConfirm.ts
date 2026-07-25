import { useEffect, useRef, useState } from "react";

/**
 * "Click again to confirm" for a destructive action: the first click arms
 * with `value`, a second click (reading `armed`) commits, and it auto-disarms
 * after `timeoutMs` if untouched. Shared by Files' Empty Trash and Settings'
 * Import disk, which both had their own hand-rolled copy of this timer.
 */
export function useArmedConfirm<T>(timeoutMs: number) {
  const [armed, setArmed] = useState<T | null>(null);
  const timerRef = useRef<number | null>(null);

  function clearTimer(): void {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => clearTimer, []);

  function arm(value: T): void {
    clearTimer();
    setArmed(value);
    timerRef.current = window.setTimeout(setArmed, timeoutMs, null);
  }

  function disarm(): void {
    clearTimer();
    setArmed(null);
  }

  return { armed, arm, disarm };
}
