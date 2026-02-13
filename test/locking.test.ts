import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { acquireLock, resolveLockFilePath } from "../src/locking.js";
import { withTempStorage } from "./testUtils.js";

const createLockPayload = (
  kind: "session" | "write",
  pid: number,
  acquiredAt: string
): string =>
  JSON.stringify({
    token: crypto.randomUUID(),
    kind,
    holder: "test",
    pid,
    acquiredAt
  });

describe("locking", () => {
  it("acquires and releases write locks", async () => {
    await withTempStorage(async () => {
      const lockResult = await acquireLock({
        kind: "write",
        holder: "locking-test",
        timeoutMs: 200
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) {
        return;
      }

      await lockResult.lock.release();
      await expect(access(lockResult.lock.lockFilePath)).rejects.toBeDefined();
    });
  });

  it("recovers from stale write lock files", async () => {
    await withTempStorage(async () => {
      const lockFilePath = resolveLockFilePath("write");
      await mkdir(path.dirname(lockFilePath), { recursive: true });
      const staleTimestamp = new Date(2000, 0, 1).toISOString();

      await writeFile(
        lockFilePath,
        createLockPayload("write", 999_999, staleTimestamp),
        { encoding: "utf8" }
      );

      const lockResult = await acquireLock({
        kind: "write",
        holder: "locking-test",
        timeoutMs: 200
      });

      expect(lockResult.ok).toBe(true);
      if (!lockResult.ok) {
        return;
      }

      await lockResult.lock.release();
    });
  });

  it("blocks write lock while another session lock is active", async () => {
    await withTempStorage(async () => {
      const lockFilePath = resolveLockFilePath("session");
      await mkdir(path.dirname(lockFilePath), { recursive: true });

      const blockingProcess = spawn(process.execPath, ["-e", "setTimeout(() => {}, 4000)"], {
        stdio: "ignore"
      });

      try {
        await writeFile(
          lockFilePath,
          createLockPayload("session", blockingProcess.pid ?? 1, new Date().toISOString()),
          { encoding: "utf8" }
        );

        const lockResult = await acquireLock({
          kind: "write",
          holder: "locking-test",
          timeoutMs: 200
        });

        expect(lockResult.ok).toBe(false);
        if (lockResult.ok) {
          await lockResult.lock.release();
          return;
        }

        expect(lockResult.message.toLowerCase()).toContain("session");
      } finally {
        blockingProcess.kill("SIGTERM");
      }
    });
  });
});
