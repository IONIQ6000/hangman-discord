// Heavy, browser-driven deep tests. Run directly:  node src/deeptest.ts
// Covers: render determinism, a randomised render battery with perf + memory
// stats, pixel-level colour verification of the rasterised PNG, and clipboard
// byte-for-byte integrity.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { Hangman } from "./engine.ts";
import type { GameState } from "./engine.ts";
import { initRenderer, renderPng, closeRenderer } from "./render.ts";
import { copyPngToClipboard } from "./clipboard.ts";

const run = promisify(execFile);
let pass = 0;
let fail = 0;
const check = (cond: boolean, msg: string): void => {
  if (cond) {
    pass++;
    console.log("  ok   " + msg);
  } else {
    fail++;
    console.log("  FAIL " + msg);
  }
};
const sha = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function pngInfo(b: Buffer): { sig: boolean; w: number; h: number } {
  return {
    sig: b.subarray(0, 8).toString("hex") === "89504e470d0a1a0a",
    w: b.readUInt32BE(16),
    h: b.readUInt32BE(20),
  };
}

function state(phrase: string, guesses: string[]): { st: GameState; phrase: string } {
  const g = new Hangman(phrase);
  for (const x of guesses) g.guess(x);
  return { st: g.state(), phrase: g.phrase };
}

let decoder: Browser;
let dpage: Page;

// Sample a grid of the rasterised PNG and bucket each pixel to the nearest of
// {black, white, dim, good(green), bad(red)} reference colours.
async function colorCounts(
  png: Buffer,
  refs: { good: number[]; bad: number[] },
): Promise<Record<string, number>> {
  const durl = "data:image/png;base64," + png.toString("base64");
  return await dpage.evaluate(
    async ({ durl, refs }) => {
      const img = new Image();
      img.src = durl;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const ctx = cv.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
      const palette: Record<string, number[]> = {
        black: [0, 0, 0],
        white: [255, 255, 255],
        dim: [87, 87, 87],
        good: refs.good,
        bad: refs.bad,
      };
      const counts: Record<string, number> = { black: 0, white: 0, dim: 0, good: 0, bad: 0, other: 0 };
      const sx = Math.max(1, Math.floor(width / 160));
      const sy = Math.max(1, Math.floor(height / 200));
      for (let y = 0; y < height; y += sy) {
        for (let x = 0; x < width; x += sx) {
          const i = (y * width + x) * 4;
          const px = [data[i], data[i + 1], data[i + 2]];
          let best = "other";
          let bd = 2500; // (~50/channel)^2 threshold
          for (const k in palette) {
            const p = palette[k];
            const d = (px[0] - p[0]) ** 2 + (px[1] - p[1]) ** 2 + (px[2] - p[2]) ** 2;
            if (d < bd) {
              bd = d;
              best = k;
            }
          }
          counts[best]++;
        }
      }
      return counts;
    },
    { durl, refs },
  );
}

async function readClipboardPng(): Promise<Buffer> {
  const out = "/tmp/hm-deep-clip.png";
  await run("osascript", [
    "-e",
    "set png to (the clipboard as «class PNGf»)",
    "-e",
    `set f to open for access (POSIX file "${out}") with write permission`,
    "-e",
    "set eof f to 0",
    "-e",
    "write png to f",
    "-e",
    "close access f",
  ]);
  return readFile(out);
}

