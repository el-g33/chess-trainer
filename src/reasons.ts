// Why a quiet slip was a slip: when a move loses nothing you can see but
// leaves you worse placed, the coach compares the position after it with the
// position after the better move and names the biggest weakness the move
// made that the better move doesn't: lines opened towards your own king,
// holes in front of it, or a weak pawn (isolated, doubled, backward), or a
// central square no pawn can ever guard again. These are facts about the
// pawns, and pawns never move back, so each comes with the lesson in a line.
// Then the pieces: in the opening, the queen out early, the king left in the
// centre, the same piece moved again, a centre pawn blocked in; and at any
// time, a knight put on the edge or a piece put where it does much less.

import { attacks } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import type { Color, NormalMove } from "chessops/types";
import { makeSquare, opposite } from "chessops/util";

import { afterMove, isCastling } from "./coach";

export type ReasonKind = "open-file" | "king-hole" | "shield" | "isolated" | "doubled" | "backward" | "centre-hole"
  | "early-queen" | "king-centre" | "same-piece" | "blocks-pawn" | "rim" | "passive";

export interface Reason {
  kind: ReasonKind;
  squares: number[]; // what to circle: the pawns, or the squares
  file?: number;
  role?: string; // the piece it's about
  reach?: [number, number]; // squares it reached before, and now
}

const FILES = "abcdefgh";
const fileOf = (square: number) => square & 7;
const rankOf = (square: number) => square >> 3;
/** A rank counted from the side's own end (0 = its back rank). */
const rel = (side: Color, square: number) => (side === "white" ? rankOf(square) : 7 - rankOf(square));
const pawns = (position: Chess, side: Color) => [...position.board.pieces(side, "pawn")];

/** The files around the king when it sits on a wing (castled, or as good as):
 *  undefined for a king in the centre, where king cover is a different story. */
function kingFiles(position: Chess, side: Color): number[] | undefined {
  const king = position.board.kingOf(side);
  if (king === undefined || rel(side, king) > 1 || [3, 4].includes(fileOf(king))) return undefined;
  const file = fileOf(king);
  return [file - 1, file, file + 1].filter((f) => f >= 0 && f < 8);
}

/** Can a pawn of `side` ever guard this square? (Pawns on the next files that are still behind it.) */
function guardable(position: Chess, side: Color, square: number): boolean {
  return pawns(position, side).some((p) => Math.abs(fileOf(p) - fileOf(square)) === 1 && rel(side, p) < rel(side, square));
}

/** A square counts as a hole only while it's empty of the side's own pawn. */
const holeAt = (position: Chess, side: Color, square: number) => {
  const piece = position.board.get(square);
  return !(piece?.role === "pawn" && piece.color === side) && !guardable(position, side, square);
};

function openFilesNearKing(position: Chess, side: Color): number[] {
  const files = kingFiles(position, side);
  if (!files) return [];
  const mine = pawns(position, side);
  return files.filter((f) => !mine.some((p) => fileOf(p) === f));
}

/** Holes right in front of the king: the squares one and two ahead of it on its files. */
function kingHoles(position: Chess, side: Color): number[] {
  const files = kingFiles(position, side);
  if (!files) return [];
  const ranks = side === "white" ? [2] : [5]; // (the third rank: where a pushed pawn leaves its mark)
  return files.flatMap((f) => ranks.map((r) => r * 8 + f)).filter((square) => holeAt(position, side, square));
}

/** Whether a square is one of the holes right in front of the side's king. */
export const isKingHole = (position: Chess, side: Color, square: number) => kingHoles(position, side).includes(square);

/** Pawns of the king's cover: on its files, one or two squares ahead of the back rank. */
function shieldCount(position: Chess, side: Color): number {
  const files = kingFiles(position, side);
  if (!files) return 0;
  return pawns(position, side).filter((p) => files.includes(fileOf(p)) && [1, 2].includes(rel(side, p))).length;
}

function isolated(position: Chess, side: Color): number[] {
  const mine = pawns(position, side);
  return mine.filter((p) => !mine.some((q) => Math.abs(fileOf(q) - fileOf(p)) === 1));
}

