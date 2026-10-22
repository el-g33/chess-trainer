// "What you get": the position at the end of an opening line, explained -
// its shape (pawn chains, the king), its strengths and ideas, and what to
// watch out for. The plans and the verdict come from Stockfish; the shape
// and the targets from looking at the board.

import { attacks } from "chessops/attacks";
import { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, opposite } from "chessops/util";

import { PIECE_VALUES } from "./coach";
import { formatScore, verdictWords } from "./review";
import type { CoachEngine } from "./strategy";

export type Mark = "good" | "bad" | "plan";

export interface OutlookPage {
  text: string;
  arrows: [from: number, to: number, mark: Mark][];
  squares: [square: number, mark: Mark][];
}

const NAMES: Record<Role, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };
const file = (square: number) => square & 7;
const rank = (square: number) => square >> 3;
const near = (a: number, b: number) => Math.abs(file(a) - file(b)) <= 1 && Math.abs(rank(a) - rank(b)) <= 1;

/** The pawns of one colour that stand diagonally next to each other, biggest group first. */
export function pawnChains(position: Chess, colour: Color): number[][] {
  const pawns = [...position.board.pieces(colour, "pawn")];
  const seen = new Set<number>();
  const chains: number[][] = [];
  for (const start of pawns) {
    if (seen.has(start)) continue;
    const chain: number[] = [];
    const todo = [start];
    seen.add(start);
    while (todo.length) {
      const square = todo.pop()!;
      chain.push(square);
      for (const other of pawns) {
        if (!seen.has(other) && Math.abs(file(other) - file(square)) === 1 && Math.abs(rank(other) - rank(square)) === 1) {
          seen.add(other);
          todo.push(other);
        }
      }
    }
    if (chain.length >= 2) chains.push(chain.sort((a, b) => file(a) - file(b) || rank(a) - rank(b)));
  }
  return chains.sort((a, b) => b.length - a.length);
}

/** The chain the pawn on `square` belongs to (empty if it stands alone). */
export function chainOf(position: Chess, square: number): number[] {
  const piece = position.board.get(square);
  if (piece?.role !== "pawn") return [];
  return pawnChains(position, piece.color).find((chain) => chain.includes(square)) ?? [];
}

const list = (words: string[]) => words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
const andList = (words: string[]) => words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/** The same position with `side` to move, as if the other side passed. */
function passTo(position: Chess, side: Color): Chess | null {
  if (position.turn === side) return position;
  if (position.isCheck()) return null;
  const setup = position.toSetup();
  setup.turn = side;
  setup.epSquare = undefined;
  const result = Chess.fromSetup(setup);
  return result.isOk ? result.value : null;
}

/** Stockfish's top moves for one side, with their names ("...a5" for Black). */
async function plansFor(engine: CoachEngine, position: Chess, side: Color, count = 3): Promise<{ move: NormalMove; san: string }[]> {
  const from = passTo(position, side);
  if (!from) return [];
  const seen = new Set<string>();
  const found: { move: NormalMove; san: string }[] = [];
  for (const line of await engine.analyse(from, 1.2, count)) {
    const move = line.pv[0];
    if (!move || seen.has(`${move.from}-${move.to}`)) continue;
    seen.add(`${move.from}-${move.to}`);
    found.push({ move, san: `${side === "black" ? "..." : ""}${makeSan(from, move)}` });
  }
  return found;
}

/** A bishop or queen of yours that points at a square next to their king. */
function aimAtKing(position: Chess, you: Color): { from: number; to: number; role: Role } | null {
  const king = position.board.kingOf(opposite(you));
  if (king === undefined) return null;
  for (const role of ["bishop", "queen"] as Role[]) {
    for (const from of position.board.pieces(you, role)) {
      const reach = attacks({ role, color: you }, from, position.board.occupied);
      const targets = [...reach].filter((s) => s !== king && near(s, king));
      if (targets.length) return { from, to: targets[0], role };
    }
  }
  return null;
}

/** A square in their half where your knight can't be chased away by a pawn,
 *  backed up by one of your pawns. */
function outpost(position: Chess, you: Color): number | null {
  const them = opposite(you);
  const theirPawns = [...position.board.pieces(them, "pawn")];
  const forward = you === "white" ? 1 : -1;
  const ranks = you === "white" ? [4, 5] : [3, 2];
  const candidates: number[] = [];
  for (const r of ranks) {
    for (let f = 1; f <= 6; f++) {
      const square = r * 8 + f;
      const occupant = position.board.get(square);
      if (occupant && occupant.color === you && occupant.role !== "knight") continue;
      if (occupant && occupant.color === them) continue;
      // backed up by a pawn of yours
      const backers = [square - forward * 8 - 1, square - forward * 8 + 1].filter((s) => s >= 0 && s < 64 && Math.abs(file(s) - f) === 1);
      if (!backers.some((s) => position.board.get(s)?.role === "pawn" && position.board.get(s)?.color === you)) continue;
      // no pawn of theirs on the next files that could still come to attack it
      const chased = theirPawns.some((p) => Math.abs(file(p) - f) === 1 && (you === "white" ? rank(p) > r : rank(p) < r));
      if (!chased) candidates.push(square);
    }
  }
  // the most central first
  candidates.sort((a, b) => Math.abs(3.5 - file(a)) - Math.abs(3.5 - file(b)));
  return candidates[0] ?? null;
}

