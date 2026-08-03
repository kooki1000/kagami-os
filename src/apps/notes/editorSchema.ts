import type { Extensions } from "@tiptap/core";
import { Bold } from "@tiptap/extension-bold";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Heading } from "@tiptap/extension-heading";
import { Italic } from "@tiptap/extension-italic";
import { BulletList, ListItem, ListKeymap, OrderedList, TaskItem, TaskList } from "@tiptap/extension-list";
import { Paragraph } from "@tiptap/extension-paragraph";
import { Text } from "@tiptap/extension-text";
import { Underline } from "@tiptap/extension-underline";
import { UndoRedo } from "@tiptap/extensions";

/**
 * The editor's vocabulary (D9), assembled one extension at a time.
 *
 * **Never `StarterKit`.** ROADMAP.md §6 decision 8 lets Notes render
 * markdown outside the capability sandbox on one condition: the vocabulary
 * stays closed, with no generic-HTML path. A ProseMirror schema is the
 * strongest possible form of that promise — a document can only contain
 * nodes and marks the schema declares, so anything pasted from elsewhere
 * (a `<script>`, an `<img onerror>`, an `<iframe>`, a `javascript:` link)
 * is dropped structurally during parsing rather than filtered afterwards by
 * a denylist somebody has to keep current.
 *
 * That guarantee is only as good as this list. `StarterKit` would bundle
 * Link, Image, CodeBlock and Blockquote — each a node this app has never
 * rendered, and Link and Image both carry a URL attribute, which is exactly
 * the shape decision 8 rules out. Adding an extension here is a change to
 * the security argument, not a convenience: it belongs in a PR that revisits
 * §6 decision 8 and G1's owed renderer audit.
 *
 * Kept in sync with `markdownDocument.ts`, which can only produce these
 * types, and asserted in `editorSchema.test.ts`.
 */
export const NOTES_EXTENSIONS: Extensions = [
  Document,
  Paragraph,
  Text,
  HardBreak,
  Heading.configure({ levels: [1, 2, 3] }),
  BulletList,
  OrderedList,
  ListItem,
  TaskList,
  TaskItem.configure({ nested: false }),
  ListKeymap,
  Bold,
  Italic,
  Underline,
  UndoRedo,
];

/** Every node the schema is allowed to contain. */
export const ALLOWED_NODES = [
  "doc",
  "paragraph",
  "text",
  "hardBreak",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
] as const;

/** Every mark the schema is allowed to contain. */
export const ALLOWED_MARKS = ["bold", "italic", "underline"] as const;
