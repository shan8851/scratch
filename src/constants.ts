export const storageFileEnvVar = "SCRATCH_NOTES_FILE";
export const notesFileName = "notes.json";
export const configDirectoryName = ".config";
export const appDirectoryName = "scratchpad";
export const sessionLockFileName = ".scratch-session.lock";
export const writeLockFileName = ".scratch-write.lock";
export const lockStaleThresholdMs = 12 * 60 * 60 * 1000;
export const lockPollIntervalMs = 50;
export const writeLockAcquireTimeoutMs = 10_000;
export const sessionLockAcquireTimeoutMs = 100;

export const defaultFooterMessageTimeoutMs = 2500;

export const headerTitle = "scratch";
export const headerKeybinds =
  "j/k move • / filter • c copy • d delete • p pin • : cmd • tab input • q quit";
