// Stockfish scores positions in the background, one at a time, so every
// move of the game can be rated - like the desktop app's eval thread. The
// list of wanted positions can change at any time (the first ones go first).
//
// A second, longer look: the browser's Stockfish is the light version and
// thinks briefly, so it can miss a deep idea (e.g. a mating sacrifice) and
// call a good move a mistake. Positions behind a harsh rating are therefore
// analysed again for longer before the rating is final (requestDeep).
import { normalizeMove, type Chess } from "chessops/chess";
import type { NormalMove } from "chessops/types";
import { makeSquare, makeUci, parseUci } from "chessops/util";

import type { Score } from "./coach";
import { Engine, type AnalysisLine } from "./engine";
import { fenOf, isDrawnPosition, winningChance, type Evaluation } from "./review";

// Taking an offered piece is "poisoned" when it leaves the taker this much
// worse (in winning chance) than their best reply
const POISON_DROP = 15;

// How long Stockfish thinks about each position (as the desktop's EVAL_THINK_TIME)
const THINK_TIME = 0.4;
// ...and for the second look at positions behind a Mistake, Blunder or Miss
const DEEP_TIME = 3.0;

export class Analyser {
  readonly evals = new Map<string, Evaluation>();
  private readonly deepDone = new Set<string>();
  private engine?: Engine;
  private wanted: Chess[] = [];
  private deepWanted: Chess[] = [];
  private deepMoves: DeepMove[] = [];
  private readonly poisoned = new Set<string>(); // "fen uci" of moves offering a piece that can't be taken
  private running = false;

  /** Called after each position Stockfish finishes. */
  constructor(private onUpdate: () => void) {}

  /** Positions to score, most urgent first. Replaces the previous list. */
  request(positions: Chess[]) {
    this.wanted = positions.filter((p) => !p.isEnd() && !isDrawnPosition(p));
    if (!this.running) void this.run();
  }

  /** Positions to look at again, for longer (after the normal ones). */
  requestDeep(positions: Chess[]) {
    this.deepWanted = positions.filter((p) => !p.isEnd() && !isDrawnPosition(p) && !this.deepDone.has(fenOf(p)));
    if (!this.running) void this.run();
  }

  /** Moves to look at again, the fair way: the best move and the played
   *  move scored in the same search from the position before, so both are
   *  judged at the same depth. (Two separate searches - before and after -
   *  can disagree enough to turn a good move into an "inaccuracy".) */
  requestDeepMoves(moves: DeepMove[]) {
    this.deepMoves = moves.filter((m) => !m.after.isEnd() && !isDrawnPosition(m.after) && !this.deepDone.has(fenOf(m.after)));
    if (!this.running) void this.run();
  }

  /** Does this move offer a piece the opponent can't safely take? */
  isPoisoned(before: Chess, move: NormalMove): boolean {
    return this.poisoned.has(`${fenOf(before)} ${makeUci(move)}`);
  }

  /** Has this position had its second, longer look? */
  isDeep(position: Chess): boolean {
    return this.deepDone.has(fenOf(position)) || position.isEnd() || isDrawnPosition(position);
  }

  /** How many of the wanted positions are scored. */
  progress(): { done: number; total: number } {
    const fens = new Set(this.wanted.map(fenOf));
    let done = 0;
    for (const fen of fens) if (this.evals.has(fen)) done++;
    const deep = new Set(this.deepWanted.map(fenOf));
    for (const fen of deep) if (this.deepDone.has(fen)) done++;
    return { done, total: fens.size + deep.size };
  }

