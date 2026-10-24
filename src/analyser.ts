// Stockfish scores positions in the background so every move of the game
// can be rated - like the desktop app's eval thread. Several copies of
// Stockfish work side by side (one per spare processor core, up to three),
// each taking the next position nobody is working on, so a whole game is
// checked in a fraction of the time. The list of wanted positions can change
// at any time (the first ones go first).
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

// How deep Stockfish looks at each position: a fixed depth, so the same game
// gets the same ratings every time and on every device (thinking for a fixed
// time instead depends on how fast and how busy the device is). The time is
// only a safety limit for the odd position that takes much longer.
const THINK_DEPTH = 12;
const THINK_LIMIT = 4.0;
// ...deeper for the second look at inaccuracies, mistakes and sacrifices
const DEEP_DEPTH = 16;
const DEEP_LIMIT = 12.0;
// ...and for what happens if an offered piece is taken
const POISON_DEPTH = 14;
const POISON_LIMIT = 8.0;

// How many copies of Stockfish work at once: the spare cores, at most three
const POOL = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));

type Job =
  | { kind: "eval"; position: Chess; fens: string[] }
  | { kind: "move"; move: DeepMove; fens: string[] }
  | { kind: "deep"; position: Chess; fens: string[] };

/** What Stockfish found for a game's positions, kept so the game opens at
 *  once next time (the searches are fixed-depth, so the results are the same). */
export interface SavedAnalysis {
  evals: [string, Evaluation][];
  deep: string[];
  poisoned: string[];
}

export class Analyser {
  readonly evals = new Map<string, Evaluation>();
  private readonly deepDone = new Set<string>();
  private readonly engines: Engine[] = [];
  private readonly claimed = new Set<string>(); // positions a copy of Stockfish is working on
  private readonly busy = new Set<Engine>(); // the copies working right now
  private wanted: Chess[] = [];
  private deepWanted: Chess[] = [];
  private deepMoves: DeepMove[] = [];
  private readonly poisoned = new Set<string>(); // "fen uci" of moves offering a piece that can't be taken

  /** Called after each position Stockfish finishes. */
  constructor(private onUpdate: () => void) {}

  /** Positions to score, most urgent first. Replaces the previous list. */
  request(positions: Chess[]) {
    this.wanted = positions.filter((p) => !p.isEnd() && !isDrawnPosition(p));
    this.start();
  }

  /** Positions to look at again, for longer (after the normal ones). */
  requestDeep(positions: Chess[]) {
    this.deepWanted = positions.filter((p) => !p.isEnd() && !isDrawnPosition(p) && !this.deepDone.has(fenOf(p)));
    this.start();
  }

  /** Moves to look at again, the fair way: the best move and the played
   *  move scored in the same search from the position before, so both are
   *  judged at the same depth. (Two separate searches - before and after -
   *  can disagree enough to turn a good move into an "inaccuracy".) */
  requestDeepMoves(moves: DeepMove[]) {
    this.deepMoves = moves.filter((m) => !m.after.isEnd() && !isDrawnPosition(m.after) && !this.deepDone.has(fenOf(m.after)));
    this.start();
  }

  /** The results for these positions, to keep. */
  save(fens: Set<string>): SavedAnalysis {
    return {
      evals: [...this.evals].filter(([fen]) => fens.has(fen)),
      deep: [...this.deepDone].filter((fen) => fens.has(fen)),
      poisoned: [...this.poisoned].filter((key) => fens.has(key.slice(0, key.lastIndexOf(" ")))),
    };
  }

  /** Results kept from before: a game opened again. */
  restore(saved: SavedAnalysis) {
    for (const [fen, evaluation] of saved.evals) this.evals.set(fen, evaluation);
    for (const fen of saved.deep) this.deepDone.add(fen);
    for (const key of saved.poisoned) this.poisoned.add(key);
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

  /** Put idle copies of Stockfish to work, while there's work for them. */
  private start() {
    while (this.peek()) {
      let engine = this.engines.find((e) => !this.busy.has(e));
      if (!engine) {
        if (this.engines.length >= POOL) break;
        engine = new Engine();
        this.engines.push(engine);
      }
      this.busy.add(engine);
      void this.work(engine); // claims its first job before returning here
    }
  }

  /** The next job nobody is working on: the wanted positions first (in
   *  order), then the second looks at moves, then at positions. */
  private peek(): Job | undefined {
    const free = (fens: string[]) => fens.every((fen) => !this.claimed.has(fen));
    for (const position of this.wanted) {
      const fen = fenOf(position);
      if (!this.evals.has(fen) && free([fen])) return { kind: "eval", position, fens: [fen] };
    }
    for (const move of this.deepMoves) {
      const fens = [fenOf(move.before), fenOf(move.after)];
      if (!this.deepDone.has(fens[1]) && free(fens)) return { kind: "move", move, fens };
    }
    for (const position of this.deepWanted) {
      const fen = fenOf(position);
      if (!this.deepDone.has(fen) && free([fen])) return { kind: "deep", position, fens: [fen] };
    }
    return undefined;
  }

  private async work(engine: Engine) {
    try {
      for (let job = this.peek(); job; job = this.peek()) {
        for (const fen of job.fens) this.claimed.add(fen);
        try {
          await this.do(engine, job);
        } finally {
          for (const fen of job.fens) this.claimed.delete(fen);
        }
        this.onUpdate();
      }
    } finally {
      this.busy.delete(engine);
    }
  }

  private async do(engine: Engine, job: Job) {
    if (job.kind === "eval") {
      const fen = job.fens[0];
      await engine.newGame(); // a clean memory: the same answer whatever was looked at before
      const lines = await engine.analyse(fen, THINK_LIMIT * 1000, 2, undefined, THINK_DEPTH);
      if (!this.evals.has(fen) || !this.deepDone.has(fen)) this.evals.set(fen, toEvaluation(job.position, lines));
      return;
    }
    if (job.kind === "deep") {
      const fen = job.fens[0];
      await engine.newGame();
      const lines = await engine.analyse(fen, DEEP_LIMIT * 1000, 2, undefined, DEEP_DEPTH);
      this.evals.set(fen, toEvaluation(job.position, lines));
      this.deepDone.add(fen);
      return;
    }
    const pending = job.move;
    const [beforeFen, afterFen] = job.fens;
    if (!this.deepDone.has(beforeFen)) {
      await engine.newGame();
      const lines = await engine.analyse(beforeFen, DEEP_LIMIT * 1000, 2, undefined, DEEP_DEPTH);
      this.evals.set(beforeFen, toEvaluation(pending.before, lines));
      this.deepDone.add(beforeFen);
    }
    // the played move, searched from the same position for the same time
    await engine.newGame();
    const [played] = await engine.analyse(beforeFen, DEEP_LIMIT * 1000, 1, [standardUci(pending.before, pending.move)], DEEP_DEPTH);
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
        await engine.newGame();
        const [taking] = await engine.analyse(afterFen, POISON_LIMIT * 1000, 1, takes, POISON_DEPTH);
        const taker = pending.after.turn;
        const best = winningChance(previous.score, taker);
        if (taking && best - winningChance(lineScore(pending.after, taking), taker) >= POISON_DROP) {
          this.poisoned.add(`${beforeFen} ${makeUci(pending.move)}`);
        }
      }
    }
    this.deepDone.add(afterFen);
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
