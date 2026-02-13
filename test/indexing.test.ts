import { describe, expect, it } from "vitest";

import { buildGlobalIndexMap, filterNotes, getCanonicalNotes } from "../src/commands.js";
import { writeNotes } from "../src/storage.js";
import { withTempStorage } from "./testUtils.js";

import type { Note } from "../src/types.js";

const buildNote = (index: number): Note => ({
  id: `note-${index}`,
  text: `note text ${index}`,
  createdAt: new Date(2024, 0, index + 1).toISOString(),
  pinned: false
});

describe("index semantics", () => {
  it("keeps global indexes stable when filtering", async () => {
    await withTempStorage(async () => {
      const notes: Note[] = [
        {
          id: "alpha",
          text: "alpha note",
          createdAt: "2025-01-03T00:00:00.000Z",
          pinned: false
        },
        {
          id: "beta",
          text: "beta note",
          createdAt: "2025-01-02T00:00:00.000Z",
          pinned: false
        },
        {
          id: "gamma",
          text: "gamma alpha",
          createdAt: "2025-01-01T00:00:00.000Z",
          pinned: false
        }
      ];

      await writeNotes(notes);
      const listResult = await getCanonicalNotes();
      const canonicalNotes = listResult.data?.notes ?? [];
      const globalIndexMap = buildGlobalIndexMap(canonicalNotes);
      const filteredNotes = filterNotes(canonicalNotes, "alpha");

      expect(filteredNotes.map((note) => globalIndexMap.get(note.id))).toEqual([1, 3]);
    });
  });

  it("builds indexes correctly for large lists", async () => {
    await withTempStorage(async () => {
      const notes = Array.from({ length: 1200 }, (_, index) => buildNote(index));
      await writeNotes(notes);

      const listResult = await getCanonicalNotes();
      const canonicalNotes = listResult.data?.notes ?? [];
      const globalIndexMap = buildGlobalIndexMap(canonicalNotes);

      expect(canonicalNotes).toHaveLength(1200);
      expect(globalIndexMap.get(canonicalNotes[0]?.id ?? "")).toBe(1);
      expect(globalIndexMap.get(canonicalNotes[1199]?.id ?? "")).toBe(1200);
    });
  });
});
