// Render pipeline: a persistent headless Chromium (Playwright) renders the
// board HTML and screenshots it. The browser launches once and is reused for
// every move, so each snapshot is ~30-40 ms rather than a cold ~1-2 s launch.

import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { boardDocument, BOARD_W, BOARD_H } from "./board.ts";
import type { GameState } from "./engine.ts";

let browser: Browser | null = null;
let page: Page | null = null;

// One headless page is shared across renders, so calls must not interleave: a
// second setContent() would clobber the first before its screenshot is taken,
// and both would capture the later board. This mutex serializes renderPng()
// so each call gets its own state's image regardless of how callers fan in.
let renderLock: Promise<unknown> = Promise.resolve();

export async function initRenderer(): Promise<void> {
  if (browser) return;
  browser = await chromium.launch();
  page = await browser.newPage({
    viewport: { width: BOARD_W, height: BOARD_H },
    deviceScaleFactor: 1, // 1x -> exactly BOARD_W x BOARD_H, smallest crisp PNG
  });
}

export async function renderPng(state: GameState, phrase: string): Promise<Buffer> {
  const prev = renderLock;
  let release!: () => void;
  renderLock = new Promise<void>((r) => (release = r));
  await prev; // wait for any in-flight render to finish using the shared page
  try {
    if (!page) throw new Error("renderer not initialised — call initRenderer() first");
    await page.setContent(boardDocument(state, phrase), { waitUntil: "load" });
    // Force the embedded @font-face (JetBrains Mono) to finish loading before we
    // shoot, then wait for layout to settle — otherwise the first frame can rasterise
    // in a fallback font.
    await page.evaluate(async () => {
      await Promise.all([...document.fonts].map((f) => f.load()));
      await document.fonts.ready;
    });
    const el = await page.$("#board");
    if (!el) throw new Error("#board element not found");
    // A long phrase grows the board past BOARD_W/BOARD_H (taller for extra rows,
    // wider for a single word that won't wrap). The viewport only needs to grow
    // (never shrink) — an over-sized viewport still crops to #board, so a later
    // small board renders identically. The element screenshot captures the full
    // #board box regardless; growing the viewport just keeps it on-screen.
    const box = await el.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { w: Math.ceil(r.width), h: Math.ceil(r.height) };
    });
    const vp = page.viewportSize()!;
    if (box.w > vp.width || box.h > vp.height) {
      await page.setViewportSize({ width: Math.max(BOARD_W, box.w), height: Math.max(BOARD_H, box.h) });
    }
    return await el.screenshot({ type: "png" });
  } finally {
    release(); // let the next queued render proceed (even if this one threw)
  }
}

export async function closeRenderer(): Promise<void> {
  await renderLock; // let any in-flight render finish before tearing the page down
  await browser?.close();
  browser = null;
  page = null;
}
