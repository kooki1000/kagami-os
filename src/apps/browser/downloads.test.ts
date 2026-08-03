import type { FsNode } from "@/system/fs/types";
import { describe, expect, it, vi } from "vitest";
import { FALLBACK_MIME_TYPE, mimeTypeForFilename, saveDownload } from "./downloads";

describe("mimeTypeForFilename", () => {
  it("maps common extensions", () => {
    expect(mimeTypeForFilename("report.pdf")).toBe("application/pdf");
    expect(mimeTypeForFilename("photo.PNG")).toBe("image/png");
    expect(mimeTypeForFilename("track.mp3")).toBe("audio/mpeg");
  });

  it("reads the last extension of a multi-dotted name", () => {
    expect(mimeTypeForFilename("archive.tar.gz")).toBe("application/gzip");
  });

  it("falls back for unknown or missing extensions", () => {
    expect(mimeTypeForFilename("data.unknownext")).toBe(FALLBACK_MIME_TYPE);
    expect(mimeTypeForFilename("README")).toBe(FALLBACK_MIME_TYPE);
    expect(mimeTypeForFilename("trailing.")).toBe(FALLBACK_MIME_TYPE);
  });

  it("does not read a dotfile's name as an extension", () => {
    expect(mimeTypeForFilename(".gitignore")).toBe(FALLBACK_MIME_TYPE);
  });
});

describe("saveDownload", () => {
  const node = { id: "n1", name: "report.pdf" } as FsNode;

  it("reads the staged bytes and writes them as a blob-backed file", async () => {
    const takeDownload = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const createBlobFile = vi.fn().mockResolvedValue(node);

    const result = await saveDownload(
      { filename: "report.pdf", path: "/tmp/staging/1/report.pdf" },
      "downloads",
      { takeDownload, createBlobFile },
    );

    expect(takeDownload).toHaveBeenCalledWith("/tmp/staging/1/report.pdf");
    expect(result).toBe(node);

    const [parentId, name, blob, mimeType] = createBlobFile.mock.calls[0];
    expect(parentId).toBe("downloads");
    expect(name).toBe("report.pdf");
    expect(mimeType).toBe("application/pdf");
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBe(3);
  });

  it("types unknown files as opaque bytes rather than guessing text", async () => {
    const createBlobFile = vi.fn().mockResolvedValue(node);
    await saveDownload(
      { filename: "blob.bin", path: "/tmp/staging/2/blob.bin" },
      "downloads",
      { takeDownload: vi.fn().mockResolvedValue(new ArrayBuffer(8)), createBlobFile },
    );
    expect(createBlobFile.mock.calls[0][3]).toBe(FALLBACK_MIME_TYPE);
  });

  it("propagates a staging read failure instead of writing an empty file", async () => {
    const createBlobFile = vi.fn();
    await expect(saveDownload(
      { filename: "gone.pdf", path: "/tmp/staging/3/gone.pdf" },
      "downloads",
      { takeDownload: vi.fn().mockRejectedValue(new Error("no such download")), createBlobFile },
    )).rejects.toThrow("no such download");
    expect(createBlobFile).not.toHaveBeenCalled();
  });
});
