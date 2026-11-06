// Tactics the coach names in plain words: who really comes out ahead when
// pieces are taken on a square (every capture played out, cheapest piece
// first, so a trade is never called a loss), a piece left free to take, a
// fork, and a pin that wins a piece.

import { attacks } from "chessops/attacks";
import { normalizeMove, type Chess } from "chessops/chess";
import type { SquareSet } from "chessops/squareSet";
import type { Color, NormalMove, Role } from "chessops/types";
import { makeSquare, opposite, parseUci } from "chessops/util";

import { afterMove } from "./coach";

const VALUE: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 100 };
const NAMES: Record<Role, string> = { pawn: "pawn", knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", king: "king" };

/** The cheapest piece of `side` that attacks `target` with these squares occupied. */
function cheapest(position: Chess, side: Color, target: number, occupied: SquareSet): number | undefined {
  let best: number | undefined;
  for (const square of position.board[side].intersect(occupied)) {
    const piece = position.board.get(square)!;
    if (!attacks(piece, square, occupied).has(target)) continue;
    if (best === undefined || VALUE[piece.role] < VALUE[position.board.get(best)!.role]) best = square;
  }
  return best;
}

/** What the side making `move` (a capture, or a move to a square they can
 *  take on) gains, in pawns, once every capture on that square is played out
 *  with the cheapest piece first and either side free to stop when it suits
 *  them. 0 for a fair trade; negative when the move loses material there. */
export function exchangeGain(position: Chess, move: NormalMove): number {
  const target = move.to;
  const mover = position.board.get(move.from);
  if (!mover) return 0;
  const victim = position.board.get(target);
  const gain: number[] = [victim ? VALUE[victim.role] : 0];
  let occupied = position.board.occupied.without(move.from);
  let onSquare = VALUE[mover.role];
  let side = opposite(mover.color);
  for (let d = 1; ; d++) {
    const from = cheapest(position, side, target, occupied);
    if (from === undefined) break;
    const taker = position.board.get(from)!;
    // (the king can only take when nothing can take it back)
    if (taker.role === "king" && cheapest(position, opposite(side), target, occupied.without(from)) !== undefined) break;
    gain[d] = onSquare - gain[d - 1];
    onSquare = VALUE[taker.role];
    occupied = occupied.without(from);
    side = opposite(side);
  }
  for (let d = gain.length - 1; d > 0; d--) gain[d - 1] = -Math.max(-gain[d - 1], gain[d]);
  return gain[0];
}

/** What a reply really wins from the mover: the reply's gain on its square,
 *  less what the move just took there (taking back is only a trade). */
export function replyWins(before: Chess, played: NormalMove, after: Chess, reply: NormalMove): number {
  const took = before.board.get(played.to);
  const gain = exchangeGain(after, reply);
  return reply.to === played.to && took ? gain - VALUE[took.role] : gain;
}

export interface FreeTake {
  victim: Role;
  square: number; // where it stands
  taker: Role;
  free: boolean; // nothing guards it (or the guards can't take back fairly)
}

/** The better move takes a piece for nothing (or wins material by taking):
 *  what it takes, where, and with what. Undefined when it's only a trade. */
export function freeTake(before: Chess, best: NormalMove): FreeTake | undefined {
  const victim = before.board.get(best.to);
  const taker = before.board.get(best.from);
  if (!victim || !taker || victim.color === taker.color) return undefined;
  const gain = exchangeGain(before, best);
  if (gain < 1) return undefined;
  return { victim: victim.role, square: best.to, taker: taker.role, free: gain >= VALUE[victim.role] };
}

export interface Fork {
  piece: Role;
  to: number;
  check: boolean;
  hits: { role: Role; square: number }[]; // what else it attacks, most valuable first
}

/** The better move attacks two things at once: the king (a check) or a piece
 *  it can win (worth more than the attacker, or left unguarded). */
export function forkOf(before: Chess, best: NormalMove): Fork | undefined {
  const piece = before.board.get(best.from);
  if (!piece) return undefined;
  const after = afterMove(before, best);
  const them = opposite(piece.color);
  const moved = after.board.get(best.to);
  if (!moved) return undefined;
  const check = after.isCheck();
  const hits: { role: Role; square: number }[] = [];
  for (const square of attacks(moved, best.to, after.board.occupied).intersect(after.board[them])) {
    const target = after.board.get(square)!;
    if (target.role === "king") continue;
    // (it must be worth taking: more than the attacker, or nothing guarding it)
    const take = { from: best.to, to: square };
    if (VALUE[target.role] > VALUE[moved.role] || exchangeGain(after, take) >= VALUE[target.role]) hits.push({ role: target.role, square });
  }
  hits.sort((a, b) => VALUE[b.role] - VALUE[a.role]);
  if ((check ? 1 : 0) + hits.length < 2) return undefined;
  // (the forking piece mustn't just be taken: taking it has to cost them)
  if (!check) {
    const taker = cheapest(after, them, best.to, after.board.occupied);
    if (taker !== undefined && exchangeGain(after, { from: taker, to: best.to }) > 0) return undefined;
  }
  return { piece: moved.role, to: best.to, check, hits };
}

/** The reply pins a piece to the king and attacks it: the piece that's lost. */
export function pinWins(after: Chess, reply: NormalMove): { role: Role; square: number } | undefined {
  const then = afterMove(after, reply);
  const us = then.turn;
  const king = then.board.kingOf(us);
  const attacker = then.board.get(reply.to);
  if (king === undefined || !attacker) return undefined;
  const pinned = then.ctx().blockers.intersect(then.board[us]);
  for (const square of attacks(attacker, reply.to, then.board.occupied).intersect(pinned)) {
    const piece = then.board.get(square)!;
    if (VALUE[piece.role] > VALUE[attacker.role] && piece.role !== "pawn") return { role: piece.role, square };
  }
  return undefined;
}

export interface Taken { role: Role; square: number; ply: number }

export interface LineOutcome {
  net: number; // material `side` comes out ahead by, in pawns, once things settle
  lost: Taken[]; // side's pieces taken on the way
  won: Taken[]; // the other side's pieces taken
  moves: NormalMove[]; // the moves played (up to where it settles)
  mate: boolean; // the line ends in checkmate
  promoted: { side: Color; square: number }[]; // pawns that promote on the way
}

/** Stockfish's expected line from `position`, played out: what `side` wins
 *  or loses on it. Counted only up to a quiet moment (the next move in the
 *  line isn't a capture), so a trade cut off half-way isn't read as a loss. */
export function playLine(position: Chess, line: string | undefined, side: Color, max = 10): LineOutcome | undefined {
  if (!line) return undefined;
  const walk = position.clone();
  const moves: NormalMove[] = [];
  const lost: LineOutcome["lost"] = [];
  const won: LineOutcome["won"] = [];
  let net = 0;
  let settled: LineOutcome | undefined;
  let tookLast = false;
  const promoted: LineOutcome["promoted"] = [];
  const isCapture = (move: NormalMove) => {
    const piece = walk.board.get(move.from);
    const target = walk.board.get(move.to);
    return (!!target && target.color !== piece?.color) || (piece?.role === "pawn" && (move.from & 7) !== (move.to & 7));
  };
  const parsed = line.split(" ").slice(0, max).map((uci) => parseUci(uci));
  for (let i = 0; i <= parsed.length; i++) {
    const next = parsed[i] && "from" in parsed[i]! ? (normalizeMove(walk, parsed[i] as NormalMove) as NormalMove) : undefined;
    const legal = next && walk.isLegal(next);
    // (where the line stops right after a capture, the taking back it cut off isn't known: not settled)
    const lastTook = moves.length > 0 && tookLast;
    if (legal ? !isCapture(next) : !lastTook || walk.isCheckmate()) settled = { net, lost: [...lost], won: [...won], moves: [...moves], mate: walk.isCheckmate(), promoted: [...promoted] };
    if (!legal) break;
    const piece = walk.board.get(next.from)!;
    const target = walk.board.get(next.to);
    const taken: Taken | undefined = target && target.color !== piece.color ? { role: target.role, square: next.to, ply: i }
      : piece.role === "pawn" && (next.from & 7) !== (next.to & 7) ? { role: "pawn", square: next.to, ply: i } : undefined;
    const sign = piece.color === side ? 1 : -1;
    if (taken) {
      net += sign * VALUE[taken.role];
      (sign > 0 ? won : lost).push(taken);
    }
    if (next.promotion) {
      net += sign * (VALUE[next.promotion] - 1);
      promoted.push({ side: piece.color, square: next.to });
    }
    tookLast = !!taken;
    walk.play(next);
    moves.push(next);
  }
  return settled;
}

/** What a line really wins, once trades are set aside: the most valuable
 *  kind of piece taken more often than given (and paid for by the net gain),
 *  how many pawns, or "the exchange" (a rook for a knight or bishop). */
export interface Won { role?: Role; square?: number; pawns?: number; exchange?: boolean; piece?: boolean; lots?: boolean }

export function materialWon(gainedAll: Taken[], givenAll: Taken[], net: number): Won {
  // (a piece taken and straight away taken back on the same square, for one worth the same, is a trade: set aside)
  const traded = new Set<Taken>();
  for (const a of gainedAll) {
    const b = givenAll.find((t) => !traded.has(t) && t.square === a.square && Math.abs(t.ply - a.ply) === 1 && VALUE[t.role] === VALUE[a.role]);
    if (b) traded.add(a).add(b);
  }
  const gained = gainedAll.filter((t) => !traded.has(t));
  const given = givenAll.filter((t) => !traded.has(t));
  // (by worth: a bishop for a knight is even)
  const surplus = (role: Role) => gained.filter((t) => VALUE[t.role] === VALUE[role]).length - given.filter((t) => VALUE[t.role] === VALUE[role]).length;
  if (surplus("rook") > 0 && surplus("knight") < 0 && net >= 1.5 && net <= 3) return { exchange: true };
  const candidates = gained.filter((t) => t.role !== "pawn" && t.role !== "king" && surplus(t.role) > 0 && VALUE[t.role] <= net + 2)
    .sort((a, b) => VALUE[b.role] - VALUE[a.role] || a.ply - b.ply);
  if (candidates[0]) return { role: candidates[0].role, square: candidates[0].square };
  if (surplus("pawn") > 0 && net <= surplus("pawn") + 0.5) return { pawns: Math.max(1, Math.round(net)) };
  if (net >= 2.5 && net <= 4) return { piece: true };
  return net >= 5 ? { lots: true } : {};
}

/** A move as a short phrase, with whose it is: "your knight to e5", "their
 *  bishop taking on f7", "castling". */
export function movePhrase(position: Chess, move: NormalMove, whose: string): string {
  const piece = position.board.get(move.from);
  if (!piece) return "";
  const target = position.board.get(move.to);
  if (piece.role === "king" && (target?.role === "rook" && target.color === piece.color || Math.abs(move.to - move.from) === 2)) return "castling";
  const takes = (target && target.color !== piece.color) || (piece.role === "pawn" && (move.from & 7) !== (move.to & 7));
  return `${whose} ${NAMES[piece.role]} ${takes ? "taking on" : "to"} ${makeSquare(move.to)}`;
}

/** "the bishop on d7" / "the c4 pawn". */
export function pieceAt(role: Role, square: number): string {
  return role === "pawn" ? `${makeSquare(square)} pawn` : `${NAMES[role]} on ${makeSquare(square)}`;
}

export { NAMES as ROLE_NAMES };
