// Plain-word explanations of positions and moves: the parts of the desktop
// app's explain_position.py that the move review uses. The wording is kept
// identical, so both versions explain a move the same way.
import { attacks } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { Color, NormalMove, Role, Square } from "chessops/types";
import { makeSquare, opposite, squareFile, squareRank } from "chessops/util";

export const PIECE_VALUES: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

// d4, e4, d5, e5 (in this order, as in the desktop app)
const CENTRE_SQUARES: Square[] = [27, 28, 35, 36];

export function colourName(colour: Color): string {
  return colour === "white" ? "White" : "Black";
}

// ---------------------------------------------------------------------------
// Stockfish's score
// ---------------------------------------------------------------------------

/** A Stockfish score from White's point of view: centipawns, or moves to mate
 *  (positive: White mates, negative: Black mates). */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

/** Pawns to one decimal, rounded exactly as Python's round(x, 1) does: like
 *  JavaScript's toFixed, except that exact halves (0.25, 0.75...) go to the
 *  even digit. */
export function pawns(cp: number): number {
  if (Math.abs(cp) % 50 === 25) {
    const tenths = Math.trunc(cp / 10); // 25 -> 2, -75 -> -7
    return (tenths % 2 === 0 ? tenths : tenths + Math.sign(cp)) / 10;
  }
  return Number((cp / 100).toFixed(1));
}

/** 'White', 'Black', or undefined if the position is roughly equal. */
export function scoreLeader(score: Score): string | undefined {
  if (score.mate !== undefined) return score.mate > 0 ? "White" : "Black";
  const value = pawns(score.cp);
  if (Math.abs(value) < 0.3) return undefined;
  return value > 0 ? "White" : "Black";
}

/** Stockfish's score in words, e.g. "White is slightly better." */
export function describeScore(score: Score): string {
  const side = scoreLeader(score);
  if (score.mate !== undefined) return `${side} can force checkmate in ${Math.abs(score.mate)} move(s).`;
  if (side === undefined) return "The position is roughly equal.";
  const size = Math.abs(pawns(score.cp));
  if (size < 1.0) return `${side} is slightly better.`;
  if (size < 2.0) return `${side} is clearly better.`;
  if (size < 4.0) return `${side} is much better and should be winning.`;
  return `${side} is completely winning.`;
}

// ---------------------------------------------------------------------------
// Board questions (the python-chess ones the explanations rely on)
// ---------------------------------------------------------------------------

/** Squares of `colour`'s pieces that attack `square` (pins ignored, like python-chess). */
export function attackers(position: Chess, colour: Color, square: Square) {
  return position.kingAttackers(square, colour, position.board.occupied);
}

export function isAttackedBy(position: Chess, colour: Color, square: Square): boolean {
  return attackers(position, colour, square).nonEmpty();
}

/** The squares the piece on `square` attacks. */
export function attacksFrom(position: Chess, square: Square) {
  const piece = position.board.get(square)!;
  return attacks(piece, square, position.board.occupied);
}

/** Castling, stored by chessops as the king moving onto its own rook. */
export function isCastling(position: Chess, move: NormalMove): boolean {
  const piece = position.board.get(move.from);
  if (piece?.role !== "king") return false;
  const target = position.board.get(move.to);
  return (target?.role === "rook" && target.color === piece.color) || Math.abs(move.to - move.from) === 2;
}

/** A move in the UCI form Stockfish expects: castling as the king's two-square
 *  move (e1g1), not chessops's king-onto-rook (e1h1). */
export function standardUci(position: Chess, move: NormalMove): string {
  if (isCastling(position, move) && Math.abs(move.to - move.from) !== 2) {
    const kingTo = (move.from & ~7) + (move.to > move.from ? 6 : 2);
    return makeSquare(move.from) + makeSquare(kingTo);
  }
  return makeSquare(move.from) + makeSquare(move.to) + (move.promotion ? move.promotion[0] === "k" ? "n" : move.promotion[0] : "");
}

export function isCapture(position: Chess, move: NormalMove): boolean {
  const mover = position.turn;
  const target = position.board.get(move.to);
  if (target && target.color !== mover) return true;
  const piece = position.board.get(move.from);
  return piece?.role === "pawn" && squareFile(move.from) !== squareFile(move.to) && !target; // en passant
}

