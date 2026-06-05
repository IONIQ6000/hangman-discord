import { test } from "node:test";
import assert from "node:assert/strict";
import { Hangman } from "./engine.ts";

test("hit reveals a letter, no miss", () => {
  const g = new Hangman("touch grass");
  assert.equal(g.guess("s"), "hit");
  assert.ok(g.state().revealed.has("S"));
  assert.equal(g.state().wrong.length, 0);
  assert.deepEqual(g.state().last, { letter: "S", hit: true });
});

test("miss records the wrong letter and last guess", () => {
  const g = new Hangman("touch grass");
  assert.equal(g.guess("z"), "miss");
  assert.deepEqual(g.state().wrong, ["Z"]);
  assert.deepEqual(g.state().last, { letter: "Z", hit: false });
});

test("repeat guess of a tried letter is a no-op", () => {
  const g = new Hangman("cat");
  g.guess("a");
  g.guess("z");
  assert.equal(g.guess("a"), "already");
  assert.equal(g.guess("z"), "already");
  assert.equal(g.state().wrong.length, 1);
});

test("invalid input is rejected without penalty", () => {
  const g = new Hangman("cat");
  for (const bad of ["1", "!", "", "  ", "a1", "a-b", "_"]) {
    assert.equal(g.guess(bad), "invalid");
  }
  assert.equal(g.state().wrong.length, 0);
});

test("six misses is a loss; figure stage tracks wrong count", () => {
  const g = new Hangman("xy");
  for (const c of ["a", "b", "c", "d", "e", "f"]) assert.equal(g.guess(c), "miss");
  assert.equal(g.state().wrong.length, 6); // FigureBlueprint stage 6 -> dead
  assert.equal(g.status, "loss");
  assert.equal(g.isOver(), true);
});

test("win by revealing every letter", () => {
  const g = new Hangman("ab ba");
  g.guess("a");
  g.guess("b");
  assert.equal(g.status, "win");
});

test("word guess reveals that word's letters", () => {
  const g = new Hangman("touch grass");
  assert.equal(g.guess("touch"), "word-hit");
  for (const c of "TOUCH") assert.ok(g.state().revealed.has(c));
  assert.equal(g.status, "play");
});

test("wrong word guess costs nothing", () => {
  const g = new Hangman("cat");
  assert.equal(g.guess("dog"), "word-wrong");
  assert.equal(g.state().wrong.length, 0);
});

test("full-phrase solve wins", () => {
  const g = new Hangman("touch grass");
  assert.equal(g.guess("touch grass"), "solved");
  assert.equal(g.status, "win");
});

test("no guesses accepted after the game is over", () => {
  const g = new Hangman("xy");
  for (const c of ["a", "b", "c", "d", "e", "f"]) g.guess(c);
  assert.equal(g.guess("x"), "over");
});

test("phrase validation rejects non-letters and empties", () => {
  assert.throws(() => new Hangman("ab3"));
  assert.throws(() => new Hangman("hi!"));
  assert.throws(() => new Hangman(""));
  assert.throws(() => new Hangman("   "));
});

test("phrase normalises case and whitespace", () => {
  const g = new Hangman("  touch   grass  ");
  assert.equal(g.phrase, "TOUCH GRASS");
  assert.deepEqual(g.words, ["TOUCH", "GRASS"]);
});
