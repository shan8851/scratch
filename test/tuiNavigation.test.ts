import { describe, expect, it, vi } from "vitest";

type MockScreenRef = {
  emit: (eventName: string, ...args: unknown[]) => boolean;
};

type MockListRef = {
  items: string[];
};

const mockTuiRuntime = vi.hoisted(() => ({
  screen: null as MockScreenRef | null,
  notesList: null as MockListRef | null
}));

vi.mock("../src/commands.js", () => {
  const notes = [
    {
      id: "first-note",
      text: "[ ] ship release notes",
      createdAt: "2026-02-13T00:00:00.000Z",
      pinned: false
    },
    {
      id: "second-note",
      text: "follow up with QA",
      createdAt: "2026-02-12T00:00:00.000Z",
      pinned: false
    }
  ];

  const [firstNote] = notes;
  if (firstNote === undefined) {
    throw new Error("Expected seeded mock notes.");
  }

  return {
    addNote: vi.fn(() =>
      Promise.resolve({
        ok: true,
        message: "Added index 1.",
        exitCode: 0,
        data: {
          note: firstNote,
          index: 1,
          notes
        }
      })
    ),
    buildGlobalIndexMap: (inputNotes: Array<{ id: string }>) =>
      new Map(inputNotes.map((note, index) => [note.id, index + 1] as const)),
    clearNotes: vi.fn(() =>
      Promise.resolve({
        ok: true,
        message: "Cleared all notes.",
        exitCode: 0,
        data: { notes: [] as typeof notes }
      })
    ),
    copyNoteByIndex: vi.fn(() =>
      Promise.resolve({
        ok: true,
        message: "Copied index 1.",
        exitCode: 0,
        data: {
          note: firstNote,
          index: 1,
          notes
        }
      })
    ),
    deleteNoteByIndex: vi.fn(() =>
      Promise.resolve({
        ok: true,
        message: "Deleted index 1.",
        exitCode: 0,
        data: {
          note: firstNote,
          index: 1,
          notes: notes.slice(1)
        }
      })
    ),
    filterNotes: (
      inputNotes: Array<{ text: string }>,
      query: string
    ): Array<{ text: string }> =>
      query.trim().length === 0
        ? inputNotes
        : inputNotes.filter((note) =>
            note.text.toLowerCase().includes(query.trim().toLowerCase())
          ),
    getCanonicalNotes: vi.fn(() =>
      Promise.resolve({
        ok: true,
        message: "Loaded notes.",
        exitCode: 0,
        data: { notes }
      })
    ),
    togglePinByIndex: vi.fn(() =>
      Promise.resolve({
        ok: true,
        message: "Pinned index 1.",
        exitCode: 0,
        data: {
          note: {
            ...firstNote,
            pinned: true
          },
          index: 1,
          notes
        }
      })
    )
  };
});

vi.mock("../src/locking.js", () => ({
  acquireLock: vi.fn(() =>
    Promise.resolve({
      ok: true,
      lock: {
        release: () => Promise.resolve()
      }
    })
  )
}));

vi.mock("blessed", () => {
  type EventListener = (...args: unknown[]) => void;

  class MockEmitter {
    private readonly listeners = new Map<string, EventListener[]>();

    public on(eventName: string, listener: EventListener): this {
      const existingListeners = this.listeners.get(eventName) ?? [];
      this.listeners.set(eventName, [...existingListeners, listener]);
      return this;
    }

    public once(eventName: string, listener: EventListener): this {
      const onceListener: EventListener = (...args: unknown[]) => {
        this.off(eventName, onceListener);
        listener(...args);
      };

      return this.on(eventName, onceListener);
    }

    public emit(eventName: string, ...args: unknown[]): boolean {
      const eventListeners = this.listeners.get(eventName);
      if (eventListeners === undefined || eventListeners.length === 0) {
        return false;
      }

      [...eventListeners].forEach((listener) => {
        listener(...args);
      });
      return true;
    }

    private off(eventName: string, listener: EventListener): void {
      const eventListeners = this.listeners.get(eventName);
      if (eventListeners === undefined) {
        return;
      }

      this.listeners.set(
        eventName,
        eventListeners.filter((existingListener) => existingListener !== listener)
      );
    }
  }

  class MockBox {
    public content = "";

    public setContent(content: string): void {
      this.content = content;
    }
  }

  class MockScreen extends MockEmitter {
    public program = { cols: 100 };

    public render(): void {}

    public key(keys: string[], handler: () => void): void {
      void keys;
      void handler;
    }

    public destroy(): void {
      this.emit("destroy");
    }
  }

  class MockList extends MockEmitter {
    public items: string[] = [];

    public setItems(items: string[]): void {
      this.items = [...items];
    }

    public select(selectedIndex: number): void {
      this.emit("select item", undefined, selectedIndex);
    }

    public scrollTo(selectedIndex: number): void {
      void selectedIndex;
    }
  }

  return {
    default: {
      screen: (options: unknown): MockScreen => {
        void options;
        const screen = new MockScreen();
        mockTuiRuntime.screen = screen;
        return screen;
      },
      box: (options: unknown): MockBox => {
        void options;
        return new MockBox();
      },
      list: (options: unknown): MockList => {
        void options;
        const notesList = new MockList();
        mockTuiRuntime.notesList = notesList;
        return notesList;
      }
    }
  };
});

import { runTui } from "../src/tui.js";

const flushEventLoopTurn = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const getMockScreen = (): MockScreenRef => {
  if (mockTuiRuntime.screen === null) {
    throw new Error("Expected mocked screen to be initialized.");
  }

  return mockTuiRuntime.screen;
};

const getMockList = (): MockListRef => {
  if (mockTuiRuntime.notesList === null) {
    throw new Error("Expected mocked notes list to be initialized.");
  }

  return mockTuiRuntime.notesList;
};

const emitKeypress = (character: string | undefined, name: string): void => {
  const screen = getMockScreen();
  screen.emit("keypress", character, {
    name,
    ctrl: false,
    meta: false,
    shift: false
  });
};

describe("tui navigation smoke", () => {
  it("handles j/k and arrow navigation without stack overflow recursion", async () => {
    const runPromise = runTui();
    await flushEventLoopTurn();

    const list = getMockList();
    expect(list.items.some((item) => item.includes("[ ] [ ]"))).toBe(false);

    emitKeypress("j", "j");
    await flushEventLoopTurn();
    emitKeypress(undefined, "down");
    await flushEventLoopTurn();
    emitKeypress("k", "k");
    await flushEventLoopTurn();
    emitKeypress(undefined, "up");
    await flushEventLoopTurn();
    emitKeypress("q", "q");

    const exitCode = await runPromise;
    expect(exitCode).toBe(0);
  });
});
