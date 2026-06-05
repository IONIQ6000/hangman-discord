// Hangman game engine.
//
// Produces exactly the state shape the Blueprint design (vea/app.jsx) consumes:
//   { revealed: Set<letter>, wrong: [letters], last: {letter,hit}|null, status }
// The design's figure advances one body part per WRONG guess, so the renderer
// reads `wrong.length` as the figure stage (0..6) and `status==='loss'` as dead.

export const MAX_MISSES = 6;

export type Status = "play" | "win" | "loss";

export interface LastGuess {
  letter: string;
  hit: boolean;
}

/** The serialisable snapshot the renderer turns into an image. */
export interface GameState {
  revealed: Set<string>; // letters currently shown (revealed everywhere they occur)
  wrong: string[]; // wrong letters, in guess order -> figure stage + graveyard
  last: LastGuess | null; // most recent single-letter guess, for hit/miss accents
  status: Status;
}

export type GuessResult =
  | "hit"
  | "miss"
  | "already"
  | "word-hit"
  | "word-wrong"
  | "solved"
  | "invalid"
  | "over";

const isAZ = (c: string): boolean => c >= "A" && c <= "Z";

// Common punctuation the phrase may contain. It's placed on the board from the
// start (never a tile to guess, never a miss) and ignored when matching word /
// phrase guesses — so DON'T is solved by typing "dont" (or "don't"). Letters
// (A-Z) are the only guessable, win-deciding characters.
export const PUNCTUATION = "'\",.!?;:()&-";
const PUNCT = new Set(PUNCTUATION);

/** Uppercase, fold common Unicode quotes/dashes to their ASCII form, and
 *  collapse runs of whitespace to single spaces. Used for both the secret
 *  phrase and every guess so "don't" and a pasted "don’t" land the same. */
function normalizeText(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[‘’ʼ′‛]/g, "'") // ‘ ’ ʼ ′ ‛ -> '
    .replace(/[“”″]/g, '"') // “ ” ″ -> "
    .replace(/[‐‑‒–—−]/g, "-") // ‐ ‑ ‒ – — − -> -
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** The bare A-Z spine of a string, used for punctuation-insensitive matching. */
const lettersOf = (s: string): string => [...s].filter(isAZ).join("");

/** A restorable point in the game, captured for undo/redo (status is derived). */
type Checkpoint = { revealed: Set<string>; wrong: string[]; last: LastGuess | null };

export class Hangman {
  readonly phrase: string; // normalised: UPPERCASE, single spaces, punctuation kept
  readonly words: string[];
  private readonly letters: Set<string>; // distinct A-Z in the phrase
  private revealed = new Set<string>();
  private wrong: string[] = [];
  private last: LastGuess | null = null;
  // Two checkpoint stacks for undo/redo. A checkpoint is pushed before each
  // state-changing move, so undo() can step all the way back to a fresh game;
  // undo() moves the state it leaves onto `future` so redo() can replay it. Any
  // new move clears `future` — a fresh branch invalidates the redo history.
  private history: Checkpoint[] = [];
  private future: Checkpoint[] = [];

  constructor(phrase: string) {
    const normalized = normalizeText(phrase);
    for (const ch of normalized) {
      if (ch !== " " && !isAZ(ch) && !PUNCT.has(ch)) {
        throw new Error(
          `phrase may contain only letters, spaces, and common punctuation (${PUNCTUATION}); got ${JSON.stringify(ch)}`,
        );
      }
    }
    this.phrase = normalized;
    this.words = normalized.split(" ");
    this.letters = new Set([...normalized].filter(isAZ)); // only A-Z is guessable
    if (this.letters.size === 0) throw new Error("phrase must contain at least one letter");
  }

  get status(): Status {
    if ([...this.letters].every((l) => this.revealed.has(l))) return "win";
    if (this.wrong.length >= MAX_MISSES) return "loss";
    return "play";
  }

  get misses(): number {
    return this.wrong.length;
  }

