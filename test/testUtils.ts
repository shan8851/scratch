import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { storageFileEnvVar } from "../src/constants.js";

export const withTempStorage = async (
  run: (notesFilePath: string) => Promise<void>
): Promise<void> => {
  const temporaryDirectoryPath = await mkdtemp(path.join(os.tmpdir(), "scratch-test-"));
  const notesFilePath = path.join(temporaryDirectoryPath, "notes.json");
  process.env[storageFileEnvVar] = notesFilePath;

  try {
    await run(notesFilePath);
  } finally {
    delete process.env[storageFileEnvVar];
    await rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
};
