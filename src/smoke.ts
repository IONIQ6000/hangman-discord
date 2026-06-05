// Visual QA: render the five example states from the design (app.jsx `S`) for
// the phrase TOUCH GRASS, so the output can be eyeballed against vea/screenshots.
//   node src/smoke.ts

import { mkdir, writeFile } from "node:fs/promises";
import { Hangman } from "./engine.ts";
import { initRenderer, renderPng, closeRenderer } from "./render.ts";

const OUT = "out";

async function shot(name: string, build: (g: Hangman) => void): Promise<void> {
  const g = new Hangman("TOUCH GRASS");
  build(g);
  const png = await renderPng(g.state(), g.phrase);
  await writeFile(`${OUT}/${name}.png`, png);
  const st = g.state();
  console.log(
    `${name.padEnd(6)}  ${png.length.toString().padStart(6)} B  ` +
      `status=${st.status} stage=${st.wrong.length} wrong=[${st.wrong.join("")}]`,
  );
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  await initRenderer();
  await shot("fresh", () => {});
  await shot("hit", (g) => void g.guess("S"));
  await shot("miss", (g) => ["T", "O", "U", "A", "S", "E", "I", "N", "D", "P"].forEach((c) => g.guess(c)));
  await shot("win", (g) => ["E", "I", "T", "O", "U", "C", "H", "G", "R", "A", "S"].forEach((c) => g.guess(c)));
  await shot("loss", (g) => ["T", "O", "U", "A", "S", "E", "I", "N", "D", "P", "B"].forEach((c) => g.guess(c)));
  await closeRenderer();
  console.log(`\nwrote ${OUT}/*.png`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
