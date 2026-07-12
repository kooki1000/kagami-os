import { zipSync } from "fflate";

type ZipResponse
  = | { ok: true; data: Uint8Array }
    | { ok: false; error: string };

// Cast rather than pull in the "webworker" lib project-wide — it redeclares
// `self`/`postMessage` and conflicts with the "DOM" lib the rest of the app
// (correctly) uses. This is the narrow surface the worker actually needs.
const ctx = globalThis as unknown as {
  onmessage: ((e: MessageEvent<Record<string, Uint8Array>>) => void) | null;
  postMessage: (message: ZipResponse, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e) => {
  try {
    const zipped = zipSync(e.data, { level: 6 });
    ctx.postMessage({ ok: true, data: zipped }, [zipped.buffer]);
  }
  catch (error) {
    ctx.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