/** A piece or pawn of yours that nothing defends, which one of their moves
 *  would attack (or already attacks). */
function looseTarget(position: Chess, you: Color): { square: number; role: Role; by?: string } | null {
  const them = opposite(you);
  const theirs = passTo(position, them);
  if (!theirs) return null;
  const occupied = position.board.occupied;
  const loose: number[] = [];
  for (const square of position.board[you]) {
    const piece = position.board.get(square)!;
    if (piece.role === "king") continue;
    if (position.kingAttackers(square, you, occupied).nonEmpty()) continue; // defended
    loose.push(square);
  }
  loose.sort((a, b) => PIECE_VALUES[position.board.get(b)!.role] - PIECE_VALUES[position.board.get(a)!.role]);
  for (const square of loose) {
    const role = position.board.get(square)!.role;
    if (position.kingAttackers(square, them, occupied).nonEmpty()) return { square, role };
    for (const [from, dests] of theirs.allDests()) {
      const piece = theirs.board.get(from)!;
      if (piece.role === "king") continue;
      for (const to of dests) {
        if (to === square) continue;
        // only moves that don't just lose the piece: to a square you don't
        // cover, or a pawn backed up by their own pieces
        const after = occupied.without(from).with(to);
        const covered = position.kingAttackers(to, you, after).nonEmpty();
        const backed = piece.role === "pawn" && position.kingAttackers(to, them, after).nonEmpty();
        if (covered && !backed) continue;
        if (attacks(piece, to, after).has(square)) {
          const move: NormalMove = { from, to };
          return { square, role, by: `${them === "black" ? "..." : ""}${makeSan(theirs, move)}` };
        }
      }
    }
  }
  return null;
}

/** The three pages: the shape, strengths and ideas, and what to watch out for. */
export async function whatYouGet(engine: CoachEngine, position: Chess, you: Color): Promise<OutlookPage[]> {
  const them = opposite(you);
  const [line] = await engine.analyse(position, 1.5, 1);
  const score = line?.score ?? { cp: 0 };
  const yours = await plansFor(engine, position, you);
  const theirs = await plansFor(engine, position, them);

  // 1. The shape: the pawn chain, the king
  const chain = pawnChains(position, you)[0];
  const king = position.board.kingOf(you);
  const homeRank = you === "white" ? 0 : 7;
  const castled = king !== undefined && rank(king) === homeRank && (file(king) >= 6 || file(king) <= 2);
  const shape: string[] = [`Stockfish says ${verdictWords(score)} (${formatScore(score)}).`];
  if (chain && chain.length >= 3) shape.push(`Your pawns form a chain: ${andList(chain.map(makeSquare))}.`);
  shape.push(castled ? "Your king is safely castled." : "Castling is next, to get your king safe.");
  const shapePage: OutlookPage = { text: shape.join(" "), arrows: [], squares: chain && chain.length >= 3 ? chain.map((s) => [s, "good"]) : [] };

  // 2. Strengths and ideas
  const strengths: string[] = [];
  const strongArrows: OutlookPage["arrows"] = [];
  const strongSquares: OutlookPage["squares"] = [];
  const aim = aimAtKing(position, you);
  if (aim) {
    strengths.push(`Your ${NAMES[aim.role]} aims at ${makeSquare(aim.to)}, next to their king.`);
    strongArrows.push([aim.from, aim.to, "good"]);
  }
  const post = outpost(position, you);
  if (post !== null && strengths.length < 2) {
    strengths.push(`${makeSquare(post)} is a safe square for a knight: no pawn can chase it away.`);
    strongSquares.push([post, "good"]);
  }
  if (yours.length) {
    strengths.push(`Stockfish's plans for you: ${list(yours.map((p) => p.san))}.`);
    for (const plan of yours) strongArrows.push([plan.move.from, plan.move.to, "plan"]);
  }
  const strengthPage: OutlookPage = { text: `Strengths: ${strengths.join(" ") || "a solid position with no weaknesses."}`, arrows: strongArrows, squares: strongSquares };

  // 3. Watch out
  const watch: string[] = [];
  const watchArrows: OutlookPage["arrows"] = theirs.map((p) => [p.move.from, p.move.to, "bad"]);
  const watchSquares: OutlookPage["squares"] = [];
  if (theirs.length) watch.push(`They'd like ${list(theirs.map((p) => p.san))}.`);
  const target = looseTarget(position, you);
  if (target) {
    watch.push(`Nothing guards your ${NAMES[target.role]} on ${makeSquare(target.square)}${target.by ? `, and ${target.by} would attack it` : ""}.`);
    watchSquares.push([target.square, "bad"]);
  }
  const watchPage: OutlookPage = { text: `Watch out: ${watch.join(" ") || "nothing serious yet."}`, arrows: watchArrows, squares: watchSquares };

  return [shapePage, strengthPage, watchPage];
}