function doubledFiles(position: Chess, side: Color): number[] {
  const files = pawns(position, side).map(fileOf);
  return [...new Set(files.filter((f) => files.filter((g) => g === f).length > 1))];
}

/** A pawn left behind: it has neighbours, but they're all further on, and an
 *  enemy pawn guards the square in front of it, so it can't catch up. */
function backward(position: Chess, side: Color): number[] {
  const mine = pawns(position, side);
  const theirs = pawns(position, opposite(side));
  const step = side === "white" ? 8 : -8;
  return mine.filter((p) => {
    const beside = mine.filter((q) => Math.abs(fileOf(q) - fileOf(p)) === 1);
    if (!beside.length || beside.some((q) => rel(side, q) <= rel(side, p))) return false;
    const stop = p + step;
    if (stop < 0 || stop > 63) return false;
    return theirs.some((t) => Math.abs(fileOf(t) - fileOf(stop)) === 1 && rel(side, t) === rel(side, stop) + 1);
  });
}

/** Central squares in the side's own half (c- to f-files, third and fourth
 *  ranks) that no pawn of theirs can ever guard. */
function centreHoles(position: Chess, side: Color): number[] {
  const squares: number[] = [];
  for (const f of [2, 3, 4, 5]) {
    for (const r of side === "white" ? [2, 3] : [5, 4]) {
      const square = r * 8 + f;
      if (holeAt(position, side, square)) squares.push(square);
    }
  }
  return squares;
}

/** Holes their pieces can step into first; ones the side's own pieces stand on last. */
const emptyFirst = (position: Chess, side: Color, squares: number[]) =>
  [...squares].sort((a, b) => Number(position.board.get(a)?.color === side) - Number(position.board.get(b)?.color === side));

/** The weakness `played` makes for the mover that `best` doesn't, the most
 *  important first; undefined when there's none (or the move is the best). */
export function positionalReason(before: Chess, played: NormalMove, best: NormalMove | undefined): Reason | undefined {
  if (!best || (best.from === played.from && best.to === played.to)) return undefined;
  const side = before.turn;
  const mine = afterMove(before, played);
  const better = afterMove(before, best);
  const fresh = (now: number[], then: number[], was: number[]) => now.filter((x) => !then.includes(x) && !was.includes(x));

  const files = fresh(openFilesNearKing(mine, side), openFilesNearKing(better, side), openFilesNearKing(before, side));
  // (the king hasn't moved: a king that walks to another wing has other things going on)
  if (files.length && mine.board.kingOf(side) === before.board.kingOf(side)) return { kind: "open-file", squares: [], file: files[0] };
  const pawnMove = before.board.get(played.from)?.role === "pawn";
  if (pawnMove && mine.board.kingOf(side) === before.board.kingOf(side)) {
    const holes = fresh(kingHoles(mine, side), kingHoles(better, side), kingHoles(before, side));
    if (holes.length) return { kind: "king-hole", squares: emptyFirst(mine, side, holes) };
    // a cover pawn pushed past the second step loosens the king's cover
    if (shieldCount(mine, side) < shieldCount(before, side) && shieldCount(better, side) >= shieldCount(before, side)) {
      return { kind: "shield", squares: [played.to] };
    }
  }
  const lone = fresh(isolated(mine, side), isolated(better, side).concat(isolated(before, side)), []);
  // (only a pawn that wasn't already isolated, and isn't the one that just moved off on its own)
  if (lone.length) return { kind: "isolated", squares: lone.slice(0, 2), file: fileOf(lone[0]) };
  const doubled = fresh(doubledFiles(mine, side), doubledFiles(better, side), doubledFiles(before, side));
  if (doubled.length) {
    const file = doubled[0];
    return { kind: "doubled", squares: pawns(mine, side).filter((p) => fileOf(p) === file), file };
  }
  const behind = fresh(backward(mine, side), backward(better, side), backward(before, side));
  if (behind.length) return { kind: "backward", squares: behind };
  if (pawnMove) {
    const holes = fresh(centreHoles(mine, side), centreHoles(better, side), centreHoles(before, side));
    if (holes.length) return { kind: "centre-hole", squares: emptyFirst(mine, side, holes).slice(0, 1) };
  }
  return pieceReason(before, played, best, mine, better);
}

