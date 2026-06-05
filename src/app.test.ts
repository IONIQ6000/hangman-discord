// TUI tests via ink-testing-library: fire keystrokes, assert the rendered
// frame, and confirm the snapshot side-effect fires only on real state changes.
// A stub snapshot keeps these browser-free.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { render } from "ink-testing-library";
import { App } from "./app.ts";

const h = React.createElement;
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 25));
const clean = (s: string | undefined): string => (s ?? "").replace(/\[[0-9;]*m/g, "");

function setup(phrase = "touch grass") {
  const calls: string[] = []; // serialized revealed-set per snapshot
  const snapshot = (st: { revealed: Set<string>; status: string }): void => {
    calls.push([...st.revealed].sort().join("") + ":" + st.status);
  };
  const r = render(h(App, { initialPhrase: phrase, snapshot }));
  return { ...r, calls };
}
async function enter(stdin: { write: (s: string) => void }, s: string): Promise<void> {
  stdin.write(s);
  await tick();
  stdin.write("\r");
  await tick();
}

test("renders the initial board and copies once on mount", async () => {
  const { lastFrame, calls, unmount } = setup();
  await tick();
  const f = clean(lastFrame());
  assert.match(f, /misses 0\/6/);
  assert.match(f, /YOUR MOVE/);
  assert.equal(calls.length, 1, "one snapshot on mount");
  unmount();
});

test("a correct letter reveals it and re-copies", async () => {
  const { lastFrame, stdin, calls, unmount } = setup();
  await tick();
  await enter(stdin, "t");
  const f = clean(lastFrame());
  assert.match(f, /T/);
  assert.match(f, /hit/);
  assert.ok(calls.length >= 2, "re-copied after a hit");
  unmount();
});

test("a wrong letter adds a miss, shows it struck, and grows the figure", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "z");
  const f = clean(lastFrame());
  assert.match(f, /misses 1\/6/);
  assert.match(f, /wrong[\s\S]*Z/);
  assert.match(f, /O/, "head drawn");
  unmount();
});

test("/undo steps a move back", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "z");
  assert.match(clean(lastFrame()), /misses 1\/6/);
  await enter(stdin, "/undo");
  const f = clean(lastFrame());
  assert.match(f, /misses 0\/6/);
  assert.match(f, /undid one move/);
  unmount();
});

test("/undo all the way reports nothing-to-undo at the start", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "t");
  await enter(stdin, "/undo");
  await enter(stdin, "/undo"); // already at start
  assert.match(clean(lastFrame()), /nothing to undo/);
  unmount();
});

test("/reset returns to a fresh board", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "t");
  await enter(stdin, "z");
  await enter(stdin, "/reset");
  const f = clean(lastFrame());
  assert.match(f, /misses 0\/6/);
  assert.match(f, /reset to the start/);
  unmount();
});

test("/copy re-copies the current board without changing state", async () => {
  const { lastFrame, stdin, calls, unmount } = setup();
  await tick();
  await enter(stdin, "t"); // reveal T (a hit), which also re-copies
  const before = calls.length;
  await enter(stdin, "/copy");
  const f = clean(lastFrame());
  assert.equal(calls.length, before + 1, "re-copied exactly once");
  assert.equal(calls[calls.length - 1], calls[before - 1], "same board as before");
  assert.match(f, /T/); // state is unchanged: T still revealed
  assert.match(f, /misses 0\/6/);
  assert.match(f, /re-copying current board/);
  unmount();
});

test("/copy works on a finished game (re-share the final board)", async () => {
  const { lastFrame, stdin, calls, unmount } = setup("hi");
  await tick();
  await enter(stdin, "hi"); // solve it
  assert.match(clean(lastFrame()), /SOLVED/);
  const before = calls.length;
  await enter(stdin, "/copy");
  assert.equal(calls.length, before + 1, "re-copied even after the game ended");
  unmount();
});

test("/redo replays a move after /undo", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "z"); // a miss
  await enter(stdin, "/undo"); // back to a fresh board
  assert.match(clean(lastFrame()), /misses 0\/6/);
  await enter(stdin, "/redo"); // forward again
  const f = clean(lastFrame());
  assert.match(f, /misses 1\/6/);
  assert.match(f, /redid one move/);
  unmount();
});

test("/redo reports nothing to redo when no move was undone", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "/redo");
  assert.match(clean(lastFrame()), /nothing to redo/);
  unmount();
});

test("a fresh guess after /undo clears what /redo would replay", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "z"); // miss Z
  await enter(stdin, "/undo"); // undo it
  await enter(stdin, "q"); // a new branch
  await enter(stdin, "/redo");
  assert.match(clean(lastFrame()), /nothing to redo/);
  unmount();
});

