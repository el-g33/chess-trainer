// Accuracy statistics, calculated the way lichess does (lila's
// AccuracyPercent.scala and scalachess's Divider.scala, ported):
//
//   - each move's accuracy (0-100%) comes from how much winning chance it
//     gave away;
//   - a game (or phase) accuracy is the mean of a volatility-weighted mean
//     and the harmonic mean of the move accuracies, so a blunder isn't
//     hidden by many easy moves;
//   - the game is divided into opening, middlegame and endgame by how many
//     pieces are left and how developed they are.
import type { Chess } from "chessops/chess";
import type { Color } from "chessops/types";

import type { Score } from "./coach";

// --- Winning chances (lichess caps scores at +/-10 pawns; a mate counts as that) ---

const CEILING = 1000;

/** White's winning chance (0-100) for a score from White's point of view. */
export function winPercent(score: Score): number {
  const cp = score.mate !== undefined ? (score.mate > 0 ? CEILING : -CEILING) : Math.max(-CEILING, Math.min(CEILING, score.cp));
  const chances = 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
  return 50 + 50 * Math.max(-1, Math.min(1, chances));
}

/** One move's accuracy from the mover's winning chance before and after. */
export function moveAccuracy(before: number, after: number): number {
  if (after >= before) return 100;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * (before - after)) - 3.166924740191411;
  return Math.max(0, Math.min(100, raw + 1)); // + 1: uncertainty bonus (imperfect analysis)
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function standardDeviation(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/** Accuracy of each side over a run of positions: `scores[i]` is the score
 *  of position i (White's view; undefined if unknown), `startColor` the side
 *  to move in position 0. */
export function gameAccuracy(startColor: Color, scores: (Score | undefined)[]): Partial<Record<Color, number>> {
  const wins = scores.map((s) => (s ? winPercent(s) : undefined));
  if (wins.length < 2) return {};
  const windowSize = Math.max(2, Math.min(8, Math.floor((wins.length - 1) / 10)));
  const windows: (number | undefined)[][] = [];
  for (let i = 0; i < Math.min(windowSize, wins.length) - 2; i++) windows.push(wins.slice(0, windowSize));
  for (let i = 0; i + windowSize <= wins.length; i++) windows.push(wins.slice(i, i + windowSize));
  const weights = windows.map((w) =>
    w.every((x) => x !== undefined) ? Math.max(0.5, Math.min(12, standardDeviation(w as number[]))) : undefined,
  );

  const byColour: Record<Color, { accuracy: number; weight: number }[]> = { white: [], black: [] };
  for (let i = 0; i + 1 < wins.length; i++) {
    const colour: Color = (i % 2 === 0) === (startColor === "white") ? "white" : "black";
    const prev = wins[i];
    const next = wins[i + 1];
    const weight = weights[i];
    if (prev === undefined || next === undefined || weight === undefined) continue;
    const accuracy = colour === "white" ? moveAccuracy(prev, next) : moveAccuracy(100 - prev, 100 - next);
    byColour[colour].push({ accuracy, weight });
  }

  const result: Partial<Record<Color, number>> = {};
  for (const colour of ["white", "black"] as Color[]) {
    const moves = byColour[colour];
    if (!moves.length) continue;
    const weighted = moves.reduce((a, m) => a + m.accuracy * m.weight, 0) / moves.reduce((a, m) => a + m.weight, 0);
    const harmonic = moves.length / moves.reduce((a, m) => a + 1 / m.accuracy, 0); // 0 if any move is 0
    result[colour] = (weighted + harmonic) / 2;
  }
  return result;
}

// --- Dividing a game into opening, middlegame and endgame (scalachess Divider) ---

export interface Division {
  middle?: number; // the position (ply) where the middlegame starts
  end?: number; // ... and the endgame
}

const count = (position: Chess, test: (square: number) => boolean, colour?: Color) =>
  [...(colour ? position.board[colour] : position.board.occupied)].filter(test).length;

function majorsAndMinors(position: Chess): number {
  const b = position.board;
  return b.occupied.diff(b.king).diff(b.pawn).size();
}

/** Few pieces left on a back rank means they've been developed. */
function backrankSparse(position: Chess): boolean {
  return count(position, (s) => s < 8, "white") < 4 || count(position, (s) => s >= 56, "black") < 4;
}

function regionScore(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      switch (black) {
        case 1: return 1 + y;
        case 2: return y < 6 ? 2 + (6 - y) : 0;
        case 3: return y < 7 ? 3 + (7 - y) : 0;
        case 4: return y < 7 ? 3 + (7 - y) : 0;
        default: return 0;
      }
    case 1:
      switch (black) {
        case 0: return 1 + (8 - y);
        case 1: return 5 + Math.abs(4 - y);
        case 2: return 4 + (7 - y);
        case 3: return 5 + (7 - y);
        default: return 0;
      }
    case 2:
      switch (black) {
        case 0: return y > 2 ? 2 + (y - 2) : 0;
        case 1: return 4 + (y - 1);
        case 2: return 7;
        default: return 0;
      }
    case 3:
      switch (black) {
        case 0: return y > 1 ? 3 + (y - 1) : 0;
        case 1: return 5 + (y - 1);
        default: return 0;
      }
    case 4:
      return black === 0 && y > 1 ? 3 + (y - 1) : 0; // a group of 4 on the home row = 0
    default:
      return 0;
  }
}

