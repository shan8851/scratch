export type Note = {
  id: string;
  text: string;
  createdAt: string;
  pinned: boolean;
};

export type NotesFileData = {
  notes: Note[];
};

export type CommandResult<TData = undefined> = {
  ok: boolean;
  message: string;
  exitCode: number;
  data?: TData;
};

export type ClipboardResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

export type AppMessage = {
  level: "info" | "warn" | "error";
  text: string;
  at: number;
};
