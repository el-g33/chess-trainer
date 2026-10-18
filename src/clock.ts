// The chess clock for games against Stockfish: each side's time left, an
// increment added after every move, pausing (Practice mode stops the clock
// while you use the coach or look back), and how long Stockfish "thinks" -
// like a person, not an engine: quick in the opening and with obvious
// moves, longer in tricky positions, faster when its time runs low.
import type { Color } from "chessops/types";

export interface TimeControl {
  base: number; // seconds each
  increment: number; // seconds added after each move
}

export const PRESETS: [string, string][] = [
  ["none", "No clock"],
  ["60+0", "1 min (bullet)"],
  ["120+1", "2 + 1 (bullet)"],
  ["180+0", "3 min (blitz)"],
  ["180+2", "3 + 2 (blitz)"],
  ["300+0", "5 min (blitz)"],
  ["600+0", "10 min (rapid)"],
  ["900+10", "15 + 10 (rapid)"],
  ["1800+0", "30 min (classical)"],
  ["custom", "Custom..."],
];

/** "300+2" to a time control (seconds); undefined for "none" or nonsense. */
export function parseTimeControl(text: string): TimeControl | undefined {
  const found = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(text.trim());
  if (!found) return undefined;
  const base = Number(found[1]);
  return base > 0 ? { base, increment: Number(found[2]) } : undefined;
}

/** The PGN TimeControl header, e.g. "300+2". */
export const timeControlTag = (control: TimeControl) => `${Math.round(control.base)}+${control.increment}`;

export type Times = Record<Color, number>; // milliseconds left

export class Clock {
  readonly control: TimeControl;
  private left: Times;
  private turn: Color | null = null; // whose clock is running (null = stopped)
  private since = 0;
  private paused = false;
  private used = 0; // time used on this move so far

  constructor(control: TimeControl) {
    this.control = control;
    this.left = { white: control.base * 1000, black: control.base * 1000 };
  }

  private settle() {
    const now = performance.now();
    if (this.turn && !this.paused) {
      this.left[this.turn] -= now - this.since;
      this.used += now - this.since;
    }
    this.since = now;
  }

  /** Start (or restart) the clock of the side to move. */
  start(turn: Color) {
    this.settle();
    this.turn = turn;
    this.used = 0;
  }

  stop() {
    this.settle();
    this.turn = null;
  }

  setPaused(paused: boolean) {
    if (paused === this.paused) return;
    this.settle();
    this.paused = paused;
  }

  isPaused = () => this.paused;
  running = (): Color | null => this.turn;

  timeLeft(colour: Color): number {
    this.settle();
    return Math.max(0, this.left[colour]);
  }

  /** How long the side to move has used on this move (pauses not counted). */
  usedThisMove(): number {
    this.settle();
    return this.used;
  }

  /** The side to move has moved: add the increment and start the other clock.
   *  Returns the mover's time left (for the PGN). */
  moved(): number {
    this.settle();
    if (!this.turn) return 0;
    const mover = this.turn;
    this.left[mover] += this.control.increment * 1000;
    this.turn = mover === "white" ? "black" : "white";
    this.used = 0;
    return this.left[mover];
  }

  /** The side whose time has run out, if any. */
  flagged(): Color | null {
    this.settle();
    return this.turn && this.left[this.turn] <= 0 ? this.turn : null;
  }

  snapshot(): Times {
    this.settle();
    return { ...this.left };
  }

  /** Back to earlier times (Undo), with `turn`'s clock running. */
  restore(times: Times, turn: Color) {
    this.settle();
    this.left = { ...times };
    this.turn = turn;
    this.used = 0;
  }
}

/** "4:59", "1:02:03", or "0:08.4" in the last 10 seconds. */
export function formatClock(ms: number): string {
  ms = Math.max(0, ms);
  if (ms < 10_000) return `0:0${(Math.floor(ms / 100) / 10).toFixed(1)}`;
  const total = Math.floor(ms / 1000);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The PGN clock comment's time, e.g. "0:04:58". */
export function pgnClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const [h, m, s] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface ThinkSituation {
  left: number; // ms on Stockfish's clock
  increment: number; // seconds
  fullmoves: number;
  legalMoves: number;
  inCheck: boolean;
  book: boolean; // a move from its opening
}

const random = (low: number, high: number) => low + Math.random() * (high - low);

/** How long (ms) a person might take over this move, given the time left. */
export function thinkTime(s: ThinkSituation): number {
  const inc = s.increment * 1000;
  // Spread the time over the moves still to come, plus most of the increment
  const movesToGo = Math.max(18, 42 - s.fullmoves * 0.6);
  let budget = s.left / movesToGo + inc * 0.8;
  if (s.book) budget *= random(0.15, 0.4); // known moves come quickly
  else if (s.fullmoves <= 8) budget *= 0.55;
  if (s.legalMoves === 1) budget = random(400, 900); // the only move
  else if (s.inCheck || s.legalMoves <= 4) budget *= 0.6;
  // People are uneven: some moves are instant, some take a long think
  budget *= Math.random() < 0.12 ? random(1.6, 2.6) : random(0.45, 1.3);
  // Short of time: play fast, never risk the flag on one move
  if (s.left < 15_000) budget = Math.min(budget, random(300, 1100) + inc * 0.5);
  budget = Math.min(budget, s.left * 0.15 + inc * 0.5);
  return Math.max(250, Math.min(budget, Math.max(s.left - 500, 250)));
}
