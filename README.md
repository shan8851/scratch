# scratch

A local-first terminal scratchpad for capturing quick notes and copying them fast.

Built for keyboard-heavy workflows with a lazygit-style feel.

## What it does

- Full-screen TUI (`scratch` / `scratch tui`)
- Global index actions (works beyond single digits)
- Command palette (`: copy 11`, `: delete 11`, `: add hello`, `: clear`)
- Local JSON storage only (`~/.config/scratchpad/notes.json`)
- Pinned notes first, then newest-first
- Safe clipboard failure handling (no crashes)
- Corrupt JSON detection + backup file creation
- Locking to avoid concurrent mutation races

---

## Requirements

- Node.js 20+
- npm
- Linux/macOS terminal (Linux-first)

---

## Quick start (clone + run)

```bash
git clone <YOUR_REPO_URL>
cd scratch
npm ci
npm run build
npm run start
```

This launches the TUI.

---

## How to run

Pick one path and stick with it.

### 1) Dev path (TypeScript via tsx)

```bash
npm run dev --
npm run dev -- add "some text"
npm run dev -- list
```

### 2) Built path (compiled JavaScript)

```bash
npm run build
npm run start --
npm run start -- add "some text"
npm run start -- list
```

### 3) Linked CLI binary (`scratch`)

```bash
npm run build
npm link
scratch
scratch add "some text"
scratch list
scratch copy <index>
scratch delete <index>
scratch clear --yes
```

If `scratch` is not found, run `npm link` or use `npm run start -- ...`.

---

## TUI keybindings

- `j` / `k` or `↑` / `↓`: move selection
- `g` / `G`: jump top / bottom
- `Tab`: focus input
- `Enter` (in input mode): add note
- `/`: filter mode
- `:`: command palette
- `c` or `y`: copy selected note
- `d`: delete selected note (confirm with `y` / `n`)
- `p`: toggle pin
- `q`: quit

---

## Command palette

Open with `:` then run:

- `copy <index>`
- `delete <index>`
- `add <text>`
- `clear` (with confirmation)

---

## Data model

```json
{
  "notes": [
    {
      "id": "string",
      "text": "string",
      "createdAt": "ISO-8601 string",
      "pinned": false
    }
  ]
}
```

## Index semantics

Indexes are **global/canonical** (not filter-relative):
1. pinned notes first
2. then newest-first by `createdAt`

Same index meaning is used across CLI, TUI, and command palette.

---

## Storage

- Default: `~/.config/scratchpad/notes.json`
- Override (testing/dev): `SCRATCH_NOTES_FILE=/path/to/notes.json`

---

## Reliability behavior

- Malformed `notes.json` fails fast and creates:
  - `notes.json.corrupt.<timestamp>.<pid>.bak`
- Second TUI session is blocked while one is active
- Mutations (`add/delete/clear/pin`) are serialized via write locks

---

## Linux troubleshooting

### Clipboard copy fails
- Install `xclip` (X11) or `wl-clipboard` (Wayland)
- Ensure `DISPLAY` / `WAYLAND_DISPLAY` is set

### Rendering looks broken
- Confirm UTF-8 locale
- Use a terminal font with box-drawing glyph support

### Lock warning after crash
- Close running `scratch` processes and retry
- If needed, remove stale lock files in `~/.config/scratchpad/`

### Corrupt notes file detected
- Recover from generated `.bak` file

---

## Dev scripts

```bash
npm run build
npm run test
npm run typecheck
npm run lint
```

## Project notes

Implementation tracker:
- `docs/scratchImplementationPlan.md`