/** How many legal moves there are (a promotion counts as four, as in python-chess). */
export function legalMoveCount(position: Chess): number {
  let count = 0;
  for (const [from, dests] of position.allDests()) {
    const pawn = position.board.get(from)?.role === "pawn";
    for (const to of dests) count += pawn && (squareRank(to) === 0 || squareRank(to) === 7) ? 4 : 1;
  }
  return count;
}

export function afterMove(position: Chess, move: NormalMove): Chess {
  const after = position.clone();
  after.play(move);
  return after;
}

/** White's material points minus Black's. */
export function materialBalance(position: Chess): number {
  let balance = 0;
  for (const square of position.board.occupied) {
    const piece = position.board.get(square)!;
    balance += piece.color === "white" ? PIECE_VALUES[piece.role] : -PIECE_VALUES[piece.role];
  }
  return balance;
}

/** A line of moves in notation, numbered like python-chess writes it:
 *  "3. Nf3 Nc6 4. Bb5", or "3...Nc6 4. Bb5" when it starts with Black. */
export function variationSan(start: Chess, moves: NormalMove[]): string {
  let position = start.clone();
  const parts: string[] = [];
  for (const move of moves) {
    const san = makeSan(position, move);
    if (position.turn === "white") parts.push(`${position.fullmoves}. ${san}`);
    else if (!parts.length) parts.push(`${position.fullmoves}...${san}`);
    else parts.push(san);
    position = afterMove(position, move);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Moves in words
// ---------------------------------------------------------------------------

/** What a move does, e.g. "White's knight on f3 captures the queen on h4". */
export function describeMove(position: Chess, move: NormalMove): string {
  const side = colourName(position.turn);
  if (isCastling(position, move)) {
    return `${side} castles ${move.to > move.from ? "kingside" : "queenside"}`;
  }
  const piece = position.board.get(move.from)!;
  const end = makeSquare(move.to);
  let text = `${side}'s ${piece.role} on ${makeSquare(move.from)} `;
  if (isCapture(position, move)) {
    const captured = position.board.get(move.to); // empty for en passant
    text += `captures the ${captured ? captured.role : "pawn"} on ${end}`;
  } else {
    text += `moves to ${end}`;
  }
  if (move.promotion) text += ` and promotes to a ${move.promotion}`;
  return text;
}

/** In plain words, what a move achieves. */
export function moveIdeas(position: Chess, move: NormalMove): string[] {
  const ideas: string[] = [];
  const mover = position.turn;
  const enemy = opposite(mover);
  const piece = position.board.get(move.from)!;
  const name = piece.role;
  const end = makeSquare(move.to);
  const after = afterMove(position, move);
  const castling = isCastling(position, move);

  if (castling) ideas.push("It castles, tucking the king away to safety and bringing a rook towards the centre.");

  if (isCapture(position, move)) {
    const captured = position.board.get(move.to);
    const capturedName = captured ? captured.role : "pawn";
    if (captured && !attackers(position, enemy, move.to).nonEmpty()) {
      ideas.push(`It wins the ${capturedName} on ${end} for free, because nothing was defending it.`);
    } else {
      ideas.push(`It captures the ${capturedName} on ${end}.`);
    }
  }

  if (after.isCheckmate()) ideas.push("It is checkmate.");
  else if (after.isCheck()) ideas.push("It gives check.");

  if (
    piece.role !== "king" &&
    isAttackedBy(position, enemy, move.from) &&
    !isAttackedBy(after, enemy, move.to)
  ) {
    ideas.push(`It moves the ${name} out of danger.`);
  }

  const homeRank = mover === "white" ? 0 : 7;
  if ((piece.role === "knight" || piece.role === "bishop") && squareRank(move.from) === homeRank) {
    ideas.push(`It develops the ${name} from its starting square, bringing it into the game.`);
  }

  if (!castling) {
    const attacked = attacksFrom(after, move.to);
    const centre = CENTRE_SQUARES.filter((s) => attacked.has(s) || s === move.to).map(makeSquare);
    if (centre.length) ideas.push(`The ${name} on ${end} helps control the centre (${centre.join(", ")}).`);

    const targets: string[] = [];
    for (const square of attacked) {
      const target = after.board.get(square);
      if (target && target.color === enemy && target.role !== "king") {
        targets.push(`the ${target.role} on ${makeSquare(square)}`);
      }
    }
    if (targets.length) {
      const listed =
        targets.length === 1 ? targets[0] : `${targets.slice(0, -1).join(", ")} and ${targets[targets.length - 1]}`;
      ideas.push(`From ${end}, the ${name} puts pressure on ${listed}.`);
    }
  }
  return ideas;
}
