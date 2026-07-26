import type { FsNode } from "@/system/fs/types";
import { useBlobUrl } from "@/system/fs/useBlobUrl";
import { isImageNode } from "./fileMeta";
import { NodeGlyph } from "./NodeGlyph";

/**
 * Grid-view (and, per U14, Quick Look) image preview: an uploaded/blob-backed
 * image, or inline data URL. Falls back to the type glyph for anything that
 * isn't an image. Extracted from `FilesView.tsx` so Quick Look can reuse the
 * exact same rendering rather than inventing its own preview logic.
 */
export function Thumbnail({ node, imgClassName, glyphClassName }: {
  node: FsNode;
  /** Defaults to the grid tile's crop-to-fill; Quick Look passes `object-contain` instead so nothing's cropped. */
  imgClassName?: string;
  glyphClassName?: string;
}) {
  const { url: blobUrl } = useBlobUrl(node.contentRef);
  const src = node.content ?? blobUrl;
  if (isImageNode(node) && src) {
    return (
      <img
        src={src}
        alt={node.name}
        draggable={false}
        className={imgClassName ?? "size-full object-cover"}
      />
    );
  }
  return (
    <NodeGlyph
      node={node}
      className={glyphClassName ?? `size-8 ${node.type === "folder" ? "text-accent" : "text-ink-2"}`}
      strokeWidth={1.4}
    />
  );
}
