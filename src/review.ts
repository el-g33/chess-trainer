// Rates each move in a game on the scale chess.com uses, and says why in
// plain words - a port of the desktop app's move_review.py (same limits,
// same wording).
//
// How a move is rated: Stockfish scores the position before the move
// (assuming best play) and the position after it. Both scores become
// "winning chances" from 0% to 100% for the player who moved. The bigger the
// drop, the worse the move:
//     Best        Stockfish's top move
//     Excellent   loses up to 2 points
//     Good        2-5
//     Inaccuracy  5-10   ?!
//     Mistake     10-20  ?
//     Blunder     over 20 ??
// plus the special ratings Brilliant !!, Great !, Forced, Miss and Missed Win.
import type { Chess } from "chessops/chess";
import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Color, NormalMove, Square } from "chessops/types";
import { makeSquare, opposite } from "chessops/util";

import {
  PIECE_VALUES,
  type Score,
  afterMove,
  attackers,
  describeMove,
  describeScore,
  isCapture,
  legalMoveCount,
  moveIdeas,
  pawns,
} from "./coach";

// (largest drop in winning chances, rating, annotation)
const RATINGS: [number, string, string][] = [
  [2, "Excellent", ""],
  [5, "Good", ""],
  [10, "Inaccuracy", "?!"],
  [20, "Mistake", "?"],
  [Infinity, "Blunder", "??"],
];

const GREAT_GAP = 12; // "only good move": the next best is at least this much worse
const WINNING = 70; // winning chances this high count as a winning position
const CLEARLY_WINNING = 90; // ...and this high as a decisive one

/** What Stockfish found in one position. */
export interface Evaluation {
  score: Score; // from White's point of view
  best?: NormalMove;
  second?: NormalMove; // the next best move, when there is one
  secondScore?: Score;
}

export interface Review {
  rating: string;
  symbol: string; // the move-list mark, e.g. "?!" ("#" for checkmate)
  text: string; // first line is the heading
  bestSan?: string;
  loss: number;
  chanceBefore: number;
  chanceAfter: number;
}

/** Stockfish's score turned into winning chances (0-100) for one side. */
export function winningChance(score: Score, colour: Color): number {
  let cp: number;
  if (score.mate !== undefined) {
    // python-chess's score(mate_score=100000): sooner mates count for more
    cp = score.mate > 0 ? 100000 - score.mate : -100000 - score.mate;
  } else {
    cp = score.cp;
  }
  if (colour === "black") cp = -cp;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** '+0.4', '-2.1' or '+M3' from White's point of view, like the eval bar. */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) return `${score.mate > 0 ? "+" : "-"}M${Math.abs(score.mate)}`;
  const value = pawns(score.cp);
  return `${value > 0 || Object.is(value, 0) ? "+" : "-"}${Math.abs(value).toFixed(1)}`;
}

/** Stockfish's verdict mid-sentence, e.g. "the position is roughly equal". */
export function verdictWords(score: Score): string {
  return describeScore(score).replace(/\.+$/, "").replace("The position", "the position");
}

const bullets = (ideas: string[]) => ideas.map((idea) => `• ${idea}`);

/** The position's key in the table of Stockfish results. */
export const fenOf = (position: Chess) => makeFen(position.toSetup());

/** Over without needing the game's history: stalemate, too little material
 *  to mate, or the fifty-move rule (checkmate is handled separately). */
export function isDrawnPosition(position: Chess): boolean {
  return position.isStalemate() || position.isInsufficientMaterial() || position.halfmoves >= 100;
}

const sameMove = (a?: NormalMove, b?: NormalMove) =>
  !!a && !!b && a.from === b.from && a.to === b.to && a.promotion === b.promotion;

/** Squares of `colour`'s knights, bishops, rooks and queens that can be won:
 *  attacked and undefended, or attacked by something cheaper. */
function hangingPieces(position: Chess, colour: Color): Set<Square> {
  const found = new Set<Square>();
  const enemy = opposite(colour);
  for (const square of position.board[colour]) {
    const piece = position.board.get(square)!;
    if (piece.role === "pawn" || piece.role === "king") continue;
    const hitters = [...attackers(position, enemy, square)];
    if (!hitters.length) continue;
    const cheapest = Math.min(...hitters.map((a) => PIECE_VALUES[position.board.get(a)!.role] || 100));
    if (!attackers(position, colour, square).nonEmpty() || cheapest < PIECE_VALUES[piece.role]) {
      found.add(square);
    }
  }
  return found;
}

/** Does this move offer up a piece? The square of the piece left to be taken
 *  (newly attacked and not adequately defended), or undefined. */
export function isSacrifice(before: Chess, move: NormalMove, after: Chess): Square | undefined {
  const mover = before.turn;
  const captured = before.board.get(move.to);
  const gained = captured && captured.color !== mover ? PIECE_VALUES[captured.role] : 0;
  const hangingBefore = hangingPieces(before, mover);
  const newlyHanging = [...hangingPieces(after, mover)].filter((s) => !hangingBefore.has(s));
  // The piece that moved now sits on a different square
  const stillHanging = hangingBefore.has(move.from)
    ? newlyHanging.filter((s) => s !== move.to)
    : newlyHanging;
  return stillHanging.find((s) => PIECE_VALUES[after.board.get(s)!.role] > gained); // not just a trade
}

/** Rate one move, or undefined if Stockfish hasn't looked at the positions yet.
 *  `evals` holds Stockfish's results keyed by position (see fenOf). */
