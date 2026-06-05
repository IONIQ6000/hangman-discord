// Ink (React-for-terminal) TUI — a Claude-Code-style REPL for hosting the game.
// Built with React.createElement (no JSX) so it runs under Node-native TS with
// no build step. The board image is still rendered + copied to the clipboard
// on every state change; `snapshot` is injected so the UI is testable without
// a browser.

import React, { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Box, render, Text, useApp, useInput } from "ink";
import { Hangman, MAX_MISSES } from "./engine.ts";
import type { GameState, GuessResult } from "./engine.ts";

const h = React.createElement;

// Terminal colours echo the design's resolved sRGB (green hit / red miss).
const GOOD = "#54dd7d";
const BAD = "#f94741";
const DIM = "gray";

const FEEDBACK: Record<GuessResult, string> = {
  hit: "hit",
  miss: "miss",
  already: "already guessed that",
  "word-hit": "correct word!",
  "word-wrong": "not it",
  solved: "solved!",
  invalid: "invalid — guess a letter, a word, or a /command",
  over: "the game is over",
};

// Compact per-guess mark, shown when several guesses are entered at once.
const MARK: Record<GuessResult, string> = {
  hit: "✓",
  miss: "✗",
  already: "·",
  "word-hit": "✓",
  "word-wrong": "✗",
  solved: "✓",
  invalid: "?",
  over: "—",
};

const COMMANDS = [
  { name: "undo", desc: "step back one move (repeat to the start)", needsArg: false },
  { name: "redo", desc: "step forward again (after an undo)", needsArg: false },
  { name: "reset", desc: "back to the start of this phrase", needsArg: false },
  { name: "copy", desc: "re-copy this board to your clipboard", needsArg: false },
  { name: "new", desc: "new game · /new <phrase>", needsArg: true },
  { name: "help", desc: "list commands", needsArg: false },
  { name: "quit", desc: "exit", needsArg: false },
];

function termGallows(m: number): string[] {
  const head = m >= 1 ? "O" : " ";
  const larm = m >= 3 ? "/" : " ";
  const torso = m >= 2 ? "|" : " ";
  const rarm = m >= 4 ? "\\" : " ";
  const lleg = m >= 5 ? "/" : " ";
  const rleg = m >= 6 ? "\\" : " ";
  return [" +---+", " |   |", " |   " + head, " |  " + larm + torso + rarm, " |  " + lleg + " " + rleg, "_|_____"];
}

function chipFor(st: GameState): { label: string; color: string } {
  if (st.status === "win") return { label: "SOLVED", color: GOOD };
  if (st.status === "loss") return { label: "GAME OVER", color: BAD };
  if (st.last) {
    return st.last.hit
      ? { label: `HIT +${st.last.letter}`, color: GOOD }
      : { label: `MISS x${st.last.letter}`, color: BAD };
  }
  return { label: "YOUR MOVE", color: DIM };
}

// Everything the rendered board depends on, as a string. A guess that changes
// nothing (e.g. re-guessing an already-revealed word) leaves this unchanged, so
// we can skip a redundant render + clipboard write. The renderer is
// deterministic, so equal signatures mean a byte-identical image.
function boardSig(g: Hangman): string {
  const s = g.state();
  const last = s.last ? s.last.letter + (s.last.hit ? "+" : "-") : "";
  return [...s.revealed].sort().join("") + "|" + s.wrong.join("") + "|" + s.status + "|" + last;
}

type CopyState = "idle" | "working" | "done" | "error";

export interface AppProps {
  initialPhrase: string;
  snapshot: (state: GameState, phrase: string) => void | Promise<void>;
}

