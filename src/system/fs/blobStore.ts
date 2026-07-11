import { createIdbBlobStore } from "./idbBlobStore";

/**
 * The app's single blob store instance. The fs store writes bytes here; the
 * `useBlobUrl` hook reads them back. One instance so a written blob is
 * immediately readable in the same session.
 */
export const blobStore = createIdbBlobStore();
