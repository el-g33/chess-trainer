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
import { parseUci } from "chessops/util";

import type { Score } from "./coach";
import { Engine, type AnalysisLine } from "./engine";
import { fenOf, isDrawnPosition, type Evaluation } from "./review";

// How long Stockfish thinks about each position (as the desktop's EVAL_THINK_TIME)
const THINK_TIME = 0.4;
// ...and for the second look at positions behind a Mistake, Blunder or Miss
const DEEP_TIME = 2.0;

export class Analyser {
  readonly evals = new Map<string, Evaluation>();
  private readonly deepDone = new Set<string>();
  private engine?: Engine;
  private wanted: Chess[] = [];
  private deepWanted: Chess[] = [];
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
