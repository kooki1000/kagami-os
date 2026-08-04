import { describe, expect, it } from "vitest";
import { effectiveMimeType, FALLBACK_MIME_TYPE, isTextLikeMime, mimeTypeForFilename } from "./mimeTypes";

describe("mimeTypeForFilename", () => {
  it("names the code types D4's editor opens", () => {
    expect(mimeTypeForFilename("app.ts")).toBe("text/typescript");
    expect(mimeTypeForFilename("App.tsx")).toBe("text/typescript");
    expect(mimeTypeForFilename("main.js")).toBe("text/javascript");
    expect(mimeTypeForFilename("data.json")).toBe("application/json");
    expect(mimeTypeForFilename("theme.css")).toBe("text/css");
    expect(mimeTypeForFilename("index.html")).toBe("text/html");
    expect(mimeTypeForFilename("script.py")).toBe("text/x-python");
    expect(mimeTypeForFilename("build.sh")).toBe("application/x-sh");
    expect(mimeTypeForFilename("config.yaml")).toBe("application/yaml");
    expect(mimeTypeForFilename("Cargo.toml")).toBe("application/toml");
    expect(mimeTypeForFilename("lib.rs")).toBe("text/rust");
    expect(mimeTypeForFilename("main.go")).toBe("text/x-go");
    expect(mimeTypeForFilename("query.sql")).toBe("application/sql");
  });

  it("keeps the download table's answers (U17) unchanged", () => {
    expect(mimeTypeForFilename("report.pdf")).toBe("application/pdf");
    expect(mimeTypeForFilename("photo.PNG")).toBe("image/png");
    expect(mimeTypeForFilename("track.mp3")).toBe("audio/mpeg");
    expect(mimeTypeForFilename("archive.tar.gz")).toBe("application/gzip");
    expect(mimeTypeForFilename("notes.md")).toBe("text/markdown");
  });

  it("falls back when the name names nothing", () => {
    expect(mimeTypeForFilename("data.unknownext")).toBe(FALLBACK_MIME_TYPE);
    expect(mimeTypeForFilename("README")).toBe(FALLBACK_MIME_TYPE);
    expect(mimeTypeForFilename("trailing.")).toBe(FALLBACK_MIME_TYPE);
    // A dotfile is a name, not an extension.
    expect(mimeTypeForFilename(".gitignore")).toBe(FALLBACK_MIME_TYPE);
  });
});

describe("isTextLikeMime", () => {
  it("accepts text/* and the text-ish application types", () => {
    expect(isTextLikeMime("text/plain")).toBe(true);
    expect(isTextLikeMime("text/typescript")).toBe(true);
    expect(isTextLikeMime("application/json")).toBe(true);
    expect(isTextLikeMime("application/x-sh")).toBe(true);
    expect(isTextLikeMime("application/yaml")).toBe(true);
    expect(isTextLikeMime("image/svg+xml")).toBe(true);
  });

  it("rejects bytes and media", () => {
    expect(isTextLikeMime(FALLBACK_MIME_TYPE)).toBe(false);
    expect(isTextLikeMime("image/png")).toBe(false);
    expect(isTextLikeMime("video/mp2t")).toBe(false);
    expect(isTextLikeMime("application/pdf")).toBe(false);
    expect(isTextLikeMime("")).toBe(false);
  });
});

describe("effectiveMimeType", () => {
  it("uses the name when nothing was stored", () => {
    expect(effectiveMimeType({ name: "script.py", mimeType: undefined })).toBe("text/x-python");
    expect(effectiveMimeType({ name: "script.py", mimeType: "" })).toBe("text/x-python");
    expect(effectiveMimeType({ name: "data.json", mimeType: FALLBACK_MIME_TYPE })).toBe("application/json");
  });

  it("overrides a stored type that contradicts a text extension", () => {
    // Chromium reports the MPEG transport stream for `.ts` uploads.
    expect(effectiveMimeType({ name: "app.ts", mimeType: "video/mp2t" })).toBe("text/typescript");
  });

  it("keeps a stored text type the name can't improve on", () => {
    // Notes writes `.md` files; a `.txt` note deliberately stays markdown.
    expect(effectiveMimeType({ name: "note.txt", mimeType: "text/markdown" })).toBe("text/markdown");
    expect(effectiveMimeType({ name: "data.json", mimeType: "application/json" })).toBe("application/json");
  });

  it("keeps a stored binary type the name says nothing about", () => {
    expect(effectiveMimeType({ name: "photo.png", mimeType: "image/png" })).toBe("image/png");
    expect(effectiveMimeType({ name: "clip.unknownext", mimeType: "video/mp4" })).toBe("video/mp4");
  });

  it("follows a rename into a text extension, the way a desktop does", () => {
    expect(effectiveMimeType({ name: "photo.txt", mimeType: "image/png" })).toBe("text/plain");
  });
});
