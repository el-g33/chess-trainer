// Playing style: after Stockfish's top move, an alternative that suits how you
// like to play - positional (solid: develop, improve pieces, keep a good pawn
// structure) or attacking (sharp: checks, sacrifices, going for the king) -
// but only one that's still a good move: close to the best in winning
// chance, and never throwing away an advantage.

import { attacks } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import type { Color, NormalMove } from "chessops/types";
import { opposite } from "chessops/util";

import { afterMove, isCastling, type Score } from "./coach";
import { isSacrifice, winningChance } from "./review";

export type Style = "positional" | "attacking";

// An alternative may be this much worse than the best move (in winning
// chance, 0-100): "Excellent" is under 2, "Good" under 5
const MAX_LOSS = 4;
// ...and must not fall from an advantage (or from level) to below it
const ADVANTAGE = 55;
const LEVEL = 45;
// ...and must suit the style clearly better than the best move does
const CLEARER = 1;

const file = (square: number) => square & 7;
const rank = (square: number) => square >> 3;
const near = (a: number, b: number, d = 2) => Math.abs(file(a) - file(b)) <= d && Math.abs(rank(a) - rank(b)) <= d;

/** How well a move suits the style (higher is more so). */
export function styleScore(position: Chess, move: NormalMove, style: Style): number {
  const piece = position.board.get(move.from);
  if (!piece) return 0;
  const me = piece.color;
  const them = opposite(me);
  const after = afterMove(position, move);
  const victim = position.board.get(move.to);
  const capture = !!victim && victim.color !== me;
  const check = after.isCheck();
  const castles = isCastling(position, move);
  const king = after.board.kingOf(them);
  const home = me === "white" ? 0 : 7;
  const reachAfter = attacks(piece, move.to, after.board.occupied);
  const reachBefore = attacks(piece, move.from, position.board.occupied);
  const kingZone = king === undefined ? 0 : [...reachAfter].filter((s) => near(s, king, 1)).length;

  if (style === "attacking") {
    let score = 0;
    if (check) score += 3;
    if (isSacrifice(position, move, after) !== undefined) score += 3;
    if (capture) score += 0.3; // only a tie-break: a trade in the centre isn't an attack
    if (king !== undefined && near(move.to, king)) score += 2;
    score += kingZone * 0.7;
    // pawns storming the side their king is on
    if (piece.role === "pawn" && king !== undefined && Math.abs(file(move.to) - file(king)) <= 2) score += 1.5;
    // heavy pieces lining up on their king's file
    if ((piece.role === "rook" || piece.role === "queen") && king !== undefined && file(move.to) === file(king)) score += 1;
    return score;
  }

  let score = 0;
  if (!capture && !check) score += 1; // quiet, building moves
  if (castles) score += 3;
  if ((piece.role === "knight" || piece.role === "bishop") && rank(move.from) === home) score += 2; // development
  if (piece.role === "pawn" && [3, 4].includes(file(move.to)) && [3, 4].includes(rank(move.to))) score += 1; // the centre
  score += Math.max(0, reachAfter.size() - reachBefore.size()) * 0.3; // a better square
  // the king stays put in the middlegame; the queen doesn't wander early
  if (piece.role === "king" && !castles && position.board.pieces(them, "queen").nonEmpty()) score -= 2;
  if (piece.role === "queen" && position.fullmoves < 10) score -= 1;
  // pawn captures that leave doubled pawns
  if (piece.role === "pawn" && capture) {
    const doubled = [...after.board.pieces(me, "pawn")].filter((s) => file(s) === file(move.to)).length > 1;
    if (doubled) score -= 2;
  }
  return score;
}

export interface StyleChoice {
  move: NormalMove;
  pv: NormalMove[];
  score: Score;
}

/** Among Stockfish's top lines, the one that suits the style best while
 *  staying a good move; undefined when the best move already suits it (or
 *  nothing else is good enough). */
export function styleAlternative(position: Chess, found: { score: Score; pv: NormalMove[] }[], style: Style): StyleChoice | undefined {
  const me: Color = position.turn;
  // A quick search can list a move twice, or out of order: once each, best first
  const seen = new Set<string>();
  const lines = found
    .filter((line) => {
      const move = line.pv[0];
      const key = move ? `${move.from}-${move.to}` : "";
      if (!move || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => winningChance(b.score, me) - winningChance(a.score, me));
  const best = lines[0];
  if (!best?.pv.length) return undefined;
  const bestChance = winningChance(best.score, me);
  const bestFit = styleScore(position, best.pv[0], style);
  let chosen: StyleChoice | undefined;
  let chosenFit = bestFit + CLEARER;
  for (const line of lines.slice(1)) {
    const move = line.pv[0];
    if (!move) continue;
    const chance = winningChance(line.score, me);
    if (bestChance - chance > MAX_LOSS) continue;
    if (bestChance >= ADVANTAGE && chance < ADVANTAGE) continue; // keeps the advantage
    if (bestChance >= LEVEL && chance < LEVEL) continue; // doesn't make a level position worse
    const fit = styleScore(position, move, style);
    if (fit >= chosenFit) {
      chosen = { move, pv: line.pv, score: line.score };
      chosenFit = fit;
    }
  }
  return chosen;
}
