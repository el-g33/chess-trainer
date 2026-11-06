// A piece's plan: when the better move puts a piece on the road, where it's
// going next. The plan is what you'd play with a free move or two (Stockfish's
// line as if they passed), so it holds whatever they do.

import type { Chess } from "chessops/chess";
import { attacks } from "chessops/attacks";
import type { Color, NormalMove } from "chessops/types";
import { makeSquare, opposite } from "chessops/util";

import { afterMove } from "./coach";
import { targetsOf } from "./narrate";
import { passMove } from "./strategy";

const NAMES: Record<string, string> = { knight: "knight", bishop: "bishop", rook: "rook", queen: "queen", pawn: "pawn", king: "king" };
const owner = (side: Color, viewer: Color | null) => (viewer === null ? `${side === "white" ? "White" : "Black"}'s` : side === viewer ? "your" : "their");

/** The route of the piece the better move moved: the same piece's next moves
 *  in the plan (other moves of yours in between are fine; it stops before a
 *  take, or if the piece is taken), as squares from where it started, and why
 *  it goes there: "Your knight is on its way to f5, where no pawn can chase it
 *  away." Undefined for a single hop, a piece going back where it was, or a
 *  route with no point worth saying. */
export function pieceRoute(start: Chess, best: NormalMove, pv: NormalMove[], side: Color, viewer: Color | null): { stops: number[]; text: string } | undefined {
  const piece = start.board.get(best.to);
  if (!piece || piece.color !== side || ["pawn", "king"].includes(piece.role)) return undefined;
  let position = passMove(start);
  let at = best.to;
  const stops = [best.from, best.to];
  for (const move of pv) {
    if (move.to === at) break; // (taken, or swapped off)
    if (move.from === at) {
      if (position.board.get(move.to)) break;
      at = move.to;
      stops.push(at);
    }
    position = afterMove(position, move);
  }
  if (stops.length < 3) return undefined;
  const end = stops[stops.length - 1];
  if (stops.slice(0, -1).includes(end)) return undefined; // (round and back: no journey)
  const them = opposite(side);
  const board = position.board;
  const forward = (square: number) => (side === "white" ? square >> 3 : 7 - (square >> 3));
  // a pawn of theirs on a file next door, still behind it, could come and chase it off
  const chased = [...board.pieces(them, "pawn")].some((p) =>
    Math.abs((p & 7) - (end & 7)) === 1 && (them === "white" ? p >> 3 < end >> 3 : p >> 3 > end >> 3));
  const king = board.kingOf(them);
  const zone = king !== undefined ? attacks({ role: "king", color: them }, king, board.occupied) : undefined;
  const reach = (square: number, occupied: typeof board.occupied, own: typeof board.occupied) => [...attacks(piece, square, occupied).diff(own)].length;
  const nearKing = zone ? [...attacks(piece, end, board.occupied).intersect(zone)].length >= 2 : false;
  const hits = targetsOf(position, end).map((square) => `${owner(them, viewer)} ${NAMES[board.get(square)!.role]}`);
  // a rook's file with none of its own pawns on it
  const file = [...board.pieces(side, "pawn")].every((p) => (p & 7) !== (end & 7));
  const openFile = file && [...board.pieces(them, "pawn")].every((p) => (p & 7) !== (end & 7));
  const longDiagonal = (end & 7) === (end >> 3) || (end & 7) + (end >> 3) === 7;
  // how much more the piece does at the end of its road than where it started
  const startBoard = start.board.clone();
  startBoard.take(best.to);
  const before = reach(best.from, startBoard.occupied, startBoard[side]);
  const after = reach(end, board.occupied, board[side]);
  const why = ["knight", "bishop"].includes(piece.role) && forward(end) >= 3 && !chased ? ", where no pawn can chase it away"
    : nearKing ? `, to join the attack on ${owner(them, viewer)} king`
      : hits.length ? `, to attack ${hits[0]}`
        : piece.role === "rook" && openFile ? ", to take the open file"
          : piece.role === "rook" && file ? ", to use the half-open file"
            : piece.role === "bishop" && longDiagonal && after >= 6 ? ", onto the long diagonal"
              : [27, 28, 35, 36].includes(end) ? ", a strong square in the centre"
                : after >= before + 3 ? ", where it's far more active" : "";
  if (!why) return undefined;
  const who = owner(side, viewer);
  return { stops, text: `${who.charAt(0).toUpperCase()}${who.slice(1)} ${NAMES[piece.role]} is on its way to ${makeSquare(end)}${why}.` };
}