  isOver(): boolean {
    return this.status !== "play";
  }

  /** A fresh, externally-immutable snapshot for the renderer. */
  state(): GameState {
    return {
      revealed: new Set(this.revealed),
      wrong: [...this.wrong],
      last: this.last,
      status: this.status,
    };
  }

  /** A fresh copy of the mutable state, for the undo/redo stacks. */
  private capture(): Checkpoint {
    return { revealed: new Set(this.revealed), wrong: [...this.wrong], last: this.last };
  }

  private restore(c: Checkpoint): void {
    this.revealed = c.revealed;
    this.wrong = c.wrong;
    this.last = c.last;
  }

  private pushHistory(): void {
    this.history.push(this.capture());
    this.future = []; // a new branch invalidates any redo
  }

  /** Undo the last state-changing move. Returns false if already at the start. */
  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.future.push(this.capture()); // remember where we were so redo() can return
    this.restore(prev);
    return true;
  }

  /** Replay the most recently undone move. Returns false if there's nothing to redo. */
  redo(): boolean {
    const next = this.future.pop();
    if (!next) return false;
    this.history.push(this.capture());
    this.restore(next);
    return true;
  }

  canUndo(): boolean {
    return this.history.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Discard all progress and return to a fresh game on the same phrase. */
  reset(): void {
    this.history = [];
    this.future = [];
    this.revealed = new Set();
    this.wrong = [];
    this.last = null;
  }

  guess(raw: string): GuessResult {
    if (this.isOver()) return "over";
    const s = normalizeText(raw);
    if (!s) return "invalid";
    if (s.length === 1) return this.guessLetter(s); // a lone letter; punctuation here is invalid
    // A multi-character guess is a word or the full phrase. Letters, spaces, and
    // the auto-placed punctuation are allowed; punctuation is ignored when
    // matching, so the apostrophe in DON'T is optional. A guess with no letters
    // at all (just punctuation) is meaningless.
    if (![...s].every((c) => c === " " || isAZ(c) || PUNCT.has(c))) return "invalid";
    if (![...s].some(isAZ)) return "invalid";
    return this.guessWord(s);
  }

  private guessLetter(letter: string): GuessResult {
    if (!isAZ(letter)) return "invalid";
    if (this.revealed.has(letter) || this.wrong.includes(letter)) return "already";
    this.pushHistory(); // hit or miss — both change state
    if (this.letters.has(letter)) {
      this.revealed.add(letter);
      this.last = { letter, hit: true };
      return "hit";
    }
    this.wrong.push(letter);
    this.last = { letter, hit: false };
    return "miss";
  }

  private guessWord(guess: string): GuessResult {
    // A guess with a space is a full-phrase attempt; it must match the whole
    // phrase. A spaceless guess matches a single word. Matching is by letters
    // only — the auto-placed punctuation is ignored, so DON'T STOP is solved by
    // "dont stop" just as well as "don't stop". The design reveals by letter, so
    // a correct word/phrase reveals its letters (everywhere). A wrong word/phrase
    // guess costs nothing — misses are for letter guesses.
    if (guess.includes(" ")) {
      const want = this.words.map(lettersOf).filter(Boolean);
      const got = guess.split(" ").map(lettersOf).filter(Boolean);
      if (got.length === want.length && got.every((w, i) => w === want[i])) {
        this.pushHistory();
        for (const l of this.letters) this.revealed.add(l);
        this.last = null;
        return "solved";
      }
      return "word-wrong";
    }
    const bare = lettersOf(guess);
    if (this.words.some((w) => lettersOf(w) === bare)) {
      const fresh = [...bare].filter((c) => !this.revealed.has(c));
      if (fresh.length > 0) {
        this.pushHistory(); // only record a step if it actually reveals something
        for (const c of fresh) this.revealed.add(c);
        this.last = null;
      }
      return "word-hit";
    }
    return "word-wrong";
  }
}
