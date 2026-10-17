// Stockfish scores positions in the background, one at a time, so every
// move of the game can be rated - like the desktop app's eval thread. The
// list of wanted positions can change at any time (the first ones go first).
import { normalizeMove, type Chess } from "chessops/chess";
import type { NormalMove } from "chessops/types";
import { parseUci } from "chessops/util";

import type { Score } from "./coach";
import { Engine, type AnalysisLine } from "./engine";
import { fenOf, isDrawnPosition, type Evaluation } from "./review";

// How long Stockfish thinks about each position (as the desktop's EVAL_THINK_TIME)
const THINK_TIME = 0.4;

export class Analyser {
  readonly evals = new Map<string, Evaluation>();
  private engine?: Engine;
  private wanted: Chess[] = [];
  private running = false;

  /** Called after each position Stockfish finishes. */
  constructor(private onUpdate: () => void) {}

  /** Positions to score, most urgent first. Replaces the previous list. */
  request(positions: Chess[]) {
    this.wanted = positions.filter((p) => !p.isEnd() && !isDrawnPosition(p));
    if (!this.running) void this.run();
  }

  /** How many of the wanted positions are scored. */
  progress(): { done: number; total: number } {
    const fens = new Set(this.wanted.map(fenOf));
    let done = 0;
    for (const fen of fens) if (this.evals.has(fen)) done++;
    return { done, total: fens.size };
  }

  private async run() {
    this.running = true;
    try {
      for (;;) {
        const position = this.wanted.find((p) => !this.evals.has(fenOf(p)));
        if (!position) break;
        this.engine ??= new Engine();
        const fen = fenOf(position);
        const lines = await this.engine.analyse(fen, THINK_TIME * 1000, 2);
        this.evals.set(fen, toEvaluation(position, lines));
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
