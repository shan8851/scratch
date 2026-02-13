# scratch Implementation Plan

## Goal

Build a local-first terminal scratchpad (`scratch`) in TypeScript + Node.js with a fast TUI workflow and reliable indexed actions at any list size.

## Scope

- MVP only for this pass.
- Required CLI + TUI features.
- No preview/export/import/plaintext backup in this pass.

## Locked Decisions

- Node.js target: 20+
- TUI library: `blessed`
- CLI parser: `commander`
- Clipboard strategy: warn on failure, do not crash
- Index semantics: global canonical order
- Index base: 1-based
- Build output: `tsc` to `dist/`
- Test runner: `vitest`

## Milestones

| Milestone | Status | Deliverables | Verification |
| --- | --- | --- | --- |
| M0 Scaffold + tooling | Done (Verified) | project setup, scripts, base docs | `npm install`, `npm run build`, `npm run typecheck` passed |
| M1 Types + storage + clipboard | Done (Verified) | `types.ts`, `storage.ts`, `clipboard.ts`, constants | `npm run test`, `npm run typecheck`, `npm run build` passed |
| M2 Command layer | Done (Verified) | add/list/copy/delete/clear/pin domain operations | `npm run test`, `npm run typecheck`, `npm run build` passed |
| M3 CLI surface | Done (Verified) | command wiring for all non-TUI actions | `npm run test`, `npm run typecheck`, `npm run build`, manual CLI matrix passed |
| M4 TUI MVP | Done (Verified) | full-screen UI, keybinds, filter, palette, footer status | `npm run test`, `npm run typecheck`, `npm run build`, TUI startup/quit smoke passed |
| M5 Tests + final docs | Done (Verified) | test coverage + README finalization | `npm run lint`, `npm run test`, `npm run typecheck`, `npm run build` passed |

## Verification Log

### M0

- `npm install` passed.
- `npm run build` passed.
- `npm run typecheck` passed.

### M1

- Added `src/types.ts`, `src/constants.ts`, `src/storage.ts`, and `src/clipboard.ts`.
- `npm run test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.

### M2

- Added `src/commands.ts` with global index-safe operations and filter/index helpers.
- Added `test/commands.test.ts` and `test/indexing.test.ts`.
- `npm run test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.

### M3

- Implemented commander CLI in `src/cli.ts` for `tui`, `add`, `list`, `copy`, `delete`, and `clear --yes`.
- `npm run test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Manual matrix passed in isolated storage env:
  - `node dist/index.js add "hello world"`
  - `node dist/index.js list`
  - `node dist/index.js copy 1`
  - `node dist/index.js delete 1`
  - `node dist/index.js clear --yes`

### M4

- Replaced `src/tui.ts` stub with full blessed TUI:
  - modes for list/input/filter/command/delete-confirm/clear-confirm
  - keybinds (`j/k`, arrows, `g/G`, `/`, `:`, `c`, `y`, `d`, `p`, `q`)
  - global index rendering in list rows
  - command palette commands (`copy`, `delete`, `add`, `clear`)
  - footer status messages with timeout
- `npm run test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- TUI startup + quit smoke passed in PTY (`node dist/index.js tui`, then `q`).

### M5

- Finalized `README.md` with setup, CLI usage, keybindings, command palette, storage path, and index semantics.
- Added lint project config (`tsconfig.eslint.json`) and fixed lint issues.
- `npm run lint` passed.
- `npm run test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.

## Robust Pass Milestones

| Milestone | Status | Deliverables | Verification |
| --- | --- | --- | --- |
| M6 Corruption + deterministic order | Done (Verified) | explicit malformed-JSON failure path, backup file creation, deterministic tie-breaker sort | `npm run test`, `npm run typecheck`, `npm run build`, malformed-file CLI smoke passed |
| M7 Locking + single-instance guard | Done (Verified) | session lock for TUI, write lock for mutating commands, stale lock recovery | `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`, lock smokes passed |
| M8 TUI command parser + tests | Done (Verified) | extracted parser module (quoted text support) and parser unit tests | `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build` passed |
| M9 Clipboard UX + docs polish | Done (Verified) | user-friendly Linux clipboard remediation messages, README + milestone log updates | `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build` passed |

## Robust Pass Verification Log

### M6

- Added explicit malformed-JSON/schema failure path in storage reads (no silent fallback to empty notes).
- Added automatic corrupt backup creation (`notes.json.corrupt.<timestamp>.<pid>.bak`) before returning failure.
- Added deterministic sort tie-breaker by `id` for equal pin/time values.
- Updated storage tests for deterministic tie-break and corrupt backup behavior.
- `npm run test` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Malformed-file CLI smoke passed (`node dist/index.js list` returns error + backup path + non-zero exit).

### M7

- Added lock infrastructure in `src/locking.ts` with:
  - session/write lock files
  - stale lock cleanup (dead PID or stale age)
  - timeout + poll acquisition behavior
- Wired write lock into mutating command paths (`add`, `delete`, `toggle pin`, `clear`).
- Wired session lock into TUI startup to block additional interactive sessions.
- Added lock tests (`test/locking.test.ts`) and concurrent add regression test in commands suite.
- `npm run test` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
- Manual smokes passed:
  - TUI open blocks concurrent CLI add with explicit message.
  - 40 parallel adds retained all notes (`count=40`).

### M8

- Added `src/commandParser.ts` as a pure command palette parser module.
- Added quoted/escaped text support for `add` commands in palette mode.
- Replaced regex-based command parsing in `src/tui.ts` with parsed command dispatch.
- Added parser tests in `test/commandParser.test.ts`.
- `npm run test` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.

### M9

- Added clipboard error message mapping with Linux-specific remediation guidance in `src/clipboard.ts`.
- Added clipboard mapping tests in `test/clipboard.test.ts`.
- Updated `README.md` reliability section with corruption backup and lock behavior.
- `npm run test` passed.
- `npm run lint` passed.
- `npm run typecheck` passed.
- `npm run build` passed.