  private async run() {
    this.running = true;
    try {
      for (;;) {
        this.engine ??= new Engine();
        const position = this.wanted.find((p) => !this.evals.has(fenOf(p)));
        if (position) {
          const fen = fenOf(position);
          const lines = await this.engine.analyse(fen, THINK_TIME * 1000, 2);
          if (!this.evals.has(fen) || !this.deepDone.has(fen)) this.evals.set(fen, toEvaluation(position, lines));
          this.onUpdate();
          continue;
        }
        const pending = this.deepMoves.find((m) => !this.deepDone.has(fenOf(m.after)));
        if (pending) {
          const beforeFen = fenOf(pending.before);
          const afterFen = fenOf(pending.after);
          if (!this.deepDone.has(beforeFen)) {
            const lines = await this.engine.analyse(beforeFen, DEEP_TIME * 1000, 2);
            this.evals.set(beforeFen, toEvaluation(pending.before, lines));
            this.deepDone.add(beforeFen);
          }
          // the played move, searched from the same position for the same time
          const [played] = await this.engine.analyse(beforeFen, DEEP_TIME * 1000, 1, [standardUci(pending.before, pending.move)]);
          const previous = this.evals.get(afterFen);
          if (played) this.evals.set(afterFen, { ...(previous ?? { best: undefined }), score: lineScore(pending.before, played) });
          // A piece offered up: what happens if they take it?
          if (pending.offered !== undefined && previous) {
            const takes: string[] = [];
            for (const [from, dests] of pending.after.allDests()) {
              if (!dests.has(pending.offered)) continue;
              const pawn = pending.after.board.get(from)?.role === "pawn";
              const last = (pending.offered >> 3) === 0 || (pending.offered >> 3) === 7;
              takes.push(makeSquare(from) + makeSquare(pending.offered) + (pawn && last ? "q" : ""));
            }
            if (takes.length) {
              const [taking] = await this.engine.analyse(afterFen, DEEP_TIME * 1000, 1, takes);
              const taker = pending.after.turn;
              const best = winningChance(previous.score, taker);
              if (taking && best - winningChance(lineScore(pending.after, taking), taker) >= POISON_DROP) {
                this.poisoned.add(`${beforeFen} ${makeUci(pending.move)}`);
              }
            }
          }
          this.deepDone.add(afterFen);
          this.onUpdate();
          continue;
        }
        const deep = this.deepWanted.find((p) => !this.deepDone.has(fenOf(p)));
        if (!deep) break;
        const fen = fenOf(deep);
        const lines = await this.engine.analyse(fen, DEEP_TIME * 1000, 2);
        this.evals.set(fen, toEvaluation(deep, lines));
        this.deepDone.add(fen);
        this.onUpdate();
      }
    } finally {
      this.running = false;
    }
  }
}

/** A move to look at again: the position before, the move, the position
 *  after, and the square of a piece it offers up (if any). */
export interface DeepMove {
  before: Chess;
  move: NormalMove;
  after: Chess;
  offered?: number;
}

/** A move as Stockfish writes it (castling as the king's two-square step). */
function standardUci(position: Chess, move: NormalMove): string {
  const piece = position.board.get(move.from);
  const target = position.board.get(move.to);
  if (piece?.role === "king" && target?.role === "rook" && target.color === piece.color) {
    const file = move.to > move.from ? 6 : 2;
    return makeSquare(move.from) + makeSquare((move.from & ~7) + file);
  }
  return makeUci(move);
}

/** A line's score from White's point of view (Stockfish gives it for the side to move). */
export function lineScore(position: Chess, line?: AnalysisLine): Score {
  const flip = position.turn === "black" ? -1 : 1;
  if (!line) return { cp: 0 };
  return line.mate !== undefined ? { mate: line.mate * flip } : { cp: (line.cp ?? 0) * flip };
}

/** A line's first move, as a chessops move. */
export function lineMove(position: Chess, line?: AnalysisLine): NormalMove | undefined {
  const parsed = line?.pv[0] ? parseUci(line.pv[0]) : undefined;
  return parsed && "from" in parsed ? (normalizeMove(position, parsed) as NormalMove) : undefined;
}

/** Stockfish's lines turned into an evaluation from White's point of view. */
function toEvaluation(position: Chess, lines: AnalysisLine[]): Evaluation {
  const evaluation: Evaluation = { score: lineScore(position, lines[0]), best: lineMove(position, lines[0]) };
  if (lines[1]?.pv.length) {
    evaluation.second = lineMove(position, lines[1]);
    evaluation.secondScore = lineScore(position, lines[1]);
  }
  return evaluation;
}
