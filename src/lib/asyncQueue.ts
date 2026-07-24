/** Serializes async tasks onto one promise chain, so overlapping callers can't race each other. */
export function createWriteQueue() {
  let queue = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}
