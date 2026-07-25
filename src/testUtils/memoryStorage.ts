/**
 * zustand's `persist` middleware resolves its default storage as
 * `window.localStorage` at store-creation time; under Vitest's plain Node
 * test environment (no window/localStorage) that throw is swallowed and the
 * store never gets a `.persist` handle at all. Stubbing a minimal
 * localStorage before a fresh dynamic import lets tests exercise the real
 * persist wiring instead of only the fallback path.
 */
export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}