test("re-guessing an already-revealed word does not re-copy", async () => {
  const { stdin, calls, unmount } = setup("aba cab");
  await tick();
  await enter(stdin, "aba"); // reveals A and B -> re-copies
  const before = calls.length;
  await enter(stdin, "aba"); // nothing new -> must not re-copy
  assert.equal(calls.length, before, "no redundant copy for a no-op word guess");
  unmount();
});

test("solving the phrase shows SOLVED", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "touch grass");
  assert.match(clean(lastFrame()), /SOLVED/);
  unmount();
});

test("six misses shows GAME OVER", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  for (const c of ["b", "d", "e", "f", "j", "k"]) await enter(stdin, c);
  const f = clean(lastFrame());
  assert.match(f, /GAME OVER/);
  assert.match(f, /misses 6\/6/);
  unmount();
});

test("invalid input is reported and never re-copies", async () => {
  const { lastFrame, stdin, calls, unmount } = setup();
  await tick();
  const before = calls.length;
  await enter(stdin, "1");
  await enter(stdin, "@@");
  assert.match(clean(lastFrame()), /invalid/);
  assert.match(clean(lastFrame()), /misses 0\/6/);
  assert.equal(calls.length, before, "no snapshot on no-op input");
  unmount();
});

test("typing / opens the command menu", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  stdin.write("/");
  await tick();
  const f = clean(lastFrame());
  assert.match(f, /\/undo/);
  assert.match(f, /\/reset/);
  assert.match(f, /\/quit/);
  unmount();
});

test("/new starts a different phrase", async () => {
  const { lastFrame, stdin, unmount } = setup("ab");
  await tick();
  await enter(stdin, "/new hello world");
  const f = clean(lastFrame());
  assert.match(f, /new game started/);
  assert.match(f, /2 words, 10 letters/);
  unmount();
});

test("punctuation shows in the phrase and isn't counted as a letter", async () => {
  const { lastFrame, stdin, unmount } = setup("ab");
  await tick();
  await enter(stdin, "/new don't stop");
  const f = clean(lastFrame());
  assert.match(f, /2 words, 8 letters/); // D O N T S T O P; the apostrophe isn't a letter
  assert.match(f, /'/); // the apostrophe is on the board from the start
  unmount();
});

// ---- comma-separated batch guesses ----

test("comma-separated guesses are applied in order", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "t, o, u, z");
  const f = clean(lastFrame());
  assert.match(f, /T O U/);
  assert.match(f, /misses 1\/6/); // only z missed
  assert.match(f, /wrong[\s\S]*Z/);
  unmount();
});

test("a comma batch that completes the phrase wins", async () => {
  const { lastFrame, stdin, unmount } = setup("hi");
  await tick();
  await enter(stdin, "h, i");
  assert.match(clean(lastFrame()), /SOLVED/);
  unmount();
});

// ---- Enter runs the highlighted slash item ----

test("Enter runs the highlighted command without typing it out", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "z"); // a miss, so undo is meaningful
  stdin.write("/");
  await tick(); // menu opens, /undo highlighted
  stdin.write("\r");
  await tick(); // Enter runs the selection
  const f = clean(lastFrame());
  assert.match(f, /undid one move/);
  assert.match(f, /misses 0\/6/);
  unmount();
});

test("arrow-down then Enter runs the second command", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  await enter(stdin, "z"); // a miss
  await enter(stdin, "/undo"); // ...so there's a move to redo
  stdin.write("/");
  await tick();
  stdin.write("[B"); // down arrow -> /redo (the second command)
  await tick();
  stdin.write("\r");
  await tick();
  const f = clean(lastFrame());
  assert.match(f, /redid one move/);
  assert.match(f, /misses 1\/6/);
  unmount();
});

test("Enter on /new fills the box (it needs an argument) instead of running", async () => {
  const { lastFrame, stdin, unmount } = setup("ab");
  await tick();
  stdin.write("/new");
  await tick();
  stdin.write("\r");
  await tick();
  const f = clean(lastFrame());
  assert.match(f, /\/new/);
  assert.doesNotMatch(f, /new game started/);
  unmount();
});

test("Tab completes the highlighted command", async () => {
  const { lastFrame, stdin, unmount } = setup();
  await tick();
  stdin.write("/res"); // unambiguous prefix: /redo also starts with "re"
  await tick();
  stdin.write("\t");
  await tick();
  assert.match(clean(lastFrame()), /\/reset/);
  unmount();
});
