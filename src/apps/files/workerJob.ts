/**
 * Run one request/response job in a fresh, short-lived `Worker`: post
 * `message`, resolve with the worker's `{ ok: true, data }` reply (or reject
 * on `{ ok: false, error }` / an `onerror`), and terminate it either way.
 * Shared by `download.ts`'s `zipInWorker` and `exportImport.ts`'s
 * `unzipInWorker` — same shape, only the worker module and the payload
 * types differ.
 */
export function runWorkerJob<TIn, TOut>(
  workerUrl: URL,
  message: TIn,
  /** Rejection message for an `onerror` (a message-shaped failure always rejects with its own `error` string instead). */
  onerrorMessage: string,
): Promise<TOut> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, { type: "module" });
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
