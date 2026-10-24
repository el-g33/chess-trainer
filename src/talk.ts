// The coach's words, typed out a letter at a time and cut into pieces that
// fit the bubble, so a long note never needs "Tell me more" to be read.

export const TYPE_MS = 33; // about 30 letters a second (Normal)
let typeMs = TYPE_MS;

/** How fast the coach types: ms per letter (0 shows every sentence at once). */
export function setTypeSpeed(ms: number) {
  typeMs = ms;
}
const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** How long a piece stays up before the next one, once it's typed: enough to read it. */
export const readingTime = (text: string) => 1500 + 45 * text.length;

/** Sentences: split after . ! ? when the next one starts with a capital, a
 *  digit, a quote or "..." (a Black move) - but not inside "4...Nc6". */
function sentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+(?=["(]?[A-Z0-9]|\.\.\.)/g, "$1\u0000")
    .split("\u0000")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Cut text into pieces that each fit: sentence by sentence, a long sentence
 *  at its punctuation (or a space) nearest the middle, then neighbours that
 *  fit together are put back together. */
export function splitToFit(text: string, fits: (piece: string) => boolean): string[] {
  const pieces: string[] = [];
  const add = (piece: string, depth = 0) => {
    if (depth > 6 || fits(piece)) {
      pieces.push(piece);
      return;
    }
    const middle = piece.length / 2;
    let cut = -1;
    for (const found of piece.matchAll(/[;:,]\s|\s\(|\s-\s/g)) {
      const at = found.index! + 1;
      if (cut < 0 || Math.abs(at - middle) < Math.abs(cut - middle)) cut = at;
    }
    if (cut <= 0 || cut >= piece.length - 1) {
      cut = piece.lastIndexOf(" ", middle);
      if (cut <= 0) cut = piece.indexOf(" ", middle);
    }
    if (cut <= 0) {
      pieces.push(piece);
      return;
    }
    add(piece.slice(0, cut).trim(), depth + 1);
    add(piece.slice(cut).trim(), depth + 1);
  };
  for (const sentence of sentences(text)) add(sentence);
  const joined: string[] = [];
  for (const piece of pieces) {
    const last = joined[joined.length - 1];
    if (last !== undefined && fits(`${last} ${piece}`)) joined[joined.length - 1] = `${last} ${piece}`;
    else joined.push(piece);
  }
  return joined.length ? joined : [""];
}

/** Does `text` fit in the element without being cut off? Measured with the
 *  element itself (its real width and line limit); a hidden element can't be
 *  measured, so a length rule stands in. */
export function fitsIn(element: HTMLElement, text: string, fallbackChars = 80): boolean {
  if (!element.clientHeight || !element.clientWidth) return text.length <= fallbackChars;
  const before = element.textContent;
  element.textContent = text;
  const fits = element.scrollHeight <= element.clientHeight + 2;
  element.textContent = before;
  return fits;
}

/** Types text into an element. The same text again carries on where it was. */
export class Typer {
  private full = "";
  private shown = 0;
  private timer = 0;

  constructor(private element: HTMLElement, private onTyped?: () => void) {}

  get text() {
    return this.full;
  }

  get typed() {
    return this.shown >= this.full.length;
  }

  type(text: string, restart = false) {
    if (text === this.full && !restart) return;
    clearInterval(this.timer);
    this.full = text;
    this.shown = reduceMotion() || typeMs === 0 ? text.length : 0;
    this.element.textContent = text.slice(0, this.shown);
    if (this.typed) {
      this.onTyped?.();
      return;
    }
    this.timer = window.setInterval(() => {
      this.shown = Math.min(this.full.length, this.shown + 1);
      this.element.textContent = this.full.slice(0, this.shown);
      if (this.typed) {
        clearInterval(this.timer);
        this.onTyped?.();
      }
    }, typeMs);
  }

  /** Show it all at once (e.g. stepping to a piece by hand). */
  finish() {
    if (this.typed) return;
    clearInterval(this.timer);
    this.shown = this.full.length;
    this.element.textContent = this.full;
    this.onTyped?.();
  }
}