async function main(): Promise<void> {
  console.log("== DEEP render / clipboard / perf suite ==");
  await initRenderer();
  decoder = await chromium.launch();
  dpage = await decoder.newPage();

  const refs = await dpage.evaluate(() => {
    // Resolve oklch -> true sRGB via canvas (getComputedStyle now echoes oklch).
    const read = (c: string): number[] => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const x = cv.getContext("2d")!;
      x.fillStyle = c;
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    return { good: read("oklch(0.80 0.18 150)"), bad: read("oklch(0.655 0.215 27)") };
  });
  console.log("  resolved design colours:", JSON.stringify(refs));

  // 1) Determinism — identical state must render byte-identical.
  console.log("\n[determinism]");
  for (const [name, s] of [
    ["mid-game", state("touch grass", ["t", "o", "z"])],
    ["loss", state("touch grass", ["t", "o", "u", "b", "d", "e", "f", "i", "n"])],
  ] as const) {
    const hashes = [await renderPng(s.st, s.phrase), await renderPng(s.st, s.phrase), await renderPng(s.st, s.phrase)].map(sha);
    check(hashes[0] === hashes[1] && hashes[1] === hashes[2], `${name}: 3 renders identical (${hashes[0].slice(0, 12)})`);
  }

  // 1b) Concurrency — overlapping renders share one headless page, so each must
  // still come back with its own state's image (regression guard: without the
  // renderPng mutex both calls captured the later board).
  console.log("\n[concurrency]");
  {
    const a = state("touch grass", []); // fresh
    const b = state("touch grass", ["t", "o", "u", "b", "d", "e", "f", "i", "n"]); // loss
    const refA = sha(await renderPng(a.st, a.phrase));
    const refB = sha(await renderPng(b.st, b.phrase));
    let ok = refA !== refB;
    for (let i = 0; i < 6; i++) {
      const [pa, pb] = await Promise.all([renderPng(a.st, a.phrase), renderPng(b.st, b.phrase)]);
      if (sha(pa) !== refA || sha(pb) !== refB) ok = false;
    }
    check(ok, "overlapping renders each keep their own state's image");
  }

  // 2) Pixel-colour semantics on the rasterised PNG.
  console.log("\n[pixel colours]");
  const cases = {
    fresh: state("touch grass", []),
    hit: state("touch grass", ["t"]), // a fresh hit -> green tile, no wrong yet
    miss: state("touch grass", ["t", "o", "u", "q"]), // last guess a miss -> red, no green
    win: state("touch grass", ["touch grass"]), // solved with no misses -> green, no red
    loss: state("touch grass", ["t", "o", "u", "b", "d", "e", "f", "i", "n"]),
  };
  const cc: Record<string, Record<string, number>> = {};
  for (const k of Object.keys(cases) as (keyof typeof cases)[]) {
    cc[k] = await colorCounts(await renderPng(cases[k].st, cases[k].phrase), refs);
  }
  console.log("  counts:", JSON.stringify(cc));
  check(cc.fresh.good === 0 && cc.fresh.bad === 0, "fresh: no green, no red");
  check(cc.fresh.white > 0 && cc.fresh.dim > 0, "fresh: white gallows + dim tile borders");
  check(cc.hit.good > 0 && cc.hit.bad === 0, "hit: green tile present, no red");
  check(cc.miss.bad > 0 && cc.miss.good === 0, "miss: red present, no green");
  check(cc.win.good > 0 && cc.win.bad === 0, "win: green present, no red");
  check(cc.loss.bad > 0 && cc.loss.white > 0, "loss: red figure/answer + white gallows");

  // 3) Battery — many randomised states; all valid 1080x1350; perf + memory.
  console.log("\n[battery] 120 randomised renders");
  const r = (() => {
    let a = 0x12345;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const POOL = "ETAOINSHRDLUCMWFGYPBVKJXQZ";
  const times: number[] = [];
  let allValid = true;
  const rss0 = process.memoryUsage().rss;
  for (let i = 0; i < 120; i++) {
    const nWords = 1 + Math.floor(r() * 3);
    const words: string[] = [];
    for (let w = 0; w < nWords; w++) {
      const len = 2 + Math.floor(r() * 7);
      let s = "";
      for (let j = 0; j < len; j++) s += POOL[Math.floor(r() * POOL.length)];
      words.push(s);
    }
    const g = new Hangman(words.join(" "));
    const steps = Math.floor(r() * 14);
    for (let s = 0; s < steps && !g.isOver(); s++) g.guess(POOL[Math.floor(r() * POOL.length)]);
    const t0 = performance.now();
    const png = await renderPng(g.state(), g.phrase);
    times.push(performance.now() - t0);
    const info = pngInfo(png);
    if (!(info.sig && info.w === 1080 && info.h === 1350)) {
      allValid = false;
      console.log(`  bad PNG at ${i}:`, info);
    }
  }
  const rss1 = process.memoryUsage().rss;
  times.sort((a, b) => a - b);
  const pct = (q: number): string => times[Math.min(times.length - 1, Math.floor(times.length * q))].toFixed(0);
  check(allValid, "all 120 renders are valid 1080x1350 PNGs");
  console.log(`  render ms: p50=${pct(0.5)} p95=${pct(0.95)} max=${times[times.length - 1].toFixed(0)}`);
  const dMB = (rss1 - rss0) / 1e6;
  console.log(`  node rss: ${(rss0 / 1e6).toFixed(0)}MB -> ${(rss1 / 1e6).toFixed(0)}MB (Δ${dMB.toFixed(0)}MB)`);
  check(dMB < 150, "node memory stable over 120 renders (Δ < 150MB)");

  // 4) Clipboard integrity — render -> copy -> read back, byte-identical.
  console.log("\n[clipboard integrity]");
  for (const k of ["fresh", "miss", "win", "loss"] as const) {
    const png = await renderPng(cases[k].st, cases[k].phrase);
    await copyPngToClipboard(png);
    const back = await readClipboardPng();
    check(sha(back) === sha(png) && pngInfo(back).w === 1080, `${k}: clipboard byte-identical (${png.length}B)`);
  }
  let rapid = true;
  for (let i = 0; i < 10; i++) {
    try {
      await copyPngToClipboard(await renderPng(cases.fresh.st, cases.fresh.phrase));
    } catch {
      rapid = false;
    }
  }
  check(rapid, "10 rapid render+copy cycles all succeeded");

  await dpage.close();
  await decoder.close();
  await closeRenderer();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode ?? 0), 500).unref();
  });
