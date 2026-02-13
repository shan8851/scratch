import crypto from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import {
  lockPollIntervalMs,
  lockStaleThresholdMs,
  sessionLockAcquireTimeoutMs,
  sessionLockFileName,
  writeLockAcquireTimeoutMs,
  writeLockFileName
} from "./constants.js";
import { resolveNotesFilePath } from "./storage.js";

export type LockKind = "session" | "write";

type LockMetadata = {
  token: string;
  kind: LockKind;
  holder: string;
  pid: number;
  acquiredAt: string;
};

type LockHandle = {
  kind: LockKind;
  lockFilePath: string;
  release: () => Promise<void>;
};

export type AcquireLockResult =
  | {
      ok: true;
      lock: LockHandle;
    }
  | {
      ok: false;
      message: string;
    };

type AcquireLockOptions = {
  kind: LockKind;
  holder: string;
  timeoutMs?: number;
};

const lockMetadataSchema = z.object({
  token: z.string(),
  kind: z.union([z.literal("session"), z.literal("write")]),
  holder: z.string(),
  pid: z.number().int().positive(),
  acquiredAt: z.string()
});

const sleep = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });

const getLockFileName = (kind: LockKind): string =>
  kind === "session" ? sessionLockFileName : writeLockFileName;

export const resolveLockFilePath = (kind: LockKind): string => {
  const notesFilePath = resolveNotesFilePath();
  return path.join(path.dirname(notesFilePath), getLockFileName(kind));
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EPERM"
    ) {
      return true;
    }

    return false;
  }
};

const isStaleLock = (lockMetadata: LockMetadata): boolean => {
  const acquiredTime = Date.parse(lockMetadata.acquiredAt);
  const acquiredTimestamp = Number.isNaN(acquiredTime) ? 0 : acquiredTime;
  const exceededLifetime = Date.now() - acquiredTimestamp > lockStaleThresholdMs;

  return exceededLifetime || !isProcessAlive(lockMetadata.pid);
};

const readLockMetadata = async (
  lockFilePath: string
): Promise<LockMetadata | null> => {
  try {
    const rawLockFileContent = await readFile(lockFilePath, { encoding: "utf8" });
    const parsedJson: unknown = JSON.parse(rawLockFileContent);
    const parsedMetadata = lockMetadataSchema.safeParse(parsedJson);
    return parsedMetadata.success ? parsedMetadata.data : null;
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    return null;
  }
};

const removeLockFile = async (lockFilePath: string): Promise<void> => {
  try {
    await unlink(lockFilePath);
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
  }
};

const getActiveLock = async (kind: LockKind): Promise<LockMetadata | null> => {
  const lockFilePath = resolveLockFilePath(kind);
  const lockMetadata = await readLockMetadata(lockFilePath);
  if (lockMetadata === null) {
    return null;
  }

  if (isStaleLock(lockMetadata)) {
    await removeLockFile(lockFilePath);
    return null;
  }

  return lockMetadata;
};

const createLockHandle = (
  kind: LockKind,
  lockFilePath: string,
  lockToken: string
): LockHandle => {
  let wasReleased = false;

  return {
    kind,
    lockFilePath,
    release: async (): Promise<void> => {
      if (wasReleased) {
        return;
      }

      wasReleased = true;
      const lockMetadata = await readLockMetadata(lockFilePath);

      if (lockMetadata === null || lockMetadata.token !== lockToken) {
        return;
      }

      await removeLockFile(lockFilePath);
    }
  };
};

const tryAcquireLock = async (
  kind: LockKind,
  holder: string
): Promise<LockHandle | null> => {
  const lockFilePath = resolveLockFilePath(kind);
  const lockToken = crypto.randomUUID();
  const lockMetadata: LockMetadata = {
    token: lockToken,
    kind,
    holder,
    pid: process.pid,
    acquiredAt: new Date().toISOString()
  };

  await mkdir(path.dirname(lockFilePath), { recursive: true });

  try {
    await writeFile(lockFilePath, JSON.stringify(lockMetadata, null, 2), {
      encoding: "utf8",
      flag: "wx"
    });
    return createLockHandle(kind, lockFilePath, lockToken);
  } catch (error: unknown) {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      return null;
    }

    throw error;
  }
};

const formatLockConflictMessage = (
  kind: LockKind,
  activeLock: LockMetadata | null
): string => {
  if (kind === "session") {
    if (activeLock === null) {
      return "Another scratch session is already running.";
    }

    return `Another scratch session is already running (pid ${activeLock.pid}).`;
  }

  if (activeLock === null) {
    return "Scratch is busy with another write operation.";
  }

  return `Scratch is busy with another write operation (pid ${activeLock.pid}).`;
};

export const acquireLock = async ({
  kind,
  holder,
  timeoutMs
}: AcquireLockOptions): Promise<AcquireLockResult> => {
  const maxWaitDurationMs =
    timeoutMs ??
    (kind === "session" ? sessionLockAcquireTimeoutMs : writeLockAcquireTimeoutMs);
  const startTimestamp = Date.now();

  while (Date.now() - startTimestamp <= maxWaitDurationMs) {
    if (kind === "write") {
      const activeSessionLock = await getActiveLock("session");
      if (activeSessionLock !== null && activeSessionLock.pid !== process.pid) {
        if (Date.now() - startTimestamp >= maxWaitDurationMs) {
          return {
            ok: false,
            message: formatLockConflictMessage("session", activeSessionLock)
          };
        }

        await sleep(lockPollIntervalMs);
        continue;
      }
    }

    const acquiredLock = await tryAcquireLock(kind, holder);
    if (acquiredLock !== null) {
      return {
        ok: true,
        lock: acquiredLock
      };
    }

    const activeLock = await getActiveLock(kind);
    if (Date.now() - startTimestamp >= maxWaitDurationMs) {
      return {
        ok: false,
        message: formatLockConflictMessage(kind, activeLock)
      };
    }

    await sleep(lockPollIntervalMs);
  }

  if (kind === "write") {
    const activeSessionLock = await getActiveLock("session");
    if (activeSessionLock !== null && activeSessionLock.pid !== process.pid) {
      return {
        ok: false,
        message: formatLockConflictMessage("session", activeSessionLock)
      };
    }
  }

  return {
    ok: false,
    message: formatLockConflictMessage(kind, await getActiveLock(kind))
  };
};
