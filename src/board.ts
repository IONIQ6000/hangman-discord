// Board renderer: turns a GameState into a self-contained HTML document that
// reproduces the Blueprint design (vea/app.jsx + the <style> from
// vea/"Hangman Snapshots.html"). The CSS and SVG below are copied verbatim
// from the design so the screenshot is pixel-faithful; only the React JSX is
// re-expressed as string templates (no React/CDN/Babel at runtime).

import type { GameState } from "./engine.ts";
import { JETBRAINS_MONO_EXTRABOLD } from "./font.ts";

/** Output size — 1080x1350 (4:5 portrait), pure black so it sits in dark Discord. */
export const BOARD_W = 1080;
export const BOARD_H = 1350;

// --- CSS, copied from the design (board-relevant rules only) ----------------
const CSS = `
/* The whole board is set in JetBrains Mono ExtraBold — embedded (not a system
   font) so every render is identical and offline. Its chunky, unmistakable
   punctuation is the point: an apostrophe reads as an apostrophe even alone
   between empty tiles. */
@font-face {
  font-family: "JetBrains Mono";
  font-style: normal;
  font-weight: 800;
  font-display: block;
  src: url("${JETBRAINS_MONO_EXTRABOLD}") format("woff2");
}
:root {
  --good: oklch(0.80 0.18 150);
  --bad:  oklch(0.655 0.215 27);
  --dim:  rgba(255, 255, 255, 0.34);
  --rule: rgba(255, 255, 255, 0.18);
  --punct: rgba(255, 255, 255, 0.78);
  --font: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #000; }
/* 1080x1350 is a floor, not a cap. A multi-word phrase wraps onto more rows and
   the board grows taller; a single word never breaks, so the board grows wider
   instead — width: min-content resolves to the widest word (the rest wrap below
   it). Normal phrases sit at exactly 1080 wide. */
#board { min-width: ${BOARD_W}px; width: min-content; }

.hm-frame {
  width: 100%; min-height: ${BOARD_H}px;
  background: #000; color: #fff;
  font-family: var(--font);
  padding: 46px 54px 50px;
  display: flex; flex-direction: column;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}
.hm-stage { flex: 0 0 auto; height: 560px; display: flex; align-items: flex-start; gap: 36px; min-height: 0; padding-top: 6px; }
.hm-figcol { flex: 0 0 560px; display: flex; align-items: flex-start; justify-content: flex-start; min-width: 0; height: 100%; }
.hm-figbox { width: 100%; height: 100%; container-type: size; display: flex; align-items: flex-start; justify-content: flex-start; }
.hm-wrong { flex: 1 1 auto; align-self: stretch; display: flex; flex-direction: column; justify-content: flex-start; min-width: 0; padding-top: 4px; }
.hm-wrongcol { display: flex; flex-direction: column; align-items: flex-start; gap: 22px; }
.hm-gtile { font-size: 72px; font-weight: 800; color: var(--bad); line-height: 1; text-decoration: line-through; text-decoration-thickness: 6px; }
.hm-gtile.recent { background: var(--bad); color: #000; text-decoration: none; padding: 5px 16px; line-height: 1; }
.hm-empty { font-size: 64px; font-weight: 800; color: var(--dim); }
.hm-phrase { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 0; }
.hm-words { display: flex; justify-content: center; align-items: flex-end; gap: 40px; flex-wrap: wrap; }
/* Words wrap between each other, but a word never breaks across rows — it stays
   on one line and the board widens (above) to fit it. */
.hm-word { display: flex; gap: 10px; }
.hm-tile { width: 104px; height: 156px; border: 4px solid var(--dim); display: flex; align-items: center; justify-content: center; font-size: 88px; font-weight: 800; color: #fff; }
.hm-tile.filled { border-color: #fff; }
.hm-tile.hit { border-color: var(--good); color: var(--good); }
.hm-tile.win { border-color: var(--good); color: var(--good); }
.hm-tile.answer { border-color: var(--bad); color: var(--bad); }
/* Auto-placed punctuation: borderless, same height as a tile so it sits on the
   same row, but only as wide as the glyph needs. Apostrophes/quotes ride high
   and commas/periods sit low — where they belong — so they're unmistakable. */
.hm-punct { height: 156px; min-width: 30px; padding: 0 4px; display: flex; align-items: center; justify-content: center; font-size: 88px; font-weight: 800; line-height: 1; color: var(--punct); }
.hm-punct.hi { align-items: flex-start; transform: translateY(-7px); }
.hm-punct.lo { align-items: flex-end; padding-bottom: 30px; }
`;