export function App({ initialPhrase, snapshot }: AppProps): React.ReactElement {
  const gameRef = useRef<Hangman>(new Hangman(initialPhrase));
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [copy, setCopy] = useState<CopyState>("idle");
  const [menuIndex, setMenuIndex] = useState(0);
  const { exit } = useApp();

  // Snapshots are single-flight: the renderer shares one headless page and the
  // clipboard one temp file, so two in flight would corrupt each other (and the
  // clipboard could even end on a stale board). While one runs, later requests
  // just mark the board dirty; when it finishes we re-snapshot the *latest*
  // state — so the clipboard always lands on the current board and a burst of
  // quick moves costs one render, not one per move.
  const snapBusy = useRef(false);
  const snapDirty = useRef(false);
  const doSnapshot = useCallback((): void => {
    snapDirty.current = true;
    if (snapBusy.current) return;
    snapBusy.current = true;
    setCopy("working");
    const pump = (): void => {
      if (!snapDirty.current) {
        snapBusy.current = false;
        return;
      }
      snapDirty.current = false;
      const g = gameRef.current;
      let p: Promise<unknown>;
      try {
        p = Promise.resolve(snapshot(g.state(), g.phrase));
      } catch (e) {
        p = Promise.reject(e);
      }
      p.then(
        () => {
          if (snapDirty.current) pump();
          else {
            snapBusy.current = false;
            setCopy("done");
          }
        },
        () => {
          if (snapDirty.current) pump();
          else {
            snapBusy.current = false;
            setCopy("error");
          }
        },
      );
    };
    pump();
  }, [snapshot]);

  useEffect(() => {
    doSnapshot();
  }, [doSnapshot]);

  const submit = useCallback(
    (raw: string): void => {
      const text = raw.trim();
      setValue("");
      setMenuIndex(0);
      if (text === "") return;

      if (text.startsWith("/")) {
        const body = text.slice(1);
        const name = body.split(/\s+/)[0].toLowerCase();
        const arg = body.slice(name.length).trim();
        let changed = false;
        switch (name) {
          case "undo":
            changed = gameRef.current.undo();
            setFeedback(changed ? "undid one move" : "nothing to undo");
            break;
          case "redo":
            changed = gameRef.current.redo();
            setFeedback(changed ? "redid one move" : "nothing to redo");
            break;
          case "reset":
            gameRef.current.reset();
            setFeedback("reset to the start");
            changed = true;
            break;
          case "copy":
            // Re-copy the current board without changing state — for when the
            // clipboard got overwritten and you just want the image back (no
            // undo/redo dance). doSnapshot() coalesces with any in-flight
            // render, so it always lands the live board.
            doSnapshot();
            setFeedback("re-copying current board");
            break;
          case "new":
            if (!arg) {
              setFeedback("usage: /new <phrase>");
              break;
            }
            try {
              gameRef.current = new Hangman(arg);
              setFeedback("new game started");
              changed = true;
            } catch (e) {
              setFeedback("bad phrase: " + (e as Error).message);
            }
            break;
          case "help":
            setFeedback("/undo  /redo  /reset  /copy  /new <phrase>  /help  /quit");
            break;
          case "quit":
          case "exit":
            exit();
            return;
          default:
            setFeedback(`unknown command: /${name}`);
        }
        force();
        if (changed) doSnapshot();
        return;
      }

      // One or more guesses, comma-separated: "a, e, i" or "touch, grass".
      const tokens = text.split(",").map((t) => t.trim()).filter(Boolean);
      if (tokens.length === 0) return;
      const before = boardSig(gameRef.current);
      const marks: string[] = [];
      for (const tok of tokens) {
        const res = gameRef.current.guess(tok);
        marks.push(tokens.length > 1 ? `${tok}${MARK[res]}` : FEEDBACK[res]);
        if (gameRef.current.isOver()) break; // stop the batch once it's won/lost
      }
      setFeedback(marks.join("  "));
      force();
      // Re-copy only if the board actually changed: re-guessing an already
      // revealed word reveals nothing, so it shouldn't re-render or touch the
      // clipboard.
      if (boardSig(gameRef.current) !== before) doSnapshot();
    },
    [exit, doSnapshot],
  );

  const prefix = value.startsWith("/") ? value.slice(1).split(/\s+/)[0].toLowerCase() : null;
  const showMenu = value.startsWith("/") && !value.includes(" ");
  const matches = showMenu ? COMMANDS.filter((c) => c.name.startsWith(prefix ?? "")) : [];
  const sel = matches.length ? Math.min(menuIndex, matches.length - 1) : 0;

  useInput((input, key) => {
    if (key.return) {
      // With the slash menu open, Enter runs the highlighted command (rather
      // than the literal text). A command that takes an argument is dropped
      // into the box with a trailing space so you can type the argument.
      if (matches.length > 0) {
        const cmd = matches[sel];
        if (cmd.needsArg) {
          setValue("/" + cmd.name + " ");
          setMenuIndex(0);
        } else {
          submit("/" + cmd.name);
        }
        return;
      }
      submit(value);
      return;
    }
    if (key.escape) {
      setValue("");
      setMenuIndex(0);
      return;
    }
    if (matches.length > 0 && key.tab) {
      setValue("/" + matches[sel].name + " ");
      setMenuIndex(0);
      return;
    }
    if (matches.length > 0 && key.upArrow) {
      setMenuIndex((i) => (i - 1 + matches.length) % matches.length);
      return;
    }
    if (matches.length > 0 && key.downArrow) {
      setMenuIndex((i) => (i + 1) % matches.length);
      return;
    }
    if (key.backspace || key.delete) {
      setValue((v) => v.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) return;
    if (input) setValue((v) => v + input);
  });

  const game = gameRef.current;
  const st = game.state();
  const dead = st.status === "loss";
  const chip = chipFor(st);
  const letterCount = game.words.reduce((n, w) => n + w.length, 0);

  // --- header ---
  const header = h(
    Box,
    { marginBottom: 1 },
    h(Text, { bold: true }, " HANGMAN "),
    h(Text, { color: DIM }, `· ${game.words.length} word${game.words.length > 1 ? "s" : ""}, ${letterCount} letters · boards copy to your clipboard`),
  );

  // --- gallows ---
  const gallows = h(
    Box,
    { flexDirection: "column" },
    ...termGallows(st.wrong.length).map((ln, i) => h(Text, { key: i, color: dead ? BAD : "white" }, ln)),
  );

  // --- phrase ---
  const phrase = h(
    Box,
    { marginTop: 1, gap: 3 },
    ...game.words.map((word, wi) =>
      h(
        Box,
        { key: wi, gap: 1 },
        ...[...word].map((ch, ci) => {
          const shown = st.revealed.has(ch);
          let color = DIM;
          let glyph = "·";
          if (st.status === "win" || shown) {
            color = GOOD;
            glyph = ch;
          } else if (st.status === "loss") {
            color = BAD;
            glyph = ch;
          }
          return h(Text, { key: ci, bold: true, color }, glyph);
        }),
      ),
    ),
  );

  // --- wrong letters ---
  const wrong = h(
    Box,
    { marginTop: 1, gap: 1 },
    h(Text, { color: DIM }, "wrong"),
    st.wrong.length === 0
      ? h(Text, { color: DIM }, "—")
      : h(
          Box,
          { gap: 1 },
          ...st.wrong.map((l, i) =>
            h(Text, { key: i, color: BAD, strikethrough: true, bold: i === st.wrong.length - 1 }, l),
          ),
        ),
  );

  // --- status line ---
  const status = h(
    Box,
    { marginTop: 1, gap: 2 },
    h(Text, { color: st.wrong.length >= MAX_MISSES - 1 ? BAD : DIM }, `misses ${st.wrong.length}/${MAX_MISSES}`),
    h(Text, { color: chip.color, bold: true }, chip.label),
  );

  // --- feedback + copy indicator ---
  const copyText =
    copy === "working" ? "rendering…" : copy === "done" ? "📋 copied — paste into Discord" : copy === "error" ? "⚠ copy failed" : "";
  const feedbackRow = h(
    Box,
    { marginTop: 1, gap: 2 },
    feedback ? h(Text, { color: DIM }, feedback) : null,
    copyText ? h(Text, { color: copy === "error" ? BAD : "cyan" }, copyText) : null,
  );

  // --- input box ---
  const inputBox = h(
    Box,
    { marginTop: 1, borderStyle: "round", borderColor: showMenu ? "cyan" : DIM, paddingX: 1 },
    h(Text, { color: "cyan", bold: true }, "› "),
    value === "" ? h(Text, { color: DIM }, "letter · word · a,e,i for several · /command") : h(Text, null, value),
    h(Text, { inverse: true }, " "),
  );

  // --- slash menu or hint ---
  const footer = showMenu
    ? h(
        Box,
        { flexDirection: "column", marginLeft: 2 },
        ...matches.map((c, i) =>
          h(
            Box,
            { key: c.name, gap: 1 },
            h(Text, { color: i === sel ? "cyan" : DIM, bold: i === sel }, `${i === sel ? "›" : " "} /${c.name}`),
            h(Text, { color: DIM }, c.desc),
          ),
        ),
        matches.length === 0 ? h(Text, { color: DIM }, "  (no matching command)") : null,
        h(Text, { color: DIM }, "  ↑↓ pick · ⏎ run · ⇥ complete · ⎋ close"),
      )
    : h(Text, { color: DIM }, "  /undo  /redo  /reset  /copy  /new  /help  /quit   ·   a,e,i for several   ·   ⏎ submit");

  return h(Box, { flexDirection: "column", paddingX: 1, paddingY: 1 }, header, gallows, phrase, wrong, status, feedbackRow, inputBox, footer);
}

// --- CLI bootstrap (only when run directly) -------------------------------

async function promptPhrase(): Promise<string> {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question("Secret phrase: ");
  rl.close();
  return answer.trim();
}

async function runApp(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error('Hangman needs an interactive terminal. Try:  npm start "your phrase"');
    process.exitCode = 1;
    return;
  }
  let phrase = process.argv.slice(2).join(" ").trim();
  if (!phrase) phrase = await promptPhrase();
  try {
    new Hangman(phrase);
  } catch (e) {
    console.error("Bad phrase:", (e as Error).message);
    process.exitCode = 2;
    return;
  }

  const { initRenderer, renderPng, closeRenderer } = await import("./render.ts");
  const { copyPngToClipboard } = await import("./clipboard.ts");
  await initRenderer();
  const snapshot = async (state: GameState, ph: string): Promise<void> => {
    await copyPngToClipboard(await renderPng(state, ph));
  };

  const instance = render(h(App, { initialPhrase: phrase, snapshot }));
  await instance.waitUntilExit();
  await closeRenderer();
}

const isEntry = (await import("node:url")).pathToFileURL(process.argv[1] ?? "").href === import.meta.url;
if (isEntry) {
  runApp()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => {
      setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
    });
}
