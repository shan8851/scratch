import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createNote,
  ensureStorage,
  normalizeNoteText,
  readNotes,
  sortNotes,
  writeNotes
} from "../src/storage.js";
import { withTempStorage } from "./testUtils.js";

describe("storage", () => {
  it("creates the notes file when missing", async () => {
    await withTempStorage(async (notesFilePath) => {
      await ensureStorage();

      const createdFileContent = await readFile(notesFilePath, { encoding: "utf8" });
      expect(createdFileContent.includes('"notes"')).toBe(true);
    });
  });

  it("sorts pinned first then newest", () => {
    const notes = sortNotes([
      {
        id: "alpha",
        text: "alpha",
        createdAt: "2024-01-01T00:00:00.000Z",
        pinned: false
      },
      {
        id: "beta",
        text: "beta",
        createdAt: "2025-01-01T00:00:00.000Z",
        pinned: false
      },
      {
        id: "gamma",
        text: "gamma",
        createdAt: "2023-01-01T00:00:00.000Z",
        pinned: true
      }
    ]);

    expect(notes.map((note) => note.id)).toEqual(["gamma", "beta", "alpha"]);
  });

  it("applies deterministic tie-break ordering by id for identical timestamps", () => {
    const sameTimestamp = "2025-01-01T00:00:00.000Z";
    const notes = sortNotes([
      { id: "zeta", text: "zeta", createdAt: sameTimestamp, pinned: false },
      { id: "alpha", text: "alpha", createdAt: sameTimestamp, pinned: false }
    ]);

    expect(notes.map((note) => note.id)).toEqual(["alpha", "zeta"]);
  });

  it("throws and writes a backup for malformed JSON content", async () => {
    await withTempStorage(async (notesFilePath) => {
      await writeFile(notesFilePath, "{not-json", { encoding: "utf8" });
      await expect(readNotes()).rejects.toThrow("Notes storage is corrupted");

      const directoryPath = path.dirname(notesFilePath);
      const fileNames = await readdir(directoryPath);
      const backupFiles = fileNames.filter((fileName) =>
        fileName.startsWith("notes.json.corrupt.")
      );

      expect(backupFiles.length).toBe(1);
    });
  });

  it("normalizes note text and persists notes", async () => {
    await withTempStorage(async () => {
      const normalizedText = normalizeNoteText("  hello world  ");
      const note = createNote(normalizedText);
      await writeNotes([note]);
      const loadedNotes = await readNotes();

      expect(normalizedText).toBe("hello world");
      expect(loadedNotes).toHaveLength(1);
      expect(loadedNotes[0]?.text).toBe("hello world");
    });
  });
});
