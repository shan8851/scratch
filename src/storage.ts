import crypto from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  appDirectoryName,
  configDirectoryName,
  notesFileName,
  storageFileEnvVar
} from "./constants.js";

import type { Note } from "./types.js";

type ParseNotesResult =
  | {
      ok: true;
      notes: Note[];
    }
  | {
      ok: false;
      reason: string;
    };

const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string(),
  pinned: z.boolean().optional()
}).transform((rawNote): Note => ({
  id: rawNote.id,
  text: rawNote.text,
  createdAt: rawNote.createdAt,
  pinned: rawNote.pinned ?? false
}));

const notesFileSchema = z.object({
  notes: z.array(noteSchema)
});

const defaultNotesPayload = JSON.stringify({ notes: [] satisfies Note[] }, null, 2) + "\n";

const getDefaultNotesFilePath = (): string =>
  path.join(os.homedir(), configDirectoryName, appDirectoryName, notesFileName);

export const resolveNotesFilePath = (): string =>
  process.env[storageFileEnvVar] ?? getDefaultNotesFilePath();

const toIsoTimestampValue = (rawIsoTimestamp: string): number => {
  const parsedValue = Date.parse(rawIsoTimestamp);
  return Number.isNaN(parsedValue) ? 0 : parsedValue;
};

export const normalizeNoteText = (inputText: string): string => inputText.trim();

const normalizeStoredNote = (note: Note): Note => ({
  id: note.id,
  text: normalizeNoteText(note.text),
  createdAt: note.createdAt,
  pinned: note.pinned
});

export const sortNotes = (notes: Note[]): Note[] =>
  [...notes]
    .map(normalizeStoredNote)
    .filter((note) => note.text.length > 0)
    .sort((left, right) => {
      const pinnedDifference = Number(right.pinned) - Number(left.pinned);
      if (pinnedDifference !== 0) {
        return pinnedDifference;
      }

      const createdAtDifference =
        toIsoTimestampValue(right.createdAt) - toIsoTimestampValue(left.createdAt);
      if (createdAtDifference !== 0) {
        return createdAtDifference;
      }

      return left.id.localeCompare(right.id);
    });

const parseNotesFileData = (rawFileContent: string): ParseNotesResult => {
  if (rawFileContent.trim().length === 0) {
    return { ok: true, notes: [] };
  }

  try {
    const parsedJson: unknown = JSON.parse(rawFileContent);
    const parsedDataResult = notesFileSchema.safeParse(parsedJson);

    if (!parsedDataResult.success) {
      const issuePath = parsedDataResult.error.issues[0]?.path.join(".") ?? "notes";
      const issueMessage = parsedDataResult.error.issues[0]?.message ?? "Invalid notes file";
      return {
        ok: false,
        reason: `Schema validation failed at "${issuePath}": ${issueMessage}.`
      };
    }

    return {
      ok: true,
      notes: sortNotes(parsedDataResult.data.notes)
    };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "Invalid JSON content.";
    return {
      ok: false,
      reason: `JSON parse failed: ${reason}`
    };
  }
};

const createCorruptBackupPath = (notesFilePath: string): string =>
  `${notesFilePath}.corrupt.${Date.now()}.${process.pid}.bak`;

const backupCorruptNotesFile = async (
  notesFilePath: string,
  rawFileContent: string
): Promise<string | null> => {
  const backupFilePath = createCorruptBackupPath(notesFilePath);

  try {
    await writeFile(backupFilePath, rawFileContent, { encoding: "utf8", flag: "wx" });
    return backupFilePath;
  } catch {
    return null;
  }
};

export const ensureStorage = async (): Promise<string> => {
  const notesFilePath = resolveNotesFilePath();
  const notesDirectoryPath = path.dirname(notesFilePath);

  await mkdir(notesDirectoryPath, { recursive: true });

  try {
    await access(notesFilePath);
  } catch {
    await writeFile(notesFilePath, defaultNotesPayload, { encoding: "utf8" });
  }

  return notesFilePath;
};

export const readNotes = async (): Promise<Note[]> => {
  const notesFilePath = await ensureStorage();
  const rawFileContent = await readFile(notesFilePath, { encoding: "utf8" });
  const parsedNotesResult = parseNotesFileData(rawFileContent);

  if (parsedNotesResult.ok) {
    return parsedNotesResult.notes;
  }

  const backupFilePath = await backupCorruptNotesFile(notesFilePath, rawFileContent);
  const backupMessage =
    backupFilePath === null
      ? "Backup creation failed."
      : `Backup created at ${backupFilePath}.`;
  throw new Error(
    `Notes storage is corrupted (${parsedNotesResult.reason}) ${backupMessage} Restore or fix the JSON file before retrying.`
  );
};

export const writeNotes = async (notes: Note[]): Promise<void> => {
  const notesFilePath = await ensureStorage();
  const tempFilePath = `${notesFilePath}.${process.pid}.${Date.now()}.tmp`;
  const normalizedNotes = sortNotes(notes);
  const payload = JSON.stringify({ notes: normalizedNotes }, null, 2) + "\n";

  await writeFile(tempFilePath, payload, { encoding: "utf8" });
  await rename(tempFilePath, notesFilePath);
};

export const createNote = (text: string): Note => ({
  id: crypto.randomUUID(),
  text: normalizeNoteText(text),
  createdAt: new Date().toISOString(),
  pinned: false
});
