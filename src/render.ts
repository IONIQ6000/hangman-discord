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
    await page.evaluate(() => document.fonts.ready); // ensure system fonts are laid out
    const el = await page.$("#board");
    if (!el) throw new Error("#board element not found");
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
