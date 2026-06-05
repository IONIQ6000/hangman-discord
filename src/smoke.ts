// Visual QA: render the five example states from the design (app.jsx `S`) for
// the phrase TOUCH GRASS, so the output can be eyeballed against vea/screenshots.
//   node src/smoke.ts

import { mkdir, writeFile } from "node:fs/promises";
import { Hangman } from "./engine.ts";
import { initRenderer, renderPng, closeRenderer } from "./render.ts";

const OUT = "out";

async function shot(name: string, phrase: string, build: (g: Hangman) => void): Promise<void> {
  const g = new Hangman(phrase);
  build(g);
  const png = await renderPng(g.state(), g.phrase);
  await writeFile(`${OUT}/${name}.png`, png);
  const st = g.state();
  const h = png.readUInt32BE(20); // PNG IHDR height — shows when the board grew past 1350
  console.log(
    `${name.padEnd(8)}  ${png.length.toString().padStart(6)} B  ${1080}x${h}  ` +
      `status=${st.status} stage=${st.wrong.length} wrong=[${st.wrong.join("")}]`,
  );
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  await initRenderer();
  const G = "TOUCH GRASS";
  await shot("fresh", G, () => {});
  await shot("hit", G, (g) => void g.guess("S"));
  await shot("miss", G, (g) => ["T", "O", "U", "A", "S", "E", "I", "N", "D", "P"].forEach((c) => g.guess(c)));
  await shot("win", G, (g) => ["E", "I", "T", "O", "U", "C", "H", "G", "R", "A", "S"].forEach((c) => g.guess(c)));
  await shot("loss", G, (g) => ["T", "O", "U", "A", "S", "E", "I", "N", "D", "P", "B"].forEach((c) => g.guess(c)));
  // New: punctuation is auto-placed, and a long phrase grows the board taller.
  await shot("punct", "Don't stop believin'!", (g) => g.guess("don't stop believin'"));
  await shot("long", "the quick brown fox jumps over the lazy dog", (g) => g.guess("the quick brown fox jumps over the lazy dog"));
  await shot("longword", "supercalifragilisticexpialidocious", (g) => ["S", "U", "P", "E", "R"].forEach((c) => g.guess(c)));
  await closeRenderer();
  console.log(`\nwrote ${OUT}/*.png`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
