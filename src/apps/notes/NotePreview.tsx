import type { ReactNode } from "react";
import type { Block, InlineSegment, ListItem } from "./markdownPreview";
import { Square, SquareCheck } from "lucide-react";
import { Fragment, useMemo } from "react";
import { parseMarkdown } from "./markdownPreview";

function InlineRun({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case "bold":
            return <strong key={i} className="font-semibold">{seg.content}</strong>;
          case "italic":
            return <em key={i}>{seg.content}</em>;
          case "underline":
            return <u key={i}>{seg.content}</u>;
          default:
            return <Fragment key={i}>{seg.content}</Fragment>;
        }
      })}
    </>
  );
}

/** One `<li>` of a bullet/numbered/checklist item — the shared row shape behind all three marker styles. */
function ListRow({ marker, children }: { marker: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      {marker}
      {children}
    </li>
  );
}

function BulletItem({ item }: { item: ListItem }) {
  if (item.checked !== undefined) {
    const Icon = item.checked ? SquareCheck : Square;
    return (
      <ListRow marker={<Icon className={`mt-[3px] size-3.5 flex-none ${item.checked ? "text-accent" : "text-ink-2"}`} />}>
        <span className={item.checked ? "text-ink-2 line-through" : ""}>
          <InlineRun segments={item.segments} />
        </span>
      </ListRow>
    );
  }
  return (
    <ListRow marker={<span className="mt-[9px] size-1 flex-none rounded-full bg-ink-2" />}>
      <span><InlineRun segments={item.segments} /></span>
    </ListRow>
  );
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: "text-[calc(19px*var(--ui-scale))] font-semibold",
  2: "text-[calc(16px*var(--ui-scale))] font-semibold",
  3: "text-[calc(14px*var(--ui-scale))] font-semibold",
};

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      return (
        <Tag className={`mt-5 mb-2 text-ink first:mt-0 ${HEADING_CLASS[block.level]}`}>
          <InlineRun segments={block.segments} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p className="mb-3 leading-relaxed text-ink last:mb-0">
          {block.lines.map((line, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              <InlineRun segments={line} />
            </Fragment>
          ))}
        </p>
      );
    case "bulletList":
      return (
        <ul className="mb-3 space-y-1 text-ink last:mb-0">
          {block.items.map((item, i) => <BulletItem key={i} item={item} />)}
        </ul>
      );
    case "numberList":
      return (
        <ol className="mb-3 space-y-1 text-ink last:mb-0">
          {block.items.map((item, i) => (
            <ListRow key={i} marker={<span className="text-ink-2 tabular-nums">{`${i + 1}.`}</span>}>
              <span><InlineRun segments={item.segments} /></span>
            </ListRow>
          ))}
        </ol>
      );
  }
}

/** Read-only rendered view of a note's markdown text — Notes' Preview mode (U15). */
export function NotePreview({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);

  if (blocks.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-5 text-13 text-ink-2 select-none">
        Nothing to preview yet
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5 text-13">
      {blocks.map((block, i) => <BlockView key={i} block={block} />)}
    </div>
  );
}