export function reviewMove(before: Chess, move: NormalMove, evals: Map<string, Evaluation>): Review | undefined {
  const after = afterMove(before, move);
  const mover = before.turn;
  const played = makeSan(before, move);

  if (after.isCheckmate()) {
    return { rating: "Best", symbol: "#", text: `${played} is checkmate. Game over!`, loss: 0, chanceBefore: 100, chanceAfter: 100 };
  }

  const beforeEval = evals.get(fenOf(before));
  if (!beforeEval?.best) return undefined;
  const afterGameOver = isDrawnPosition(after);
  const afterEval = afterGameOver ? undefined : evals.get(fenOf(after));
  if (!afterEval && !afterGameOver) return undefined;

  const best = beforeEval.best;
  const bestSan = makeSan(before, best);
  const chanceBefore = winningChance(beforeEval.score, mover);
  const chanceAfter = afterGameOver ? 50 : winningChance(afterEval!.score, mover);
  const loss = Math.max(0, chanceBefore - chanceAfter);
  const gap = beforeEval.secondScore ? chanceBefore - winningChance(beforeEval.secondScore, mover) : 0;

  // The ordinary scale first
  let rating: string;
  let symbol: string;
  if (legalMoveCount(before) === 1) [rating, symbol] = ["Forced", ""];
  else if (sameMove(move, best)) [rating, symbol] = ["Best", ""];
  else [, rating, symbol] = RATINGS.find(([limit]) => loss < limit)!;

  // Special ratings for good moves
  const sacrifice = rating === "Best" || rating === "Excellent" ? isSacrifice(before, move, after) : undefined;
  if (sacrifice !== undefined && chanceAfter >= 50 && chanceBefore < 97) {
    [rating, symbol] = ["Brilliant", "!!"];
  } else if (rating === "Best" && gap >= GREAT_GAP && !isCapture(before, move) && chanceAfter < 98) {
    [rating, symbol] = ["Great", "!"];
  }
  // ...and for throwing away a win
  if (["Inaccuracy", "Mistake", "Blunder"].includes(rating) && chanceBefore >= CLEARLY_WINNING && chanceAfter < WINNING) {
    [rating, symbol] = ["Missed Win", "?"];
  }

  const lines: string[] = [];
  const playedIdeas = moveIdeas(before, move);
  if (rating === "Forced") {
    lines.push(`${played} - Forced. It was the only legal move.`);
  } else if (rating === "Brilliant") {
    const piece = after.board.get(sacrifice!)!;
    lines.push(
      `${played}!! - Brilliant! A sacrifice that works: your ${piece.role} ` +
        `on ${makeSquare(sacrifice!)} can be taken, but this is still the best move.`,
    );
    lines.push(...bullets(playedIdeas));
  } else if (rating === "Great") {
    const others = beforeEval.second
      ? ` The next best move, ${makeSan(before, beforeEval.second)}, would have been much worse.`
      : "";
    lines.push(`${played}! - Great move. The only good move here.${others}`);
    lines.push(...bullets(playedIdeas));
  } else if (rating === "Best") {
    lines.push(`${played} - Best move. This is exactly what Stockfish would play.`);
    lines.push(...bullets(playedIdeas));
  } else if (rating === "Excellent" || rating === "Good") {
    lines.push(`${played} - ${rating} move.`);
    lines.push(...bullets(playedIdeas));
    lines.push(`Stockfish slightly preferred ${bestSan}.`);
  } else {
    if (rating === "Missed Win") {
      const score = beforeEval.score;
      const mateForMover = score.mate !== undefined ? (mover === "white" ? score.mate : -score.mate) : 0;
      const had = mateForMover > 0 ? `you had a forced checkmate in ${mateForMover}` : "you had a winning position";
      lines.push(`${played} - Missed win: ${had}.`);
    } else {
      lines.push(`${played}${symbol} - ${rating}.`);
    }
    // The clearest way to show what went wrong: the opponent's best reply.
    const reply = afterGameOver ? undefined : afterEval!.best;
    if (reply) lines.push(`The problem: it allows ${makeSan(after, reply)} (${describeMove(after, reply)}).`);
    lines.push(`Better was ${bestSan} (${describeMove(before, best)}):`);
    lines.push(...bullets(moveIdeas(before, best)));
  }

  const afterText = afterGameOver
    ? "the game ends in a draw"
    : `${verdictWords(afterEval!.score)} (${formatScore(afterEval!.score)})`;
  lines.push(
    `\nBefore the move ${verdictWords(beforeEval.score)} (${formatScore(beforeEval.score)}); after it, ${afterText}.`,
  );
  return { rating, symbol, text: lines.join("\n"), bestSan, loss, chanceBefore, chanceAfter };
}

/** Mark Misses: your opponent's move was a mistake or blunder (it gave you a
 *  winning chance) and your reply let that chance slip. Needs the whole game,
 *  because it depends on the move before. */
export function addMisses(reviews: (Review | undefined)[]): (Review | undefined)[] {
  const result = [...reviews];
  for (let i = 1; i < reviews.length; i++) {
    const previous = reviews[i - 1];
    const review = reviews[i];
    if (!previous || !review) continue;
    if (
      ["Mistake", "Blunder"].includes(previous.rating) &&
      ["Inaccuracy", "Mistake", "Blunder"].includes(review.rating) &&
      review.chanceBefore >= WINNING &&
      review.chanceAfter < WINNING
    ) {
      const newline = review.text.indexOf("\n");
      const heading = newline < 0 ? review.text : review.text.slice(0, newline);
      const rest = newline < 0 ? "" : review.text.slice(newline + 1);
      const played = heading.split(" ")[0].replace(/[?!]+$/, "");
      const text =
        `${played} - Miss. Your opponent's last move was a mistake, and ` +
        `${review.bestSan} would have punished it.\n${rest}`;
      result[i] = { ...review, rating: "Miss", symbol: "?", text };
    }
  }
  return result;
}
