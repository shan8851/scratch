import blessed from "blessed";

import {
  addNote,
  buildGlobalIndexMap,
  clearNotes,
  copyNoteByIndex,
  deleteNoteByIndex,
  filterNotes,
  getCanonicalNotes,
  togglePinByIndex
} from "./commands.js";
import { parsePaletteCommand } from "./commandParser.js";
import {
  defaultFooterMessageTimeoutMs,
  headerKeybinds,
  headerTitle
} from "./constants.js";
import { acquireLock } from "./locking.js";

import type { AppMessage, Note } from "./types.js";

type TuiMode = "list" | "input" | "filter" | "command" | "confirmDelete" | "confirmClear";

type TuiState = {
  notes: Note[];
  selectedNoteId: string | null;
  inputDraft: string;
  filterQuery: string;
  filterDraft: string;
  commandDraft: string;
  mode: TuiMode;
  pendingDeleteIndex: number | null;
  statusMessage: AppMessage | null;
};

const escapeTags = (value: string): string =>
  value.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}");

const normalizeInlineText = (value: string): string => value.replace(/\s+/g, " ").trim();

const wrapLongText = (value: string, maxWidth: number): string[] => {
  if (maxWidth <= 0) {
    return [value];
  }

  const normalizedText = normalizeInlineText(value);
  if (normalizedText.length <= maxWidth) {
    return [normalizedText];
  }

  const words = normalizedText.split(" ");
  const wrappedLines = words.reduce<string[]>(
    (lines, word) => {
      const currentLine = lines[lines.length - 1] ?? "";
      const candidateLine =
        currentLine.length === 0 ? word : `${currentLine} ${word}`;

      if (candidateLine.length <= maxWidth) {
        return [...lines.slice(0, -1), candidateLine];
      }

      if (word.length <= maxWidth) {
        return [...lines, word];
      }

      const brokenChunks = word.match(new RegExp(`.{1,${maxWidth}}`, "g")) ?? [word];
      return [...lines, ...brokenChunks];
    },
    [""]
  );

  return wrappedLines.filter((line) => line.length > 0);
};

const isPrintableCharacter = (
  character: string | undefined,
  key: blessed.Widgets.Events.IKeyEventArg
): boolean =>
  character !== undefined &&
  character.length > 0 &&
  !key.ctrl &&
  !key.meta &&
  key.name !== "return" &&
  key.name !== "enter";

const createEmptyState = (): TuiState => ({
  notes: [],
  selectedNoteId: null,
  inputDraft: "",
  filterQuery: "",
  filterDraft: "",
  commandDraft: "",
  mode: "list",
  pendingDeleteIndex: null,
  statusMessage: null
});

const getFooterMessageByLevel = (message: AppMessage): string => {
  const levelPrefix =
    message.level === "info"
      ? "[info]"
      : message.level === "warn"
        ? "[warn]"
        : "[error]";
  return `${levelPrefix} ${message.text}`;
};

