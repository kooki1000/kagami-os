import { unzipSync } from "fflate";

type UnzipResponse
  = | { ok: true; data: Record<string, Uint8Array> }
    | { ok: false; error: string };

// Cast rather than pull in the "webworker" lib project-wide — see
// zipWorker.ts's identical comment for why.
const ctx = globalThis as unknown as {
  onmessage: ((e: MessageEvent<Uint8Array>) => void) | null;
  postMessage: (message: UnzipResponse) => void;
};

ctx.onmessage = (e) => {
  try {
    ctx.postMessage({ ok: true, data: unzipSync(e.data) });
  }
  catch (error) {
    ctx.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
