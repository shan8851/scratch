import { describe, expect, it, vi } from "vitest";

vi.mock("../src/clipboard.js", () => ({
  copyToClipboard: vi.fn(() => Promise.resolve({ ok: true as const }))
}));

import {
  addNote,
  clearNotes,
  copyNoteByIndex,
  deleteNoteByIndex,
  getCanonicalNotes,
  togglePinByIndex
} from "../src/commands.js";
import { writeNotes } from "../src/storage.js";
import { withTempStorage } from "./testUtils.js";

import type { Note } from "../src/types.js";

const createSeedNotes = (): Note[] => [
  {
    id: "older-unpinned",
    text: "older unpinned",
    createdAt: "2024-01-01T00:00:00.000Z",
    pinned: false
  },
  {
    id: "newer-unpinned",
    text: "newer unpinned",
    createdAt: "2025-01-01T00:00:00.000Z",
    pinned: false
  },
  {
    id: "pinned-note",
    text: "pinned note",
    createdAt: "2023-01-01T00:00:00.000Z",
    pinned: true
  }
];

describe("commands", () => {
  it("ignores empty notes", async () => {
    await withTempStorage(async () => {
      const result = await addNote("   ");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("Ignored empty note");
    });
  });

  it("adds and lists notes in canonical order", async () => {
    await withTempStorage(async () => {
      await writeNotes(createSeedNotes());
      const addResult = await addNote("  fresh note  ");
      const listResult = await getCanonicalNotes();

      expect(addResult.ok).toBe(true);
      expect(listResult.ok).toBe(true);
      expect(listResult.data?.notes[0]?.text).toBe("pinned note");
      expect(listResult.data?.notes.some((note) => note.text === "fresh note")).toBe(true);
    });
  });

  it("copies and deletes by global 1-based index", async () => {
    await withTempStorage(async () => {
      await writeNotes(createSeedNotes());
      const copyResult = await copyNoteByIndex(1);
      const deleteResult = await deleteNoteByIndex(2);
      const listResult = await getCanonicalNotes();

      expect(copyResult.ok).toBe(true);
      expect(deleteResult.ok).toBe(true);
      expect(listResult.data?.notes).toHaveLength(2);
    });
  });

  it("toggles pin and re-sorts notes", async () => {
    await withTempStorage(async () => {
      await writeNotes(createSeedNotes());
      const toggleResult = await togglePinByIndex(2);
      const listResult = await getCanonicalNotes();

      expect(toggleResult.ok).toBe(true);
      expect(listResult.ok).toBe(true);
      expect(listResult.data?.notes[0]?.pinned).toBe(true);
      expect(listResult.data?.notes[1]?.pinned).toBe(true);
    });
  });

  it("requires explicit confirmation for clear", async () => {
    await withTempStorage(async () => {
      await writeNotes(createSeedNotes());

      const rejectedClearResult = await clearNotes(false);
      const acceptedClearResult = await clearNotes(true);

      expect(rejectedClearResult.ok).toBe(false);
      expect(acceptedClearResult.ok).toBe(true);
      expect(acceptedClearResult.data?.notes).toHaveLength(0);
    });
  });

  it("serializes concurrent add operations without data loss", async () => {
    await withTempStorage(async () => {
      const addResults = await Promise.all(
        Array.from({ length: 30 }, (_, index) => addNote(`note-${index + 1}`))
      );
      const listResult = await getCanonicalNotes();

      expect(addResults.every((result) => result.ok)).toBe(true);
      expect(listResult.ok).toBe(true);
      expect(listResult.data?.notes).toHaveLength(30);
    });
  });
});
