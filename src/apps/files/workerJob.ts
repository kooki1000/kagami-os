/**
 * Run one request/response job on an already-constructed `Worker`: post
 * `message`, resolve with the worker's `{ ok: true, data }` reply (or reject
 * on `{ ok: false, error }` / an `onerror`), and terminate it either way.
 * Shared by `download.ts`'s `zipInWorker` and `exportImport.ts`'s
 * `unzipInWorker` — same shape, only the worker module and the payload
 * types differ.
 *
 * Takes the `Worker` itself, not a URL to construct one from: Vite only
 * recognizes `new Worker(new URL("./x.ts", import.meta.url))` as a worker
 * asset when that's the literal call shape at the site importing the
 * module — routing the `new URL(...)` through a helper here made the
 * production build silently stop emitting the worker chunk (caught by e2e
 * download/import tests hanging on a `Worker` that never loads).
 */
export function runWorkerJob<TOut>(
  worker: Worker,
  message: unknown,
  /** Rejection message for an `onerror` (a message-shaped failure always rejects with its own `error` string instead). */
  onerrorMessage: string,
): Promise<TOut> {
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: true; data: TOut } | { ok: false; error: string }>) => {
      worker.terminate();
      if (e.data.ok)
        resolve(e.data.data);
      else
        reject(new Error(e.data.error));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error(onerrorMessage));
    };
    worker.postMessage(message);
  });
}
