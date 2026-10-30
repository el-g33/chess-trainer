// "What you get": the position at the end of an opening line, explained -
// its shape (pawn chains, the king), its strengths and ideas, and what to
// watch out for. The plans and the verdict come from Stockfish; the shape
// and the targets from looking at the board.

import { attacks, between } from "chessops/attacks";
import { Chess } from "chessops/chess";
import { makeSan } from "chessops/san";
import type { Color, NormalMove, Role } from "chessops/types";
import { opposite } from "chessops/util";

import { PIECE_VALUES } from "./coach";
import { pieceReach } from "./narrate";
import { verdictWords } from "./review";
import type { CoachEngine } from "./strategy";

export type Mark = "good" | "bad" | "plan" | "scope"; // scope: a piece's range (thin lines, small dots)

export interface OutlookPage {
  part: string; // the heading: "Your position", "Your plan", "Watch out"
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

interface Plan {
  move: NormalMove;
  san: string;
  step: string; // "bring your queen out", "castle, getting the king safe"
  reach: { centre: number[]; lines: number[] }; // what the piece covers once there
}

/** Stockfish's top moves for one side, with plain words for each. */
async function plansFor(engine: CoachEngine, position: Chess, side: Color, you: Color, count = 3): Promise<Plan[]> {
  const from = passTo(position, side);
  if (!from) return [];
  const seen = new Set<string>();
  const found: Plan[] = [];
  for (const line of await engine.analyse(from, 1.2, count)) {
    const move = line.pv[0];
    if (!move || seen.has(`${move.from}-${move.to}`)) continue;
    seen.add(`${move.from}-${move.to}`);
    const after = from.clone();
    after.play(move);
    found.push({ move, san: `${side === "black" ? "..." : ""}${makeSan(from, move)}`, step: stepWords(from, move, you), reach: pieceReach(after, move.to) });
  }
  return found;
}

/** Why their move matters, when it's clear: it blocks the piece you have
 *  aimed at their king, or it attacks one of your pieces. ("" if neither.) */
function watchReason(position: Chess, move: NormalMove, you: Color, aim: { from: number; to: number; role: Role } | null): string {
  if (aim && (between(aim.from, aim.to).has(move.to) || move.to === aim.to)) return `, to block your ${NAMES[aim.role]}`;
  const theirs = passTo(position, opposite(you));
  const piece = theirs?.board.get(move.from);
  if (!theirs || !piece) return "";
  const occupied = theirs.board.occupied.without(move.from).with(move.to);
  const hit = [...attacks(piece, move.to, occupied)]
    .map((square) => theirs.board.get(square))
    .filter((target) => target && target.color === you && target.role !== "pawn" && PIECE_VALUES[target.role] > PIECE_VALUES[piece.role] - 1)
    .sort((a, b) => PIECE_VALUES[b!.role] - PIECE_VALUES[a!.role])[0];
  return hit ? `, attacking your ${NAMES[hit.role]}` : "";
}

/** A move as a plain step, from your side: "push your c-pawn", "bring their knight out". */
function stepWords(position: Chess, move: NormalMove, you: Color): string {
  const piece = position.board.get(move.from);
  if (!piece) return "make a move";
  const whose = piece.color === you ? "your" : "their";
  const other = piece.color === you ? "their" : "your";
  const victim = position.board.get(move.to);
  if (piece.role === "king" && (Math.abs(file(move.to) - file(move.from)) > 1 || victim?.color === piece.color)) return "castle, getting the king safe";
  if (victim && victim.color !== piece.color) return `take ${other} ${NAMES[victim.role]}`;
  if (piece.role === "pawn") return `push ${whose} ${"abcdefgh"[file(move.from)]}-pawn`;
  const home = rank(move.from) === (piece.color === "white" ? 0 : 7);
  return home ? `bring ${whose} ${NAMES[piece.role]} out` : `move ${whose} ${NAMES[piece.role]} to a better square`;
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

/** The position at the end of a line, one idea a page, each with its own
 *  picture and one sentence: the verdict, your pawns, your king, your next
 *  step (and the piece's range once it's there), an attack, a knight square,
 *  then their idea and anything left unguarded. Only the ideas that apply. */
export async function whatYouGet(engine: CoachEngine, position: Chess, you: Color): Promise<OutlookPage[]> {
  const them = opposite(you);
  const [line] = await engine.analyse(position, 1.5, 1);
  const score = line?.score ?? { cp: 0 };
  const yours = await plansFor(engine, position, you, you);
  const theirs = await plansFor(engine, position, them, you);
  const pages: OutlookPage[] = [];
  const page = (part: string, text: string, arrows: OutlookPage["arrows"] = [], squares: OutlookPage["squares"] = []) =>
    pages.push({ part, text, arrows, squares });

  // Your position: the verdict, the pawns, the king
  const verdict = verdictWords(score); // "the position is roughly equal" / "White is slightly better"
  page("Your position", verdict.startsWith("the position") ? `This position${verdict.slice("the position".length)}.` : `${verdict} here.`);
  const chain = pawnChains(position, you)[0];
  if (chain && chain.length >= 3) page("Your position", "Your pawns form a strong chain, each one guarding the next.", [], chain.map((s) => [s, "good"]));
  const king = position.board.kingOf(you);
  const homeRank = you === "white" ? 0 : 7;
  const castled = king !== undefined && rank(king) === homeRank && (file(king) >= 6 || file(king) <= 2);
  const next = yours[0];
  const castlesNext = next?.step.startsWith("castle");
  if (castled && king !== undefined) page("Your position", "Your king is safely castled.", [], [[king, "good"]]);
  else if (!castlesNext) page("Your position", "Castle soon, to get your king safe.");

  // Your plan: the next step (its arrow, then the piece's range from there), an attack, a knight square
  if (next) {
    page("Your plan", `A good next step is to ${next.step}.`,
      [[next.move.from, next.move.to, "plan"], ...[...next.reach.lines, ...next.reach.centre].map((end): [number, number, Mark] => [next.move.to, end, "scope"])]);
  }
  const aim = aimAtKing(position, you);
  if (aim) page("Your plan", `Your ${NAMES[aim.role]} is aimed at their king.`, [[aim.from, aim.to, "good"]]);
  const post = outpost(position, you);
  if (post !== null) page("Your plan", "There's a safe square for a knight, where no pawn can chase it away.", [], [[post, "good"]]);

  // Their answer: their best idea, said as what it does to your plan (a real
  // threat only when it attacks something)
  const answer = theirs[0];
  if (answer) {
    const reason = watchReason(position, answer.move, you, aim);
    const text = reason.startsWith(", to block")
      ? `To stop that, they'll likely ${answer.step}${reason.replace(", to block", ", blocking")}.`
      : reason
        ? `Watch out: they could ${answer.step}${reason}.`
        : `Their plan is to ${answer.step}.`;
    page("Their answer", text, [[answer.move.from, answer.move.to, "bad"]]);
  }

  // Weak spots, yours and theirs: pawns with no pawn beside them, doubled
  // pawns, a piece nothing guards - the patterns to learn to see
  const weak = (side: Color) => weakSpots(position, side);
  const mine = weak(you);
  const their = weak(them);
  for (const spot of mine.slice(0, 2)) page("Weak spots", `Your weak spot: ${spot.text}.`, [], spot.squares.map((sq): [number, Mark] => [sq, "bad"]));
  for (const spot of their.slice(0, 2)) page("Weak spots", `Their weak spot: ${spot.text}. A target for later.`, [], spot.squares.map((sq): [number, Mark] => [sq, "good"]));
  if (!mine.length && !their.length) page("Weak spots", "No weak spots on either side yet: a healthy position for both.");
  return pages;
}

/** A side's weak spots, plainly: an isolated pawn, doubled pawns, a piece
 *  nothing guards. (Their own words, from the owner's side: "your"/"their"
 *  is added by the caller.) */
function weakSpots(position: Chess, side: Color): { text: string; squares: number[] }[] {
  const spots: { text: string; squares: number[] }[] = [];
  const pawns = [...position.board.pieces(side, "pawn")];
  const onFile = (f: number) => pawns.filter((sq) => file(sq) === f);
  for (let f = 0; f < 8; f++) {
    const here = onFile(f);
    if (here.length >= 2) spots.push({ text: `two pawns on the ${"abcdefgh"[f]}-file, one in the other's way`, squares: here });
    else if (here.length === 1 && !onFile(f - 1).length && !onFile(f + 1).length) {
      spots.push({ text: `the ${"abcdefgh"[f]}-pawn has no pawn beside it, so only pieces can guard it`, squares: here });
    }
  }
  const occupied = position.board.occupied;
  for (const square of position.board[side]) {
    const role = position.board.get(square)!.role;
    if (role === "pawn" || role === "king") continue;
    if (rank(square) === (side === "white" ? 0 : 7)) continue; // (still at home: not a weakness yet)
    if (position.kingAttackers(square, side, occupied).isEmpty()) spots.push({ text: `nothing guards the ${NAMES[role]}`, squares: [square] });
  }
  return spots;
}
