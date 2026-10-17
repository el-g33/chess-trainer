// One game of chess: the moves played so far and every position along the
// way, plus how the game ended. The rules come from chessops.
import { Chess, normalizeMove } from "chessops/chess";
import { makeFen, parseFen, INITIAL_FEN } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Color, NormalMove } from "chessops/types";
import { makeSquare } from "chessops/util";

export interface PlayedMove {
  move: NormalMove;
  san: string; // e.g. "Nf3", "exd5", "O-O", "Qh7#"
  from: string; // e.g. "g1"
  to: string;
}

export interface Outcome {
  winner?: Color; // undefined for a draw
  reason: string; // "checkmate", "stalemate", "threefold repetition", ...
}

export class Game {
  readonly startFen: string;
  readonly moves: PlayedMove[] = [];
  private positions: Chess[];

  constructor(fen: string = INITIAL_FEN) {
    this.startFen = fen;
    this.positions = [Chess.fromSetup(parseFen(fen).unwrap()).unwrap()];
  }

  /** The position after `ply` moves (0 = the start). */
  positionAt(ply: number): Chess {
    return this.positions[Math.max(0, Math.min(ply, this.moves.length))].clone();
  }

  get position(): Chess {
    return this.positionAt(this.moves.length);
  }

  get length(): number {
    return this.moves.length;
  }

  fenAt(ply: number): string {
    return makeFen(this.positionAt(ply).toSetup());
  }

  get fen(): string {
    return this.fenAt(this.moves.length);
  }

  /** Plays a move (which must be legal) and returns how it was written.
   *  Castling may be given as king-two-squares (e1g1, as Stockfish writes
   *  it) or king-onto-rook (e1h1, as chessops stores it). */
  play(given: NormalMove): PlayedMove {
    const position = this.position;
    const move = normalizeMove(position, given) as NormalMove;
    // The squares shown as "last move": for castling, the king's two squares
    const san = makeSan(position, move);
    const from = makeSquare(given.from);
    const to = san.startsWith("O-O") ? (san.startsWith("O-O-O") ? "c" : "g") + from[1] : makeSquare(given.to);
    const played = { move, san, from, to };
    position.play(move);
    this.positions.push(position);
    this.moves.push(played);
    return played;
  }

  /** Takes back the last move. */
  undo() {
    if (!this.moves.length) return;
    this.moves.pop();
    this.positions.pop();
  }

  /** Who moved at the given ply (1 = the first move of the game). */
  moverOf(ply: number): Color {
    const first = this.positions[0].turn;
    return ply % 2 === 1 ? first : first === "white" ? "black" : "white";
  }

  /** How the game ended, or undefined while it goes on. Draws by repetition
   *  and the fifty-move rule count straight away, as in the desktop app. */
  outcome(): Outcome | undefined {
    const position = this.position;
    if (position.isCheckmate()) return { winner: position.turn === "white" ? "black" : "white", reason: "checkmate" };
    if (position.isStalemate()) return { reason: "stalemate" };
    if (position.isInsufficientMaterial()) return { reason: "insufficient material" };
    if (position.halfmoves >= 100) return { reason: "fifty-move rule" };
    if (this.repetitions() >= 3) return { reason: "threefold repetition" };
    return undefined;
  }

  /** How many times the current position has appeared (same pieces, side to
   *  move, castling rights and en passant). */
  private repetitions(): number {
    const key = (p: Chess) => makeFen(p.toSetup()).split(" ").slice(0, 4).join(" ");
    const now = key(this.positions[this.positions.length - 1]);
    return this.positions.filter((p) => key(p) === now).length;
  }
}