/** How mixed together the two sides' pieces are, over 2x2 regions of the board. */
function mixedness(position: Chess): number {
  let total = 0;
  for (let y = 0; y <= 6; y++) {
    for (let x = 0; x <= 6; x++) {
      const region = [8 * y + x, 8 * y + x + 1, 8 * (y + 1) + x, 8 * (y + 1) + x + 1];
      const white = region.filter((s) => position.board.white.has(s)).length;
      const black = region.filter((s) => position.board.black.has(s)).length;
      total += regionScore(y + 1, white, black);
    }
  }
  return total;
}

export function divide(positions: Chess[]): Division {
  const middle = positions.findIndex((p) => majorsAndMinors(p) <= 10 || backrankSparse(p) || mixedness(p) > 150);
  if (middle < 0) return {};
  const end = positions.findIndex((p) => majorsAndMinors(p) <= 6);
  return {
    middle: end < 0 || middle < end ? middle : undefined,
    end: end < 0 ? undefined : end,
  };
}

export type Phase = "opening" | "middlegame" | "endgame";

/** Accuracy for each phase and side, as lichess does it: each phase's
 *  positions (plus the one before, so its first move counts) on their own. */
export function phaseAccuracy(
  startColor: Color, positions: Chess[], scores: (Score | undefined)[],
): Record<Phase, Partial<Record<Color, number>>> {
  const division = divide(positions);
  const phaseOf = (ply: number): Phase =>
    division.middle === undefined || ply < division.middle
      ? "opening"
      : division.end !== undefined && division.end <= ply
        ? "endgame"
        : "middlegame";
  const result = { opening: {}, middlegame: {}, endgame: {} } as Record<Phase, Partial<Record<Color, number>>>;
  if (division.middle === undefined) return result; // lichess only splits once a middlegame is reached
  for (const phase of ["opening", "middlegame", "endgame"] as Phase[]) {
    const plies = scores.map((_, ply) => ply).filter((ply) => phaseOf(ply) === phase || phaseOf(ply + 1) === phase);
    if (!plies.length) continue;
    const first = plies[0];
    const turn: Color = first % 2 === 0 ? startColor : startColor === "white" ? "black" : "white";
    result[phase] = gameAccuracy(turn, plies.map((ply) => scores[ply]));
  }
  return result;
}

/** The rating colour for an accuracy (the Move review's colours). */
export function accuracyRating(accuracy: number): string {
  if (accuracy >= 98) return "Brilliant";
  if (accuracy >= 95) return "Great";
  if (accuracy >= 90) return "Best";
  if (accuracy >= 80) return "Good";
  if (accuracy >= 70) return "Inaccuracy";
  if (accuracy >= 55) return "Mistake";
  return "Blunder";
}

// --- An estimated rating from how much each side gave away ---

const LOSS_CAP = 1000; // one blunder shouldn't count for more than this (centipawns)

/** Roughly how strong each side played: from the average centipawn loss per
 *  move, using the relation seen across many engine-analysed games
 *  (about 2700 at 10, 2000 at 40, 1650 at 60, 1100 at 100):
 *  rating = 3000 x e^(-0.01 x average loss). Needs a few moves each. */
export function estimateRating(startColor: Color, scores: (Score | undefined)[]): Partial<Record<Color, number>> {
  const cp = (score: Score) =>
    score.mate !== undefined ? (score.mate > 0 ? LOSS_CAP : -LOSS_CAP) : Math.max(-LOSS_CAP, Math.min(LOSS_CAP, score.cp));
  const losses: Record<Color, number[]> = { white: [], black: [] };
  for (let i = 0; i + 1 < scores.length; i++) {
    const before = scores[i];
    const after = scores[i + 1];
    if (!before || !after) continue;
    const colour: Color = (i % 2 === 0) === (startColor === "white") ? "white" : "black";
    const sign = colour === "white" ? 1 : -1;
    losses[colour].push(Math.max(0, Math.min(LOSS_CAP, sign * (cp(before) - cp(after)))));
  }
  const result: Partial<Record<Color, number>> = {};
  for (const colour of ["white", "black"] as const) {
    if (losses[colour].length < 5) continue;
    const average = mean(losses[colour]);
    const rating = 3000 * Math.exp(-0.01 * average);
    result[colour] = Math.round(Math.max(400, Math.min(2900, rating)) / 25) * 25;
  }
  return result;
}
