import type { FsNode } from "./types";
import {
  DESKTOP_ID,
  DOCUMENTS_ID,
  DOWNLOADS_ID,
  HOME_ID,
  PICTURES_ID,
  ROOT_ID,
  TRASH_ID,
} from "./types";

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/* Original geometric artwork in the Lagoon palette. */

const lagoonDusk = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">`
  + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
  + `<stop offset="0" stop-color="#0e8f83"/><stop offset="1" stop-color="#74cabf"/>`
  + `</linearGradient></defs>`
  + `<rect width="400" height="300" fill="url(#g)"/>`
  + `<circle cx="320" cy="70" r="90" fill="#f2765b" opacity=".85"/>`
  + `<rect x="-40" y="190" width="200" height="200" rx="40" fill="#bfe6df" opacity=".5" transform="rotate(24 60 290)"/>`
  + `</svg>`,
);

const coralDrift = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">`
  + `<rect width="400" height="300" fill="#f2765b"/>`
  + `<circle cx="110" cy="220" r="130" fill="#d8543a" opacity=".7"/>`
  + `<circle cx="330" cy="60" r="80" fill="#0f9b8e"/>`
  + `<circle cx="330" cy="60" r="46" fill="#17b0a1"/>`
  + `</svg>`,
);

const tealFields = svgDataUrl(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">`
  + `<rect width="400" height="300" fill="#0c8074"/>`
  + `<rect x="0" y="150" width="400" height="50" fill="#17b0a1"/>`
  + `<rect x="0" y="200" width="400" height="100" fill="#0f9b8e"/>`
  + `<circle cx="300" cy="90" r="55" fill="#efece4"/>`
  + `</svg>`,
);

const welcomeMd = `# Welcome to your Kagami drive

Everything you see in Files lives in a virtual file system stored right in
your browser (IndexedDB) — it survives refreshes without any backend.

Things to try:

- Make a folder with the toolbar button or the File menu
- Rename things (right-click, or via the context menu)
- Drag files onto folders, sidebar places, or the Trash
- Deleted items sit in the Trash until you empty it
`;

const ideasMd = `# Ideas

- A terminal that speaks to this same file system
- Markdown preview in Notes
- Wallpaper picker fed from the Pictures folder
`;

const paletteTxt = `Lagoon palette
accent    #0f9b8e
accent-2  #f2765b
close     #f2765b
minimize  #17b0a1
zoom      #0c8074
`;

interface SeedSpec {
  id?: string;
  parentId: string | null;
  name: string;
  type: FsNode["type"];
  mimeType?: string;
  content?: string;
  /** Minutes before "now", so seeded items have believable timestamps. */
  age?: number;
}

const SPECS: SeedSpec[] = [
  { id: ROOT_ID, parentId: null, name: "Kagami", type: "folder", age: 40_000 },
  { id: HOME_ID, parentId: ROOT_ID, name: "Home", type: "folder", age: 40_000 },
  { id: DESKTOP_ID, parentId: HOME_ID, name: "Desktop", type: "folder", age: 40_000 },
  { id: DOCUMENTS_ID, parentId: HOME_ID, name: "Documents", type: "folder", age: 40_000 },
  { id: DOWNLOADS_ID, parentId: HOME_ID, name: "Downloads", type: "folder", age: 40_000 },
  { id: PICTURES_ID, parentId: HOME_ID, name: "Pictures", type: "folder", age: 40_000 },
  { id: TRASH_ID, parentId: ROOT_ID, name: "Trash", type: "folder", age: 40_000 },
  { parentId: DOCUMENTS_ID, name: "welcome.md", type: "file", mimeType: "text/markdown", content: welcomeMd, age: 3000 },
  { parentId: DOCUMENTS_ID, name: "ideas.md", type: "file", mimeType: "text/markdown", content: ideasMd, age: 1400 },
  { parentId: DOCUMENTS_ID, name: "Projects", type: "folder", age: 9000 },
  { parentId: DOWNLOADS_ID, name: "palette.txt", type: "file", mimeType: "text/plain", content: paletteTxt, age: 300 },
  { parentId: PICTURES_ID, name: "lagoon-dusk.svg", type: "file", mimeType: "image/svg+xml", content: lagoonDusk, age: 7000 },
  { parentId: PICTURES_ID, name: "coral-drift.svg", type: "file", mimeType: "image/svg+xml", content: coralDrift, age: 6500 },
  { parentId: PICTURES_ID, name: "teal-fields.svg", type: "file", mimeType: "image/svg+xml", content: tealFields, age: 6200 },
];

export function createSeedNodes(): FsNode[] {
  const now = Date.now();
  return SPECS.map((spec) => {
    const at = now - (spec.age ?? 0) * 60_000;
    return {
      id: spec.id ?? crypto.randomUUID(),
      parentId: spec.parentId,
      name: spec.name,
      type: spec.type,
      mimeType: spec.mimeType,
      content: spec.content,
      createdAt: at,
      modifiedAt: at,
    };
  });
}