const MINOR_HOMES: Record<Color, number[]> = { white: [1, 2, 5, 6], black: [57, 58, 61, 62] };
const NAMES: Record<string, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };

/** Knights and bishops still on their starting squares. */
function undeveloped(position: Chess, side: Color): number {
  return MINOR_HOMES[side].filter((square) => {
    const piece = position.board.get(square);
    return piece?.color === side && (piece.role === "knight" || piece.role === "bishop");
  }).length;
}

/** The squares a piece reaches from a square (empty ones and the other side's pieces). */
function reach(position: Chess, square: number): number {
  const piece = position.board.get(square);
  if (!piece) return 0;
  return attacks(piece, square, position.board.occupied).diff(position.board[piece.color]).size();
}

/** What the move did with the piece, when the better move didn't: the queen
 *  out early, the king left in the centre, a piece moved again while others
 *  wait at home, a centre pawn blocked in, a knight on the edge, a piece put
 *  where it reaches far fewer squares. (Quiet moves only.) The king left in
 *  the centre counts whatever moved, when the better move was to castle. */
function pieceReason(before: Chess, played: NormalMove, best: NormalMove, mine: Chess, better: Chess): Reason | undefined {
  const side = before.turn;
  const piece = before.board.get(played.from);
  const king = before.board.kingOf(side);
  // the king left in the centre, whatever moved instead of castling (in the opening)
  if (before.fullmoves <= 15 && isCastling(before, best) && !isCastling(before, played) && king !== undefined && [3, 4].includes(fileOf(king))
    && !before.board.get(played.to)) {
    return { kind: "king-centre", squares: [king] };
  }
  if (!piece || piece.role === "pawn" || before.board.get(played.to)) return undefined;
  const role = NAMES[piece.role];
  const bestPiece = before.board.get(best.from);
  const opening = before.fullmoves <= 12 && undeveloped(before, side) >= 2;
  const attacked = before.kingAttackers(played.from, opposite(side), before.board.occupied).nonEmpty();
  if (opening) {
    // (out, or further out: a queen going back home isn't coming out early)
    const outward = rel(side, played.to) >= 2 && rel(side, played.to) >= rel(side, played.from);
    if (piece.role === "queen" && outward && bestPiece?.role !== "queen" && before.fullmoves <= 10 && !attacked) return { kind: "early-queen", squares: [played.to], role };
    // a piece that's already out moves again, while the better move brings out a new one
    const fromHome = (square: number) => MINOR_HOMES[side].includes(square) || square === (side === "white" ? 3 : 59);
    if (piece.role !== "king" && !fromHome(played.from) && !attacked && bestPiece && bestPiece.role !== "pawn" && fromHome(best.from)) {
      return { kind: "same-piece", squares: [played.to], role };
    }
  }
  // a piece put right in front of an unmoved centre pawn (d- or e-pawn), early on
  const step = side === "white" ? 8 : -8;
  const blocked = played.to - step;
  const pawn = before.board.get(blocked);
  // (and the better move doesn't leave it blocked too)
  const stillBlocked = better.board.get(blocked)?.role === "pawn" && !!better.board.get(played.to) && better.board.get(played.to)?.role !== "pawn";
  if (before.fullmoves <= 15 && [3, 4].includes(fileOf(played.to)) && rel(side, played.to) === 2 && pawn?.role === "pawn" && pawn.color === side
    && rel(side, blocked) === 1 && !stillBlocked) {
    return { kind: "blocks-pawn", squares: [blocked, played.to], role, file: fileOf(blocked) };
  }
  if (piece.role === "knight" && [0, 7].includes(fileOf(played.to)) && ![0, 7].includes(fileOf(played.from)) && !attacked
    && !(bestPiece?.role === "knight" && [0, 7].includes(fileOf(best.to)))) {
    return { kind: "rim", squares: [played.to], role };
  }
  // a piece put where it does much less (and not running from an attack)
  if (["knight", "bishop", "rook", "queen"].includes(piece.role) && !attacked) {
    const was = reach(before, played.from);
    const now = reach(mine, played.to);
    if (now <= was - 3 && now * 3 <= was * 2 && !(best.from === played.from)) return { kind: "passive", squares: [played.to], role, reach: [was, now] };
  }
  return undefined;
}

