// Structural tests for the board markup generator (no browser). Verifies the
// figure builds correctly per stage and that tile/letter classes encode the
// design's semantics (blank / filled / hit / win / answer, recent wrong).
import { test } from "node:test";
import assert from "node:assert/strict";
import { Hangman } from "./engine.ts";
import { boardMarkup, boardDocument } from "./board.ts";

const markup = (phrase: string, guesses: string[] = []): string => {
  const g = new Hangman(phrase);
  for (const x of guesses) g.guess(x);
  return boardMarkup(g.state(), g.phrase);
};
const count = (s: string, re: RegExp): number => (s.match(re) || []).length;

// "ab" has only A,B, so C..H are guaranteed misses -> drives the figure stage.
const atStage = (k: number): string => markup("ab", ["C", "D", "E", "F", "G", "H"].slice(0, k));

test("figure shows exactly the right parts at each of the 7 stages", () => {
  const parts: [string, number][] = [
    ["<circle", 1], // head
    ["M252 138 V256", 2], // spine
    ["M252 170 L208 216", 3], // left arm
    ["M252 170 L296 216", 4], // right arm
    ["M252 256 L212 320", 5], // left leg
    ["M252 256 L292 320", 6], // right leg
  ];
  for (let k = 0; k <= 6; k++) {
    const html = atStage(k);
    for (const [needle, from] of parts) {
      assert.equal(html.includes(needle), k >= from, `stage ${k}: "${needle}" presence`);
    }
  }
});

test("figure is white while alive and red (var(--bad)) only when dead", () => {
  assert.ok(!atStage(5).includes('stroke="var(--bad)"'), "alive at 5 misses");
  assert.ok(atStage(6).includes('stroke="var(--bad)"'), "dead at 6 misses");
});

test("fresh board is all blank tiles", () => {
  const html = markup("touch grass");
  assert.equal(count(html, /hm-tile blank/g), 10);
  assert.ok(!/hm-tile (hit|win|answer|filled)/.test(html));
});

test("a fresh hit is green (hit) on every occurrence", () => {
  const html = markup("touch grass", ["s"]); // S appears twice in GRASS
  assert.equal(count(html, /class="hm-tile hit"/g), 2);
});

test("an older reveal becomes 'filled' once the last guess is elsewhere", () => {
  const html = markup("touch grass", ["s", "z"]); // S revealed, last guess Z (a miss)
  assert.equal(count(html, /class="hm-tile filled"/g), 2, "both S tiles are filled (not hit)");
  assert.ok(html.includes("hm-gtile recent"), "Z is the recent wrong letter");
  assert.ok(!html.includes("hm-tile hit"), "no green hit tile anymore");
});

test("win paints every tile green", () => {
  assert.equal(count(markup("touch grass", ["touch grass"]), /class="hm-tile win"/g), 10);
});

test("loss keeps guessed letters filled and reveals the rest as answer", () => {
  const html = markup("touch grass", ["t", "o", "u", "b", "d", "e", "f", "i", "n"]);
  assert.equal(count(html, /class="hm-tile filled"/g), 3, "T O U stay white");
  assert.equal(count(html, /class="hm-tile answer"/g), 7, "C H G R A S S revealed red");
});

test("word grouping and tile counts match the phrase exactly", () => {
  const html = markup("a bb ccc");
  assert.equal(count(html, /class="hm-word"/g), 3);
  assert.equal(count(html, /class="hm-tile/g), 1 + 2 + 3);
});

test("empty wrong column renders the placeholder dash", () => {
  assert.ok(markup("cat").includes("hm-empty"));
  assert.ok(!markup("cat", ["z"]).includes("hm-empty"), "dash gone once a wrong letter exists");
});

test("document is well-formed and sized for Discord (1080x1350)", () => {
  const doc = boardDocument(new Hangman("cat").state(), "CAT");
  assert.ok(doc.startsWith("<!doctype html>"));
  assert.ok(doc.includes("width: 1080px") && doc.includes("height: 1350px"));
  assert.equal(count(doc, /class="hm-frame"/g), 1);
  assert.ok(doc.includes('viewBox="0 0 340 440"'), "figure svg present");
});
