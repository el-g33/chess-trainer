// Middlegame ideas for "Explain the ideas" (web version only; the desktop
// app's ideas.py doesn't have these): outposts, weak squares, bad bishops,
// rooks on the 7th rank, the isolated queen's pawn and the minority attack.
// Each is a standard positional idea, read straight from the board.
import { knightAttacks, pawnAttacks } from "chessops/attacks";
import type { Chess } from "chessops/chess";
import type { Color, Square } from "chessops/types";
import { makeSquare, opposite, squareFile, squareRank } from "chessops/util";

const owner = (colour: Color, you: Color) => (colour === you ? "your" : "their");
const Owner = (colour: Color, you: Color) => (colour === you ? "Your" : "Their");
const FILES = "abcdefgh";
const at = (file: number, rank: number): Square => rank * 8 + file;

function pawnsOf(position: Chess, colour: Color): Square[] {
  return [...position.board.pieces(colour, "pawn")];
}

/** Can a pawn of `colour` ever attack this square? Only pawns on the
 *  neighbouring files that are still behind it (pawns only move forward). */
function pawnCanEverAttack(position: Chess, colour: Color, square: Square): boolean {
  const file = squareFile(square);
  const rank = squareRank(square);
  return pawnsOf(position, colour).some((p) => {
    if (Math.abs(squareFile(p) - file) !== 1) return false;
    return colour === "white" ? squareRank(p) < rank : squareRank(p) > rank;
  });
}

/** Is the square defended by a pawn of `colour` right now? */
function pawnDefends(position: Chess, colour: Color, square: Square): boolean {
  // A pawn of `colour` attacks `square` if `square` is attacked from the pawn's square
  return pawnAttacks(opposite(colour), square).intersects(position.board.pieces(colour, "pawn"));
}

/** Outposts: squares in the enemy half that no enemy pawn can ever attack,
 *  protected by your own pawn - ideal homes for a knight. */
function outpostNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const side of [you, opposite(you)]) {
    const enemy = opposite(side);
    const ranks = side === "white" ? [3, 4, 5] : [4, 3, 2]; // 4th-6th rank from that side
    for (const rank of ranks) {
      for (let file = 1; file <= 6; file++) {
        const square = at(file, rank);
        if (!pawnDefends(position, side, square) || pawnCanEverAttack(position, enemy, square)) continue;
        const piece = position.board.get(square);
        const name = `${FILES[file]}${rank + 1}`;
        if (piece?.color === side && (piece.role === "knight" || piece.role === "bishop")) {
          notes.push(`${Owner(side, you)} ${piece.role} on ${name} sits on an outpost: no ${enemy} pawn can ever chase it away, and a pawn protects it.`);
        } else if (!piece) {
          const knight = [...knightAttacks(square).intersect(position.board.pieces(side, "knight"))][0];
          if (knight !== undefined) {
            notes.push(`${name} is an outpost for ${owner(side, you)} knight on ${makeSquare(knight)}: from there no ${enemy} pawn could ever drive it away.`);
          }
        }
      }
    }
  }
  return notes.slice(0, 3);
}

/** Weak squares (holes): squares in a side's own half, near the centre, that
 *  none of its pawns can ever defend - and that an enemy knight can reach. */
function weakSquareNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const side of [you, opposite(you)]) {
    const enemy = opposite(side);
    const ranks = side === "white" ? [2, 3] : [5, 4]; // its 3rd and 4th rank
    for (const rank of ranks) {
      for (let file = 2; file <= 5; file++) {
        const square = at(file, rank);
        if (position.board.get(square) || pawnCanEverAttack(position, side, square)) continue;
        // only worth mentioning if an enemy knight could actually use it, protected by an enemy pawn
        if (!pawnDefends(position, enemy, square)) continue;
        const knight = [...knightAttacks(square).intersect(position.board.pieces(enemy, "knight"))][0];
        if (knight === undefined) continue;
        notes.push(
          `${FILES[file]}${rank + 1} is a weak square (a hole) in ${owner(side, you)} position: ` +
            `no ${side} pawn can ever defend it, and ${owner(enemy, you)} knight on ${makeSquare(knight)} could settle there.`,
        );
      }
    }
  }
  return notes.slice(0, 2);
}

/** A bad bishop: the side's advanced centre pawns stand mostly on the
 *  bishop's colour, blocking it. (Pawns still at home don't count.) */
function bishopNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const side of [you, opposite(you)]) {
    const home = side === "white" ? 1 : 6;
    const advanced = pawnsOf(position, side).filter(
      (p) => squareFile(p) >= 2 && squareFile(p) <= 5 && squareRank(p) !== home,
    );
    for (const bishop of position.board.pieces(side, "bishop")) {
      const light = (squareFile(bishop) + squareRank(bishop)) % 2 === 1;
      const same = advanced.filter((p) => ((squareFile(p) + squareRank(p)) % 2 === 1) === light);
      if (same.length < 2 || same.length <= advanced.length - same.length) continue;
      // Outside its own pawn chain, it's "bad" but still active
      const ahead = (p: Square) => (side === "white" ? squareRank(bishop) > squareRank(p) : squareRank(bishop) < squareRank(p));
      const outside = same.every(ahead);
      const colour = light ? "light" : "dark";
      const pawns = same.map(makeSquare).join(" and ");
      if (outside) {
        notes.push(
          `${Owner(side, you)} ${colour}-squared bishop on ${makeSquare(bishop)} is technically a "bad bishop" ` +
            `(${owner(side, you)} pawns on ${pawns} are on its colour), but it's active outside the pawn chain - ` +
            `${side === you ? "keep it there, where it can't get shut in." : "try to trap it or trade it, as it can't easily get back."}`,
        );
      } else {
        notes.push(
          `${Owner(side, you)} ${colour}-squared bishop on ${makeSquare(bishop)} is a "bad bishop": ` +
            `${owner(side, you)} pawns on ${pawns} stand on its colour and block it. ` +
            `${side === you ? "Try to trade it, get it outside the pawn chain, or move those pawns to the other colour." : "Keep those pawns fixed, and trade your other pieces rather than that bishop."}`,
        );
      }
    }
  }
  return notes;
}

/** A rook on the 7th rank (2nd for Black) attacks the pawns there and hems in the king. */
function seventhRankNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const side of [you, opposite(you)]) {
    const enemy = opposite(side);
    const seventh = side === "white" ? 6 : 1;
    const eighth = side === "white" ? 7 : 0;
    for (const rook of position.board.pieces(side, "rook")) {
      if (squareRank(rook) !== seventh) continue;
      const pawns = pawnsOf(position, enemy).filter((p) => squareRank(p) === seventh);
      const king = position.board.kingOf(enemy);
      if (pawns.length || (king !== undefined && squareRank(king) === eighth)) {
        notes.push(
          `${Owner(side, you)} rook on ${makeSquare(rook)} is on the 7th rank: ` +
            `it ${pawns.length ? `attacks the pawns there (${pawns.map(makeSquare).join(", ")})` : "cuts off the enemy king on the back rank"} - a classic advantage.`,
        );
      }
    }
  }
  return notes;
}

/** The isolated queen's pawn: a d-pawn with no pawns beside it - and the plan for each side. */
function iqpNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const side of [you, opposite(you)]) {
    const pawns = pawnsOf(position, side);
    const dPawns = pawns.filter((p) => squareFile(p) === 3);
    if (dPawns.length !== 1 || pawns.some((p) => squareFile(p) === 2 || squareFile(p) === 4)) continue;
    const square = makeSquare(dPawns[0]);
    const front = makeSquare(dPawns[0] + (side === "white" ? 8 : -8));
    notes.push(
      `${Owner(side, you)} pawn on ${square} is an isolated queen's pawn (IQP). ` +
        (side === you
          ? `It gives your pieces space and open lines: play actively (attack the king, prepare the ${square[0]}-pawn push) rather than trading pieces, which leaves the pawn weak.`
          : `Blockade the square in front of it (${front}, ideally with a knight), trade pieces, and attack the pawn in the endgame.`),
    );
  }
  return notes;
}

/** The minority attack: two queenside pawns against three, pushing b4-b5 to
 *  leave the opponent with a weak pawn (the Carlsbad structure). */
function minorityAttackNotes(position: Chess, you: Color): string[] {
  const notes: string[] = [];
  for (const side of [you, opposite(you)]) {
    const enemy = opposite(side);
    const queenside = (colour: Color) => pawnsOf(position, colour).filter((p) => squareFile(p) <= 2);
    const mine = queenside(side);
    const theirs = queenside(enemy);
    const hasFile = (pawns: Square[], file: number) => pawns.some((p) => squareFile(p) === file);
    const d = (colour: Color) => pawnsOf(position, colour).some((p) => squareFile(p) === 3);
    if (mine.length === 2 && hasFile(mine, 0) && hasFile(mine, 1) && !hasFile(mine, 2) &&
        theirs.length === 3 && hasFile(theirs, 2) && d(side) && d(enemy)) {
      const b = side === "white" ? "b4-b5" : "...b5-b4";
      notes.push(
        `Queenside: ${owner(side, you)} two pawns face ${owner(enemy, you)} three - the set-up for the minority attack. ` +
          `Pushing ${b} aims to break up ${owner(enemy, you)} pawns and leave a weak one (often on the c-file) to attack.`,
      );
    }
  }
  return notes;
}

/** All the middlegame notes for a position. */
export function middlegameNotes(position: Chess, you: Color): string[] {
  return [
    ...outpostNotes(position, you),
    ...weakSquareNotes(position, you),
    ...bishopNotes(position, you),
    ...seventhRankNotes(position, you),
    ...iqpNotes(position, you),
    ...minorityAttackNotes(position, you),
  ];
}