/** The reason in one plain line, from the listener's side ("you", "they", or the colour). */
export function reasonWords(reason: Reason, mover: Color, listener: Color | null): string {
  const mine = listener === null || listener === mover;
  const who = listener === null ? (mover === "white" ? "White" : "Black") : mine ? "You" : "They";
  const your = listener === null ? (mover === "white" ? "White's" : "Black's") : mine ? "your" : "their";
  const square = makeSquare(reason.squares[0] ?? 0);
  const file = FILES[reason.file ?? 0];
  // "That leaves..." for you; "They've left..." for them (said as your chance)
  const that = (yours: string, theirs: string) => (listener !== null && !mine ? theirs : yours);
  switch (reason.kind) {
    case "open-file": return that(`That opens the ${file}-file in front of ${your} king.`, `They've opened the ${file}-file in front of their king.`);
    case "king-hole": return that(`That leaves a hole on ${square}, right in front of ${your} king.`, `They've left a hole on ${square}, right in front of their king.`);
    case "shield": return that(`That loosens the pawns in front of ${your} king.`, "They've loosened the pawns in front of their king.");
    case "isolated": {
      const named = reason.squares.length > 1 ? `${FILES[fileOf(reason.squares[0])]}- and ${FILES[fileOf(reason.squares[1])]}-pawns` : `${file}-pawn`;
      return that(`That leaves ${your} ${named} isolated.`, `They've left their ${named} isolated.`);
    }
    case "doubled": return that(`That doubles ${your} pawns on the ${file}-file.`, `They've doubled their pawns on the ${file}-file.`);
    case "backward": return that(`That leaves ${your} ${square} pawn behind its neighbours.`, `They've left their ${square} pawn behind its neighbours.`);
    case "centre-hole": {
      const none = listener === null ? `no ${who} pawn` : "no pawn of yours";
      return that(`That gives up ${square}: ${none} can ever guard it now.`, `They've given up ${square}: no pawn of theirs can ever guard it now.`);
    }
    case "early-queen": return that(`That brings ${your} queen out early.`, "They've brought their queen out early.");
    case "king-centre": return that(`That leaves ${your} king in the centre.`, "They've left their king in the centre.");
    case "same-piece": return that(`That moves ${your} ${reason.role} again while other pieces wait at home.`, `They've moved their ${reason.role} again while other pieces wait at home.`);
    case "blocks-pawn": return that(`That blocks ${your} ${file}-pawn.`, `They've blocked their ${file}-pawn.`);
    case "rim": return that(`That puts ${your} knight on the edge.`, "They've put their knight on the edge.");
    case "passive": {
      const [was, now] = reason.reach ?? [0, 0];
      return that(`That puts ${your} ${reason.role} where it does less: it reaches ${now} squares instead of ${was}.`,
        `They've put their ${reason.role} where it does less: it reaches ${now} squares instead of ${was}.`);
    }
  }
}

/** Why it matters, in a line (for the explanation card). */
export const REASON_LESSON: Record<ReasonKind, string> = {
  "open-file": "Open lines near the king let rooks and the queen in.",
  "king-hole": "Pawns can't move back, so the hole stays: a home for their pieces.",
  shield: "The fewer pawns in front of the king, the easier it is to attack.",
  isolated: "No pawn beside it can ever defend it, so it needs pieces to guard it.",
  doubled: "Doubled pawns can't guard each other, and they're hard to move on.",
  backward: "It can't safely step forward, and no pawn can come back to defend it.",
  "centre-hole": "A square no pawn can chase them from is a perfect home for their pieces.",
  "early-queen": "Their pieces can chase it, gaining time as they come out.",
  "king-centre": "Castle early: the centre can open fast, and the king is safest tucked away.",
  "same-piece": "In the opening, bring out a new piece with each move.",
  "blocks-pawn": "With a centre pawn stuck, the pieces behind it have less room.",
  rim: "A knight on the edge reaches only half as many squares.",
  passive: "Pieces are strongest where they reach the most squares.",
};