const isAZ = (c: string): boolean => c >= "A" && c <= "Z"; // a guessable tile; anything else in a word is punctuation

/** Escape the few characters that aren't safe as raw HTML text (e.g. the
 *  ampersand glyph). Letters are untouched; only punctuation can need this. */
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// --- FigureBlueprint, ported from vea/app.jsx -------------------------------
function figureSvg(stage: number, dead: boolean): string {
  const ink = "#ffffff";
  const fig = dead ? "var(--bad)" : "#ffffff";
  const P = `fill="none" stroke-width="13" stroke-linecap="square" stroke-linejoin="miter"`;
  const parts: string[] = [];
  if (stage >= 1) parts.push(`<circle cx="252" cy="108" r="30" fill="none" />`);
  if (stage >= 2) parts.push(`<path d="M252 138 V256" />`);
  if (stage >= 3) parts.push(`<path d="M252 170 L208 216" />`);
  if (stage >= 4) parts.push(`<path d="M252 170 L296 216" />`);
  if (stage >= 5) parts.push(`<path d="M252 256 L212 320" />`);
  if (stage >= 6) parts.push(`<path d="M252 256 L292 320" />`);
  return `<svg viewBox="0 0 340 440" width="100%" height="100%" preserveAspectRatio="xMinYMid meet" style="display:block">
    <g stroke="${ink}" ${P}>
      <path d="M24 424 H306" /><path d="M86 424 V28" /><path d="M86 28 H252" /><path d="M252 28 V78" />
    </g>
    <g stroke="${fig}" ${P}>${parts.join("")}</g>
  </svg>`;
}

function wrongHtml(state: GameState): string {
  if (state.wrong.length === 0) return `<div class="hm-wrong"><div class="hm-empty">&#8212;</div></div>`;
  const tiles = state.wrong
    .map((l, i) => {
      const recent = state.last && !state.last.hit && i === state.wrong.length - 1;
      return `<span class="hm-gtile${recent ? " recent" : ""}">${l}</span>`;
    })
    .join("");
  return `<div class="hm-wrong"><div class="hm-wrongcol">${tiles}</div></div>`;
}

function phraseHtml(state: GameState, phrase: string): string {
  const words = phrase.toUpperCase().split(" ");
  const isLoss = state.status === "loss";
  const isWin = state.status === "win";
  const hitLetter = state.last && state.last.hit ? state.last.letter : null;
  const wordsHtml = words
    .map((w) => {
      const tiles = [...w]
        .map((ch) => {
          // Punctuation isn't a guessable tile — it's shown from the start,
          // nudged high (apostrophes/quotes) or low (commas/periods) to read right.
          if (!isAZ(ch)) {
            const pos = "'\"".includes(ch) ? " hi" : ",.".includes(ch) ? " lo" : "";
            return `<div class="hm-punct${pos}">${esc(ch)}</div>`;
          }
          const shown = state.revealed.has(ch);
          let cls = "hm-tile";
          let glyph = "";
          if (isWin) {
            cls += " win";
            glyph = ch;
          } else if (shown) {
            glyph = ch;
            cls += ch === hitLetter ? " hit" : " filled";
          } else if (isLoss) {
            cls += " answer";
            glyph = ch;
          } else {
            cls += " blank";
          }
          return `<div class="${cls}">${esc(glyph)}</div>`;
        })
        .join("");
      return `<div class="hm-word">${tiles}</div>`;
    })
    .join("");
  return `<div class="hm-phrase"><div class="hm-words">${wordsHtml}</div></div>`;
}

/** The board's inner markup (the `Snapshot` component from app.jsx). */
export function boardMarkup(state: GameState, phrase: string): string {
  const stage = state.wrong.length; // figure advances per wrong guess
  const dead = state.status === "loss";
  return `<div class="hm-frame">
    <div class="hm-stage">
      <div class="hm-figcol"><div class="hm-figbox">${figureSvg(stage, dead)}</div></div>
      ${wrongHtml(state)}
    </div>
    ${phraseHtml(state, phrase)}
  </div>`;
}

/** A complete HTML document sized to BOARD_W x BOARD_H, ready to screenshot. */
export function boardDocument(state: GameState, phrase: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${CSS}</style></head><body><div id="board">${boardMarkup(
    state,
    phrase,
  )}</div></body></html>`;
}
