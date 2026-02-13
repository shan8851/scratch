import { Command, InvalidArgumentError } from "commander";

import {
  addNote,
  clearNotes,
  copyNoteByIndex,
  deleteNoteByIndex,
  getCanonicalNotes
} from "./commands.js";
import { runTui } from "./tui.js";

import type { CommandResult, Note } from "./types.js";

const parseIndexArgument = (rawValue: string): number => {
  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new InvalidArgumentError("Index must be a positive integer.");
  }

  return parsedValue;
};

const writeStdout = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const writeStderr = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const renderListLine = (note: Note, index1Based: number): string => {
  const pinnedMarker = note.pinned ? "P" : " ";
  const safeInlineText = note.text.replace(/\s+/g, " ").trim();
  const paddedIndex = String(index1Based).padStart(4, " ");

  return `[${paddedIndex}] [${pinnedMarker}] ${note.createdAt} ${safeInlineText}`;
};

const reportResult = <TData>(result: CommandResult<TData>): number => {
  if (result.ok) {
    writeStdout(result.message);
    return 0;
  }

  writeStderr(result.message);
  return result.exitCode;
};

export const runCli = async (argv: string[] = process.argv): Promise<number> => {
  const userArgs = argv.slice(2);
  if (userArgs.length === 0) {
    try {
      return await runTui();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unexpected CLI error.";
      writeStderr(message);
      return 1;
    }
  }

  const program = new Command();
  let resolvedExitCode = 0;

  program
    .name("scratch")
    .description("Local-first terminal scratchpad")
    .showHelpAfterError();

  program
    .command("tui")
    .description("Open the scratch TUI")
    .action(async () => {
      resolvedExitCode = await runTui();
    });

  program
    .command("add")
    .description("Add a new note")
    .argument("<text>", "note text")
    .action(async (text: string) => {
      const result = await addNote(text);
      resolvedExitCode = reportResult(result);
    });

  program
    .command("list")
    .description("List all notes in canonical order")
    .action(async () => {
      const result = await getCanonicalNotes();
      if (!result.ok) {
        resolvedExitCode = reportResult(result);
        return;
      }

      const notes = result.data?.notes ?? [];
      if (notes.length === 0) {
        writeStdout("No notes.");
        resolvedExitCode = 0;
        return;
      }

      notes
        .map((note, index) => renderListLine(note, index + 1))
        .forEach((line) => writeStdout(line));
      resolvedExitCode = 0;
    });

  program
    .command("copy")
    .description("Copy note text by global index")
    .argument("<index>", "global 1-based index", parseIndexArgument)
    .action(async (index: number) => {
      const result = await copyNoteByIndex(index);
      resolvedExitCode = reportResult(result);
    });

  program
    .command("delete")
    .description("Delete note by global index")
    .argument("<index>", "global 1-based index", parseIndexArgument)
    .action(async (index: number) => {
      const result = await deleteNoteByIndex(index);
      resolvedExitCode = reportResult(result);
    });

  program
    .command("clear")
    .description("Clear all notes")
    .option("--yes", "confirm clearing all notes", false)
    .action(async (options: { yes: boolean }) => {
      const result = await clearNotes(options.yes);
      resolvedExitCode = reportResult(result);
    });

  try {
    await program.parseAsync(argv, { from: "node" });
    return resolvedExitCode;
  } catch (error: unknown) {
    const commanderError = error as { code?: string; exitCode?: number; message?: string };
    if (commanderError.code?.startsWith("commander.")) {
      if (commanderError.message !== undefined) {
        writeStderr(commanderError.message);
      }

      return commanderError.exitCode ?? 1;
    }

    const message = error instanceof Error ? error.message : "Unexpected CLI error.";
    writeStderr(message);
    return 1;
  }
};
