import { useEffect, useRef } from "react";

type AppCommandHandler = (command: string) => void;

const handlers = new Map<string, Set<AppCommandHandler>>();

/** Fire an app-defined menu command at a specific window instance. */
export function emitAppCommand(windowId: string, command: string): void {
  handlers.get(windowId)?.forEach(handler => handler(command));
}

/** Subscribe a window's app component to its menu commands. */
export function useAppCommand(windowId: string, handler: AppCommandHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const stable: AppCommandHandler = command => handlerRef.current(command);
    let set = handlers.get(windowId);
    if (!set) {
      set = new Set();
      handlers.set(windowId, set);
    }
    set.add(stable);
    return () => {
      set.delete(stable);
      if (set.size === 0)
        handlers.delete(windowId);
    };
  }, [windowId]);
}
