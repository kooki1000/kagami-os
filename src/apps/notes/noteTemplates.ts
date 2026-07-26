/** A starter template offered from the sidebar's "New" menu (U11). */
export interface NoteTemplate {
  id: string;
  label: string;
  /** Suggested file name — `uniqueChildName` (fsStore) handles any collision. */
  fileName: string;
  content: string;
}

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    label: "Blank Note",
    fileName: "Untitled.md",
    content: "",
  },
  {
    id: "meeting",
    label: "Meeting Notes",
    fileName: "Meeting notes.md",
    content: `# Meeting notes

**Date:**
**Attendees:**

## Agenda

-

## Notes

## Action items

- [ ]
`,
  },
  {
    id: "checklist",
    label: "Checklist",
    fileName: "Checklist.md",
    content: `# Checklist

- [ ]
- [ ]
- [ ]
`,
  },
];

/** Look up a template by id, falling back to the first (blank) one for an unknown id. */
export function findTemplate(id: string): NoteTemplate {
  return NOTE_TEMPLATES.find(t => t.id === id) ?? NOTE_TEMPLATES[0];
}
