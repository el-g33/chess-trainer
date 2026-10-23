// Brilliant moves: a sacrifice that works (offers up a piece and is still
// Stockfish's best or nearly so, without leaving you worse) - the same rule
// as the "Brilliant !!" rating in review.ts.
//
//   findBrilliant()  - before your move: is there one here? (the hint)
//   missedBrilliant() - after a move: was there one the player didn't play?
import type { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { NormalMove } from "chessops/types";
import { makeSquare, makeUci } from "chessops/util";

import { afterMove, describeMove, variationSan } from "./coach";
import { moveTactics } from "./ideas";
import { BRILLIANT_FLOOR, BRILLIANT_LOSS, fenOf as fenKey, isSacrifice, reviewMove, winningChance, type Evaluation } from "./review";
import type { CoachEngine } from "./strategy";

const THINK = 1.5; // seconds
const LINES = 3; // Stockfish's top moves looked at
const NEARLY_BEST = BRILLIANT_LOSS; // points of winning chance, as in the rating

export interface Brilliant {
  found: boolean;
  move?: NormalMove;
  san?: string;
  role?: string; // the piece that makes the move, for a gentle hint
  offered?: string; // the piece left to be taken, e.g. "knight on b5"
  line?: string; // Stockfish's line, e.g. "10. Nxb5 cxb5 11. Bxb5+ Nbd7"
  text: string;
}

/** Is there a brilliant move for the side to move here? */
export async function findBrilliant(engine: CoachEngine, position: Chess): Promise<Brilliant> {
  const me = position.turn;
  const lines = await engine.analyse(position, THINK, LINES);
  if (!lines[0]?.pv.length) return { found: false, text: "No moves to look at here." };
  const bestChance = winningChance(lines[0].score, me);
  for (const line of lines) {
    const move = line.pv[0];
    if (!move) continue;
    const chance = winningChance(line.score, me);
    if (bestChance - chance > NEARLY_BEST) continue;
    const after = afterMove(position, move);
    const square = isSacrifice(position, move, after);
    // As in the rating: it must not leave you worse, and you mustn't already be completely winning
    if (square === undefined || chance < BRILLIANT_FLOOR || bestChance >= 97) continue;
    const piece = after.board.get(square)!;
    const san = makeSan(position, move);
    const tactics = moveTactics(position, move, me);
    return {
      found: true,
      move,
      san,
      role: position.board.get(move.from)!.role,
      offered: `${piece.role} on ${makeSquare(square)}`,
      line: variationSan(position, line.pv.slice(0, 6)),
      text:
        `${san}!! - ${describeMove(position, move)}. Your ${piece.role} on ${makeSquare(square)} can be taken, ` +
        `but the sacrifice works${tactics.length ? `: it ${tactics.join(" and ")}` : ""}.`,
    };
  }
  return {
    found: false,
    text: bestChance >= 97
      ? "No brilliant move needed: you're already winning comfortably, so the simple, safe moves are best."
      : "No brilliant move here - no sacrifice works in this position, so play solidly.",
  };
}

/** After a move: if the best move was a brilliant sacrifice and the player
 *  chose something else, a note about it. Needs Stockfish's scores for the
 *  position before and for the position after the best move. */
export function missedBrilliant(
  before: Chess, played: NormalMove, evals: Map<string, Evaluation>,
): string | undefined {
  const best = evals.get(fenKey(before))?.best;
  if (!best || makeUci(best) === makeUci(played)) return undefined;
  if (isSacrifice(before, best, afterMove(before, best)) === undefined) return undefined;
  const review = reviewMove(before, best, evals);
  if (review?.rating !== "Brilliant") return undefined;
  const heading = review.text.split("\n")[0].replace(/^\S+!! - Brilliant! /, "");
  return `Missed brilliant: ${makeSan(before, best)}!! - ${heading}`;
}

/** The positions to score so missedBrilliant() can decide: after each best
 *  move that offers up a piece. */
export function brilliantCandidates(positions: Chess[], evals: Map<string, Evaluation>): Chess[] {
  const wanted: Chess[] = [];
  for (const before of positions) {
    const best = evals.get(fenKey(before))?.best;
    if (!best) continue;
    const after = afterMove(before, best);
    if (isSacrifice(before, best, after) !== undefined) wanted.push(after);
  }
  return wanted;
}