export const runTui = async (): Promise<number> => {
  const sessionLockResult = await acquireLock({ kind: "session", holder: "tui" });
  if (!sessionLockResult.ok) {
    process.stderr.write(`${sessionLockResult.message}\n`);
    return 1;
  }

  const sessionLock = sessionLockResult.lock;
  const screen = blessed.screen({
    smartCSR: true,
    title: "scratch",
    fullUnicode: true,
    dockBorders: true
  });

  const headerBox = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: "100%",
    height: 2,
    tags: true,
    style: {
      fg: "#d1d5db",
      bg: "#111827"
    }
  });

  blessed.box({
    parent: screen,
    top: 2,
    left: 0,
    width: "100%",
    height: 1,
    content: "New note input (Tab to edit, Enter to save, Esc to leave input mode):",
    style: {
      fg: "#9ca3af",
      bg: "#0f172a"
    }
  });

  const inputBox = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: "100%",
    height: 3,
    border: "line",
    tags: true,
    style: {
      fg: "#e5e7eb",
      bg: "#0b1220",
      border: {
        fg: "#374151"
      }
    }
  });

  const notesList = blessed.list({
    parent: screen,
    top: 6,
    left: 0,
    width: "100%",
    bottom: 1,
    border: "line",
    mouse: true,
    keys: false,
    tags: true,
    scrollable: true,
    vi: false,
    style: {
      fg: "#d1d5db",
      bg: "#0b1220",
      border: {
        fg: "#374151"
      },
      item: {
        fg: "#d1d5db",
        bg: "#0b1220"
      },
      selected: {
        fg: "#0b1220",
        bg: "#7dd3fc",
        bold: true
      }
    },
    scrollbar: {
      ch: " ",
      track: {
        bg: "#1f2937"
      },
      style: {
        bg: "#60a5fa"
      }
    }
  });

  const footerBox = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: {
      fg: "#d1d5db",
      bg: "#111827"
    }
  });

  const state = createEmptyState();
  let footerMessageTimeout: NodeJS.Timeout | undefined;
  let isHandlingAsyncOperation = false;

  const getFilteredNotes = (): Note[] => filterNotes(state.notes, state.filterQuery);

  const setStatus = (text: string, level: AppMessage["level"]): void => {
    state.statusMessage = {
      level,
      text,
      at: Date.now()
    };

    if (footerMessageTimeout !== undefined) {
      clearTimeout(footerMessageTimeout);
    }

    footerMessageTimeout = setTimeout(() => {
      state.statusMessage = null;
      renderFooter();
      screen.render();
    }, defaultFooterMessageTimeoutMs);
  };

  const getGlobalIndexForNoteId = (noteId: string): number | null => {
    const indexMap = buildGlobalIndexMap(state.notes);
    return indexMap.get(noteId) ?? null;
  };

  const ensureSelection = (preferredNoteId?: string): void => {
    const filteredNotes = getFilteredNotes();
    if (filteredNotes.length === 0) {
      state.selectedNoteId = null;
      return;
    }

    const preferredId = preferredNoteId ?? state.selectedNoteId;
    const hasPreferred =
      preferredId !== null &&
      preferredId !== undefined &&
      filteredNotes.some((note) => note.id === preferredId);

    state.selectedNoteId = hasPreferred
      ? preferredId
      : (filteredNotes[0]?.id ?? null);
  };

  const renderHeader = (): void => {
    const modeLabel = `mode=${state.mode}`;
    headerBox.setContent(
      `{bold}${headerTitle}{/bold}  ${modeLabel}\n${headerKeybinds}`
    );
  };

  const renderInput = (): void => {
    const cursor = state.mode === "input" ? "█" : "";
    const promptPrefix = "> ";
    const renderedValue = escapeTags(state.inputDraft);
    inputBox.setContent(`${promptPrefix}${renderedValue}${cursor}`);
  };

  const renderList = (): void => {
    const filteredNotes = getFilteredNotes();
    const listWidth = Math.max(20, screen.program.cols - 6);
    const indexMap = buildGlobalIndexMap(state.notes);
    const indexDigits = Math.max(2, String(state.notes.length).length);

    const items =
      filteredNotes.length === 0
        ? [
            state.filterQuery.length > 0
              ? "No matches for current filter."
              : "No notes yet. Press Tab to type a note."
          ]
        : filteredNotes.map((note) => {
            const globalIndex = indexMap.get(note.id) ?? 0;
            const indexLabel = String(globalIndex).padStart(indexDigits, " ");
            const pinLabel = note.pinned ? "P" : " ";
            const prefix = `[${indexLabel}] [${pinLabel}] `;
            const wrappedTextLines = wrapLongText(
              note.text,
              Math.max(8, listWidth - prefix.length)
            );
            const firstLine = `${prefix}${escapeTags(wrappedTextLines[0] ?? "")}`;
            const continuationPrefix = " ".repeat(prefix.length);
            const continuationLines = wrappedTextLines
              .slice(1)
              .map((line) => `${continuationPrefix}${escapeTags(line)}`);

            return [firstLine, ...continuationLines].join("\n");
          });

    notesList.setItems(items);

    if (filteredNotes.length === 0) {
      notesList.select(0);
      return;
    }

    const selectedIndex = filteredNotes.findIndex(
      (note) => note.id === state.selectedNoteId
    );
    const nextSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
    notesList.select(nextSelectedIndex);
    notesList.scrollTo(nextSelectedIndex);
  };

  const renderFooter = (): void => {
    const footerContent =
      state.mode === "filter"
        ? `/ ${escapeTags(state.filterDraft)}█`
        : state.mode === "command"
          ? `: ${escapeTags(state.commandDraft)}█`
          : state.mode === "confirmDelete"
            ? `Delete index ${state.pendingDeleteIndex ?? "?"}? (y/n)`
            : state.mode === "confirmClear"
              ? "Clear all notes? (y/n)"
              : state.statusMessage !== null
                ? getFooterMessageByLevel(state.statusMessage)
                : `notes=${state.notes.length} filter="${state.filterQuery}"`;

    footerBox.setContent(footerContent);
  };

  const renderAll = (): void => {
    renderHeader();
    renderInput();
    renderList();
    renderFooter();
    screen.render();
  };

  const refreshNotes = async (preferredNoteId?: string): Promise<void> => {
    const result = await getCanonicalNotes();
    if (!result.ok) {
      setStatus(result.message, "error");
      renderFooter();
      screen.render();
      return;
    }

    state.notes = result.data?.notes ?? [];
    ensureSelection(preferredNoteId);
    renderAll();
  };

  const moveSelectionBy = (offset: number): void => {
    const filteredNotes = getFilteredNotes();
    if (filteredNotes.length === 0) {
      return;
    }

    const currentIndex = filteredNotes.findIndex(
      (note) => note.id === state.selectedNoteId
    );
    const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
    const boundedNextIndex = Math.max(
      0,
      Math.min(filteredNotes.length - 1, safeCurrentIndex + offset)
    );
    state.selectedNoteId = filteredNotes[boundedNextIndex]?.id ?? null;
    renderAll();
  };

  const selectBoundary = (boundary: "top" | "bottom"): void => {
    const filteredNotes = getFilteredNotes();
    if (filteredNotes.length === 0) {
      return;
    }

    state.selectedNoteId =
      boundary === "top"
        ? (filteredNotes[0]?.id ?? null)
        : (filteredNotes[filteredNotes.length - 1]?.id ?? null);
    renderAll();
  };

  const getSelectedGlobalIndex = (): number | null => {
    const selectedNoteId = state.selectedNoteId;
    if (selectedNoteId === null) {
      return null;
    }

    return getGlobalIndexForNoteId(selectedNoteId);
  };

  const withAsyncOperation = async (
    operation: () => Promise<void>
  ): Promise<void> => {
    if (isHandlingAsyncOperation) {
      return;
    }

    isHandlingAsyncOperation = true;
    try {
      await operation();
    } finally {
      isHandlingAsyncOperation = false;
    }
  };

  const handleAddFromInput = async (): Promise<void> => {
    const result = await addNote(state.inputDraft);
    if (!result.ok) {
      setStatus(result.message, "warn");
      renderAll();
      return;
    }

    state.inputDraft = "";
    state.mode = "list";
    setStatus(result.message, "info");
    await refreshNotes(result.data?.note.id);
  };

  const handleCopySelected = async (): Promise<void> => {
    const selectedIndex = getSelectedGlobalIndex();
    if (selectedIndex === null) {
      setStatus("No note selected.", "warn");
      renderAll();
      return;
    }

    const result = await copyNoteByIndex(selectedIndex);
    if (!result.ok) {
      setStatus(result.message, "warn");
      renderAll();
      return;
    }

    setStatus(`Copied index ${selectedIndex}.`, "info");
    renderAll();
  };

  const startDeleteConfirm = (): void => {
    const selectedIndex = getSelectedGlobalIndex();
    if (selectedIndex === null) {
      setStatus("No note selected.", "warn");
      renderAll();
      return;
    }

    state.pendingDeleteIndex = selectedIndex;
    state.mode = "confirmDelete";
    renderAll();
  };

  const confirmDelete = async (): Promise<void> => {
    const pendingIndex = state.pendingDeleteIndex;
    state.pendingDeleteIndex = null;
    state.mode = "list";

    if (pendingIndex === null) {
      renderAll();
      return;
    }

    const result = await deleteNoteByIndex(pendingIndex);
    if (!result.ok) {
      setStatus(result.message, "warn");
      renderAll();
      return;
    }

    setStatus(result.message, "info");
    await refreshNotes();
  };

  const cancelDeleteConfirm = (): void => {
    state.pendingDeleteIndex = null;
    state.mode = "list";
    setStatus("Delete canceled.", "info");
    renderAll();
  };

  const handleTogglePin = async (): Promise<void> => {
    const selectedIndex = getSelectedGlobalIndex();
    if (selectedIndex === null) {
      setStatus("No note selected.", "warn");
      renderAll();
      return;
    }

    const result = await togglePinByIndex(selectedIndex);
    if (!result.ok) {
      setStatus(result.message, "warn");
      renderAll();
      return;
    }

    state.mode = "list";
    setStatus(result.message, "info");
    await refreshNotes(result.data?.note.id);
  };

  const executeCommandPalette = async (): Promise<void> => {
    const rawCommand = state.commandDraft.trim();
    state.commandDraft = "";
    state.mode = "list";
    const parsedCommand = parsePaletteCommand(rawCommand);

    if (parsedCommand.kind === "invalid") {
      setStatus(parsedCommand.reason, "warn");
      renderAll();
      return;
    }

    if (parsedCommand.kind === "clear") {
      state.mode = "confirmClear";
      renderAll();
      return;
    }

    if (parsedCommand.kind === "copy") {
      const result = await copyNoteByIndex(parsedCommand.index);
      setStatus(result.message, result.ok ? "info" : "warn");
      renderAll();
      return;
    }

    if (parsedCommand.kind === "delete") {
      const result = await deleteNoteByIndex(parsedCommand.index);
      setStatus(result.message, result.ok ? "info" : "warn");
      if (result.ok) {
        await refreshNotes();
      } else {
        renderAll();
      }
      return;
    }

    const addResult = await addNote(parsedCommand.text);
    setStatus(addResult.message, addResult.ok ? "info" : "warn");
    if (addResult.ok) {
      await refreshNotes(addResult.data?.note.id);
    } else {
      renderAll();
    }
  };

  const confirmClear = async (): Promise<void> => {
    const result = await clearNotes(true);
    state.mode = "list";
    if (!result.ok) {
      setStatus(result.message, "warn");
      renderAll();
      return;
    }

    setStatus("Cleared all notes.", "info");
    await refreshNotes();
  };

  const cancelClear = (): void => {
    state.mode = "list";
    setStatus("Clear canceled.", "info");
    renderAll();
  };

  const appendToDraft = (value: string, target: "input" | "filter" | "command"): void => {
    if (target === "input") {
      state.inputDraft = `${state.inputDraft}${value}`;
      return;
    }

    if (target === "filter") {
      state.filterDraft = `${state.filterDraft}${value}`;
      return;
    }

    state.commandDraft = `${state.commandDraft}${value}`;
  };

  const removeLastCharacter = (target: "input" | "filter" | "command"): void => {
    if (target === "input") {
      state.inputDraft = state.inputDraft.slice(0, -1);
      return;
    }

    if (target === "filter") {
      state.filterDraft = state.filterDraft.slice(0, -1);
      return;
    }

    state.commandDraft = state.commandDraft.slice(0, -1);
  };

  const handleListModeKeypress = async (
    character: string | undefined,
    key: blessed.Widgets.Events.IKeyEventArg
  ): Promise<void> => {
    if (key.name === "down" || character === "j") {
      moveSelectionBy(1);
      return;
    }

    if (key.name === "up" || character === "k") {
      moveSelectionBy(-1);
      return;
    }

    if (character === "g" && !key.shift) {
      selectBoundary("top");
      return;
    }

    if (character === "G" || (character === "g" && key.shift)) {
      selectBoundary("bottom");
      return;
    }

    if (character === "/" || key.name === "slash") {
      state.mode = "filter";
      state.filterDraft = state.filterQuery;
      renderAll();
      return;
    }

    if (character === ":") {
      state.mode = "command";
      state.commandDraft = "";
      renderAll();
      return;
    }

    if (character === "d") {
      startDeleteConfirm();
      return;
    }

    if (character === "c" || character === "y") {
      await handleCopySelected();
      return;
    }

    if (character === "p") {
      await handleTogglePin();
      return;
    }

    if (character === "q") {
      screen.destroy();
      return;
    }

    if (key.name === "tab" || character === "i") {
      state.mode = "input";
      renderAll();
    }
  };

  const handleInputModeKeypress = async (
    character: string | undefined,
    key: blessed.Widgets.Events.IKeyEventArg
  ): Promise<void> => {
    if (key.name === "escape") {
      state.mode = "list";
      renderAll();
      return;
    }

    if (key.name === "tab") {
      state.mode = "list";
      renderAll();
      return;
    }

    if (key.name === "backspace") {
      removeLastCharacter("input");
      renderAll();
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      await handleAddFromInput();
      return;
    }

    if (isPrintableCharacter(character, key)) {
      appendToDraft(character ?? "", "input");
      renderAll();
    }
  };

  const handleFilterModeKeypress = (
    character: string | undefined,
    key: blessed.Widgets.Events.IKeyEventArg
  ): void => {
    if (key.name === "escape") {
      state.mode = "list";
      state.filterDraft = "";
      renderAll();
      return;
    }

    if (key.name === "backspace") {
      removeLastCharacter("filter");
      renderAll();
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      state.filterQuery = state.filterDraft.trim();
      state.mode = "list";
      ensureSelection();
      setStatus(
        state.filterQuery.length === 0
          ? "Filter cleared."
          : `Filter: ${state.filterQuery}`,
        "info"
      );
      renderAll();
      return;
    }

    if (isPrintableCharacter(character, key)) {
      appendToDraft(character ?? "", "filter");
      renderAll();
    }
  };

  const handleCommandModeKeypress = async (
    character: string | undefined,
    key: blessed.Widgets.Events.IKeyEventArg
  ): Promise<void> => {
    if (key.name === "escape") {
      state.mode = "list";
      state.commandDraft = "";
      renderAll();
      return;
    }

    if (key.name === "backspace") {
      removeLastCharacter("command");
      renderAll();
      return;
    }

    if (key.name === "enter" || key.name === "return") {
      await executeCommandPalette();
      return;
    }

    if (isPrintableCharacter(character, key)) {
      appendToDraft(character ?? "", "command");
      renderAll();
    }
  };

  notesList.on("select item", (_, selectedIndex) => {
    const filteredNotes = getFilteredNotes();
    const note = filteredNotes[selectedIndex];
    if (note !== undefined) {
      state.selectedNoteId = note.id;
      renderAll();
    }
  });

  screen.on("resize", () => {
    renderAll();
  });

  screen.key(["C-c"], () => {
    screen.destroy();
  });

  screen.on("keypress", (character, key) => {
    void withAsyncOperation(async () => {
      if (state.mode === "confirmDelete") {
        if (character === "y") {
          await confirmDelete();
          return;
        }

        if (character === "n" || key.name === "escape") {
          cancelDeleteConfirm();
        }
        return;
      }

      if (state.mode === "confirmClear") {
        if (character === "y") {
          await confirmClear();
          return;
        }

        if (character === "n" || key.name === "escape") {
          cancelClear();
        }
        return;
      }

      if (state.mode === "input") {
        await handleInputModeKeypress(character, key);
        return;
      }

      if (state.mode === "filter") {
        handleFilterModeKeypress(character, key);
        return;
      }

      if (state.mode === "command") {
        await handleCommandModeKeypress(character, key);
        return;
      }

      await handleListModeKeypress(character, key);
    });
  });

  try {
    await refreshNotes();
    renderAll();

    await new Promise<void>((resolve) => {
      screen.once("destroy", () => {
        if (footerMessageTimeout !== undefined) {
          clearTimeout(footerMessageTimeout);
        }

        resolve();
      });
    });
    return 0;
  } finally {
    await sessionLock.release();
  }
};
