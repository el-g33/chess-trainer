// Why a quiet slip was a slip: when a move loses nothing you can see but
// leaves you worse placed, the coach compares the position after it with the
// position after the better move and names the biggest weakness the move
// made that the better move doesn't: lines opened towards your own king,
// holes in front of it, or a weak pawn (isolated, doubled, backward), or a
// central square no pawn can ever guard again. These are facts about the
// pawns, and pawns never move back, so each comes with the lesson in a line.

import type { Chess } from "chessops/chess";
import type { Color, NormalMove } from "chessops/types";
import { makeSquare, opposite } from "chessops/util";

import { afterMove } from "./coach";

export type ReasonKind = "open-file" | "king-hole" | "shield" | "isolated" | "doubled" | "backward" | "centre-hole";

export interface Reason {
  kind: ReasonKind;
  squares: number[]; // what to circle: the pawns, or the squares
  file?: number;
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
};
