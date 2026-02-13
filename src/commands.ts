import { copyToClipboard } from "./clipboard.js";
import { acquireLock } from "./locking.js";
import {
  createNote,
  normalizeNoteText,
  readNotes,
  sortNotes,
  writeNotes
} from "./storage.js";

import type { CommandResult, Note } from "./types.js";

type NotesPayload = {
  notes: Note[];
};

type IndexedNotePayload = {
  note: Note;
  index: number;
  notes: Note[];
};

const createSuccessResult = <TData>(
  message: string,
  data?: TData
): CommandResult<TData> =>
  data === undefined
    ? {
        ok: true,
        message,
        exitCode: 0
      }
    : {
        ok: true,
        message,
        exitCode: 0,
        data
      };

const createFailureResult = <TData>(
  message: string,
  exitCode = 1
): CommandResult<TData> => ({
  ok: false,
  message,
  exitCode
});

const isValidIndex = (index: number): boolean =>
  Number.isInteger(index) && index > 0;

const getCanonicalNotesInternal = async (): Promise<Note[]> => sortNotes(await readNotes());

const getNoteByIndex = (
  notes: Note[],
  index1Based: number
): { note: Note; zeroBasedIndex: number } | undefined => {
  if (!isValidIndex(index1Based)) {
    return undefined;
  }

  const zeroBasedIndex = index1Based - 1;
  const note = notes[zeroBasedIndex];
  return note === undefined ? undefined : { note, zeroBasedIndex };
};

export const buildGlobalIndexMap = (notes: Note[]): Map<string, number> =>
  new Map(notes.map((note, index) => [note.id, index + 1] as const));

export const filterNotes = (notes: Note[], filterQuery: string): Note[] => {
  const normalizedQuery = filterQuery.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return notes;
  }

  return notes.filter((note) => note.text.toLowerCase().includes(normalizedQuery));
};

export const getCanonicalNotes = async (): Promise<CommandResult<NotesPayload>> => {
  try {
    const notes = await getCanonicalNotesInternal();
    return createSuccessResult("Loaded notes.", { notes });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load notes.";
    return createFailureResult(message);
  }
};

const runWithWriteLock = async <TData>(
  holder: string,
  operation: () => Promise<CommandResult<TData>>
): Promise<CommandResult<TData>> => {
  const lockResult = await acquireLock({ kind: "write", holder });
  if (!lockResult.ok) {
    return createFailureResult(lockResult.message, 1);
  }

  try {
    return await operation();
  } finally {
    await lockResult.lock.release();
  }
};

export const addNote = async (
  rawText: string
): Promise<CommandResult<IndexedNotePayload>> => {
  const normalizedText = normalizeNoteText(rawText);
  if (normalizedText.length === 0) {
    return createFailureResult("Ignored empty note.", 1);
  }

  return runWithWriteLock("add", async () => {
    try {
      const currentNotes = await getCanonicalNotesInternal();
      const nextNote = createNote(normalizedText);
      const nextNotes = sortNotes([nextNote, ...currentNotes]);
      await writeNotes(nextNotes);

      const index = nextNotes.findIndex((note) => note.id === nextNote.id) + 1;
      return createSuccessResult(`Added index ${index}.`, {
        note: nextNote,
        index,
        notes: nextNotes
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add note.";
      return createFailureResult(message);
    }
  });
};

export const copyNoteByIndex = async (
  index1Based: number
): Promise<CommandResult<IndexedNotePayload>> => {
  if (!isValidIndex(index1Based)) {
    return createFailureResult(`Invalid index ${index1Based}.`, 1);
  }

  try {
    const notes = await getCanonicalNotesInternal();
    const noteMatch = getNoteByIndex(notes, index1Based);
    if (noteMatch === undefined) {
      return createFailureResult(`Invalid index ${index1Based}.`, 1);
    }

    const clipboardResult = await copyToClipboard(noteMatch.note.text);
    if (!clipboardResult.ok) {
      return createFailureResult(
        `Clipboard unavailable for index ${index1Based}: ${clipboardResult.reason}`,
        1
      );
    }

    return createSuccessResult(`Copied index ${index1Based}.`, {
      note: noteMatch.note,
      index: index1Based,
      notes
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to copy note.";
    return createFailureResult(message);
  }
};

export const deleteNoteByIndex = async (
  index1Based: number
): Promise<CommandResult<IndexedNotePayload>> => {
  if (!isValidIndex(index1Based)) {
    return createFailureResult(`Invalid index ${index1Based}.`, 1);
  }

  return runWithWriteLock("delete", async () => {
    try {
      const notes = await getCanonicalNotesInternal();
      const noteMatch = getNoteByIndex(notes, index1Based);
      if (noteMatch === undefined) {
        return createFailureResult(`Invalid index ${index1Based}.`, 1);
      }

      const nextNotes = notes.filter((_, noteIndex) => noteIndex !== noteMatch.zeroBasedIndex);
      await writeNotes(nextNotes);

      return createSuccessResult(`Deleted index ${index1Based}.`, {
        note: noteMatch.note,
        index: index1Based,
        notes: nextNotes
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete note.";
      return createFailureResult(message);
    }
  });
};

export const togglePinByIndex = async (
  index1Based: number
): Promise<CommandResult<IndexedNotePayload>> => {
  if (!isValidIndex(index1Based)) {
    return createFailureResult(`Invalid index ${index1Based}.`, 1);
  }

  return runWithWriteLock("toggle-pin", async () => {
    try {
      const notes = await getCanonicalNotesInternal();
      const noteMatch = getNoteByIndex(notes, index1Based);
      if (noteMatch === undefined) {
        return createFailureResult(`Invalid index ${index1Based}.`, 1);
      }

      const toggledNote: Note = {
        ...noteMatch.note,
        pinned: !noteMatch.note.pinned
      };

      const nextNotes = sortNotes(
        notes.map((note, noteIndex) =>
          noteIndex === noteMatch.zeroBasedIndex ? toggledNote : note
        )
      );
      await writeNotes(nextNotes);

      const nextIndex = nextNotes.findIndex((note) => note.id === toggledNote.id) + 1;
      const actionLabel = toggledNote.pinned ? "Pinned" : "Unpinned";

      return createSuccessResult(`${actionLabel} index ${nextIndex}.`, {
        note: toggledNote,
        index: nextIndex,
        notes: nextNotes
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to pin note.";
      return createFailureResult(message);
    }
  });
};

export const clearNotes = async (
  confirmed: boolean
): Promise<CommandResult<NotesPayload>> => {
  if (!confirmed) {
    return createFailureResult("Clear requires confirmation.", 1);
  }

  return runWithWriteLock("clear", async () => {
    try {
      await writeNotes([]);
      return createSuccessResult("Cleared all notes.", { notes: [] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to clear notes.";
      return createFailureResult(message);
    }
  });
};
