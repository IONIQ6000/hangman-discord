# hangman-discord

Play hangman with a friend over Discord from a terminal. You host the game in
an interactive TUI; after **every move** it renders the board to a Discord-ready
image and copies it to your clipboard, so you just paste (`⌘V`) it into the
chat. Your friend sees each new board, tells you a guess, you type it, and the
next image lands on your clipboard.

The terminal UI is built with **Ink** (React for the terminal — the same
foundation as Claude Code): a live board, a bordered input, slash commands, and
**undo that steps all the way back to the start**.

The board image is the **Blueprint** design from `vea/` — a pure-black 1080×1350
portrait that sits invisibly in dark Discord.

## Setup

Needs Node 23+ (runs TypeScript directly — no build step) and macOS (the
auto-copy uses AppleScript). One-time:

```bash
npm install
npx playwright install chromium   # headless browser used to render the image
```

## Play

```bash
npm start "touch grass"     # phrase from the command line
npm start                   # prompts for the phrase
```

Each turn, type into the input box:

- a **letter** (`a`), a **word** (`touch`), or the **full phrase** to solve;
- **several at once, comma-separated**: `a, e, i, o, u` or `touch, grass`;
- or a **slash command**:

| Command | What it does |
| --- | --- |
| `/undo` | step back one move — repeat it to rewind all the way to the start |
| `/redo` | step forward again after an `/undo` (a new guess clears the redo trail) |
| `/reset` | jump straight back to a fresh board on the same phrase |
| `/copy` | re-copy the current board to your clipboard (if you overwrote it) |
| `/new <phrase>` | start a new game with a new secret phrase |
| `/help` | list commands |
| `/quit` | exit |

Type `/` to open the command menu — ↑↓ to pick, **Enter to run the highlighted
one**, ⇥ to complete. Every move —
including undo, redo, and reset — re-renders the board and copies it to your
clipboard (`📋 copied`). If you accidentally overwrite the clipboard, `/copy`
puts the current board straight back on it — no undo/redo needed. Win by
revealing the whole phrase; lose at 6 wrong guesses (the answer is revealed in
red).

## How it works

```
engine.ts    pure game state + undo history → { revealed, wrong, last, status }
board.ts     state            → HTML+CSS (ported verbatim from the design)
render.ts    HTML             → PNG (persistent headless Chromium, 1080×1350)
clipboard.ts PNG              → macOS clipboard (osascript, as image data)
app.ts       Ink (React) TUI: input, slash commands, live board; wires the above
```

Undo/redo are two snapshot stacks in the engine: a snapshot is pushed before
each state-changing move, so `undo()` pops back one step (and repeats cleanly to
the beginning) while `redo()` replays it. A fresh move clears the redo stack and
`reset()` clears both. The renderer keeps one headless Chromium alive and reuses
it, so each snapshot is ~30 ms.

## Scripts

```bash
npm start [phrase]   # play
npm test             # engine + board + TUI unit/property tests (node:test)
npm run deeptest     # browser-driven deep suite (render/pixel/perf/clipboard)
npm run shots        # render the design's 5 example states to out/*.png
```

## The design (`vea/`)

The Claude Design export. `app.jsx` is the board component (`Snapshot`) and
`Hangman Snapshots.html` holds its CSS; `board.ts` reproduces both so the image
matches `vea/screenshots/01-states.png`. `design-canvas.jsx` is only the preview
canvas and isn't used at runtime.

## Notes / decisions

- **Ink via `React.createElement`** (no JSX) so it runs under Node-native TS with
  no build step or `tsx` — same toolchain as the rest of the project, and the
  TUI stays testable with `ink-testing-library`.
- **PNG, not WebP.** The macOS clipboard carries PNG/TIFF, so a pasted image must
  be PNG. (Discord re-encodes uploads to WebP anyway.) The flat-black art is a
  few KB.
- **Figure stage = wrong-guess count** (0–6); a loss turns the figure red and
  reveals the answer. **Wrong word/phrase guesses cost nothing** — only letter
  guesses can miss.

### Possible next steps

- **Auto-post via a Discord webhook** — skip the paste entirely.
- An optimized **WebP file** export for drag-and-drop (smallest upload).
